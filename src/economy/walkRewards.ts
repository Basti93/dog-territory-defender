import { Walk } from '../types';
import { log } from '../utils/log';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { PersonalStatsRepository } from '../storage/PersonalStatsRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { calendarDayKey } from '../utils/manualWalkLog';
import { awardWalkTreats, awardWalkXp, DenEconomyState, getUpgradeTease, UpgradeTease } from './denEconomy';
import { AchievementId, recordTreatsEarned, recordWalkClosed } from './personalStats';
import { BALANCE } from './balanceConfig';

/**
 * Per-day diminishing-returns multiplier for the flat parts of a walk's
 * reward (the treat payout, and the XP flat base only — never the
 * distance/area XP terms). Defends against two exploits measured in
 * openspec/changes/virtual-dog-companion/design.md's "Exploits" table
 * (Decisions > "Degenerate-exploit mitigations..."):
 *   - closing many tiny real-GPS loops back-to-back — twenty 100m loops/hour
 *     measured at 2.7x XP / 10x treats vs. an honest walking hour, and
 *   - repeatedly tapping "Log a walk we missed" (App.tsx's logMissedWalk),
 *     which has a today/yesterday look-back window but no rate limit and
 *     routes into this same reward function — measured at ~150x treats/hour.
 * Index 0 = the 1st walk/log of the local calendar day. Walks 1-3 always pay
 * full value, so an honest 1-3-walk/day owner never sees a discount; the 4th+
 * pay less, with the 6th and every one after clamped to the floor (0.1).
 * Same multiplier and same day-boundary rule for a GPS-tracked walk close and
 * a manual log — per walk-start-notifications' "no lesser treatment for a
 * manual log" guardrail, both routes must be worth the same.
 */
const DAILY_REWARD_MULTIPLIERS = [1, 1, 1, 0.5, 0.25, 0.1] as const;

function dailyRewardMultiplier(walkOrderToday: number): number {
  const index = Math.min(walkOrderToday - 1, DAILY_REWARD_MULTIPLIERS.length - 1);
  return DAILY_REWARD_MULTIPLIERS[Math.max(0, index)];
}

/**
 * This walk/log's 1-indexed position among today's rewarded walks: counts
 * already-closed walks (tracked or manual-log) in the repository that share
 * this walk's local calendar day, then adds one for this walk itself.
 * Excludes this walk by id so it doesn't matter whether the caller already
 * saved it before calling awardWalkRewards (both App.tsx call sites do,
 * one awaited and one fire-and-forget).
 */
async function walkOrderForDay(walk: Walk, walkRepository: WalkRepository): Promise<number> {
  const allWalks = await walkRepository.getWalks();
  const targetDay = calendarDayKey(walk.startTime);
  const priorWalksToday = allWalks.filter(
    (w) => w.id !== walk.id && w.closed && calendarDayKey(w.startTime) === targetDay
  ).length;
  return priorWalksToday + 1;
}

export interface WalkRewardsCelebration {
  areaM2: number;
  /** False for a manually-logged walk — no real GPS trail means no honest territory polygon. Drives CelebrationScreen copy. */
  hasTerritory: boolean;
  treatsEarned: number;
  tease: UpgradeTease | null;
  unlockedAchievements: AchievementId[];
  leveledUpTo: number | null;
}

export interface AwardWalkRewardsResult {
  denEconomyState: DenEconomyState;
  newlyUnlockedAchievements: AchievementId[];
  celebration: WalkRewardsCelebration;
}

export interface AwardWalkRewardsDeps {
  denEconomyRepository: DenEconomyRepository;
  personalStatsRepository: PersonalStatsRepository;
  walkRepository: WalkRepository;
}

/**
 * The reward path for a walk that's ready to be rewarded — treats, XP,
 * personal stats, achievements. Shared by both a normally-closed tracked
 * walk (App.tsx's stopWalk) and a manually-logged walk (App.tsx's
 * logMissedWalk): a manual log passes distanceMeters/areaM2 as 0 (no real
 * GPS trail), which awardWalkXp/recordWalkClosed already treat correctly —
 * the walk still earns the same flat per-walk treats and the XP formula's
 * flat per-walk base component. See
 * openspec/changes/walk-start-notifications/design.md's "existing
 * closed-walk reward logic needs extracting" decision.
 *
 * Also applies the per-day diminishing-returns multiplier (see
 * DAILY_REWARD_MULTIPLIERS above) to both routes identically, since both are
 * equally exploitable and both are supposed to be worth the same.
 */
export async function awardWalkRewards(
  walk: Walk,
  distanceMeters: number,
  areaM2: number,
  deps: AwardWalkRewardsDeps
): Promise<AwardWalkRewardsResult> {
  const { denEconomyRepository, personalStatsRepository, walkRepository } = deps;

  const walkOrderToday = await walkOrderForDay(walk, walkRepository);
  const multiplier = dailyRewardMultiplier(walkOrderToday);
  const treatsAwarded = Math.round(BALANCE.treatsPerWalk * multiplier);

  const denState = await denEconomyRepository.getState();
  const rewarded = awardWalkTreats(denState, multiplier);
  log('TREATS_AWARD', {
    walkId: walk.id,
    startSource: walk.startSource,
    amount: treatsAwarded,
    walkOrderToday,
    dailyMultiplier: multiplier,
    before: denState.treats,
    after: rewarded.treats,
  });

  const personalStats = await personalStatsRepository.getState();
  const walkResult = recordWalkClosed(personalStats, walk);
  const treatsResult = recordTreatsEarned(walkResult.stats, treatsAwarded);
  const newlyUnlockedAchievements = [...walkResult.newlyUnlocked, ...treatsResult.newlyUnlocked];
  await personalStatsRepository.saveState(treatsResult.stats);
  if (newlyUnlockedAchievements.length > 0) {
    await personalStatsRepository.unlockAchievements(newlyUnlockedAchievements, Date.now());
  }

  const { state: leveledState, leveledUp } = awardWalkXp(rewarded, distanceMeters, areaM2, multiplier);
  log('XP_AWARD', {
    walkId: walk.id,
    startSource: walk.startSource,
    xp: leveledState.xp,
    level: leveledState.level,
    leveledUp,
    walkOrderToday,
    dailyMultiplier: multiplier,
  });
  await denEconomyRepository.saveState(leveledState);

  return {
    denEconomyState: leveledState,
    newlyUnlockedAchievements,
    celebration: {
      areaM2,
      hasTerritory: walk.territory !== undefined,
      treatsEarned: treatsAwarded,
      tease: getUpgradeTease(leveledState),
      unlockedAchievements: newlyUnlockedAchievements,
      leveledUpTo: leveledUp ? leveledState.level : null,
    },
  };
}

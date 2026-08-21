import { Walk } from '../types';
import { log } from '../utils/log';
import { cumulativeDistance } from '../utils/geometry';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { PersonalStatsRepository } from '../storage/PersonalStatsRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { calendarDayKey } from '../utils/manualWalkLog';
import { awardWalkTreats, awardWalkXp, DenEconomyState, getUpgradeTease, UpgradeTease } from './denEconomy';
import { buddyTreatsPerWalk, xpAwardForWalk } from './formulas';
import { shouldFireCliffhanger, titleForLevel } from './milestones';
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

/**
 * "Trailing 5-walk average XP" yardstick for the one-away cliffhanger (see
 * economy/milestones.ts's shouldFireCliffhanger and design.md's "falls back
 * to 82.5 XP before 5 walks exist" decision). Includes this walk's own
 * (undiscounted) XP award plus up to 4 prior closed walks — mirroring
 * walkOrderForDay's pattern above of excluding this walk by id from the
 * repository scan (it may not be persisted yet for a tracked walk close;
 * both call sites in App.tsx save the walk before or without awaiting
 * relative to this reward path) and supplying its own distance/area
 * directly instead. Judgment call, since design.md doesn't pin down whether
 * the average should use each walk's real (post-daily-multiplier) awarded
 * XP or its full undiscounted potential — this uses the latter, consistent
 * with design.md's own worked examples always using the undiscounted
 * "typical walk" value (82.5 XP).
 */
async function trailingAverageXp(
  walkRepository: WalkRepository,
  walk: Walk,
  currentDistanceMeters: number,
  currentAreaM2: number
): Promise<number> {
  const allWalks = await walkRepository.getWalks();
  const priorClosed = allWalks
    .filter((w) => w.closed && w.id !== walk.id)
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, 4);

  const samples = [
    xpAwardForWalk(currentDistanceMeters, currentAreaM2),
    ...priorClosed.map((w) => xpAwardForWalk(cumulativeDistance(w.locations), w.territory?.area ?? 0)),
  ];

  if (samples.length < 5) {
    return BALANCE.leveling.cliffhangerFallbackXp;
  }
  return samples.reduce((sum, xp) => sum + xp, 0) / samples.length;
}

export interface WalkRewardsCelebration {
  areaM2: number;
  /** False for a manually-logged walk — no real GPS trail means no honest territory polygon. Drives CelebrationScreen copy. */
  hasTerritory: boolean;
  treatsEarned: number;
  tease: UpgradeTease | null;
  unlockedAchievements: AchievementId[];
  leveledUpTo: number | null;
  /** Buddy's treats-per-walk rate *before* this walk's own level-up (the "up from K" half of the level-up beat). Null whenever leveledUpTo is null. */
  oldTreatsPerWalk: number | null;
  /** Buddy's treats-per-walk rate at the new level (the "brings home M treats a walk now" half). Null whenever leveledUpTo is null. */
  newTreatsPerWalk: number | null;
  /** The one-away cliffhanger's milestone title ("One more walk and he's a...") when it fires on this walk-close — see economy/milestones.ts. Null otherwise, including when the trigger condition is met but no game-master-authored title exists yet for that milestone (tasks.md task 5.3). */
  cliffhangerTitle: string | null;
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

  const denState = await denEconomyRepository.getState();
  const levelBeforeThisWalk = denState.level;
  // awardWalkTreats reads state.level/sniffGardenLevel as they stood before
  // this walk's own awardWalkXp call below, so a level-up earned on this
  // very walk changes the rate starting next walk, not retroactively (see
  // denEconomy.ts's awardWalkTreats and tasks.md task 10.2). Its returned
  // treatsAwarded is the single source of truth for the celebration/log/
  // stats figure — tasks.md task 3.4's de-duplication fix.
  const { state: rewarded, treatsAwarded } = awardWalkTreats(denState, multiplier);
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

  // One-away cliffhanger ("One more walk and he's a [Title]") — only
  // considered on a walk that did NOT itself level up (a level-up already
  // has its own beat), only once per approaching milestone level
  // (cliffhangerShownForLevel bookkeeping), and only when real
  // game-master-authored title copy exists for that milestone (see
  // economy/milestones.ts — MILESTONE_TITLES is empty until then, so this
  // is currently inert by design, not a bug).
  let finalState = leveledState;
  let cliffhangerTitle: string | null = null;
  if (!leveledUp && leveledState.level < BALANCE.leveling.maxLevel) {
    const nextLevel = leveledState.level + 1;
    const title = titleForLevel(nextLevel);
    if (title && leveledState.cliffhangerShownForLevel !== nextLevel) {
      const trailingAvg = await trailingAverageXp(walkRepository, walk, distanceMeters, areaM2);
      if (shouldFireCliffhanger(leveledState.level, leveledState.xp, trailingAvg)) {
        cliffhangerTitle = title;
        finalState = { ...leveledState, cliffhangerShownForLevel: nextLevel };
      }
    }
  }

  await denEconomyRepository.saveState(finalState);

  const oldTreatsPerWalk = leveledUp ? buddyTreatsPerWalk(levelBeforeThisWalk, finalState.sniffGardenLevel) : null;
  const newTreatsPerWalk = leveledUp ? buddyTreatsPerWalk(finalState.level, finalState.sniffGardenLevel) : null;

  return {
    denEconomyState: finalState,
    newlyUnlockedAchievements,
    celebration: {
      areaM2,
      hasTerritory: walk.territory !== undefined,
      treatsEarned: treatsAwarded,
      tease: getUpgradeTease(finalState),
      unlockedAchievements: newlyUnlockedAchievements,
      leveledUpTo: leveledUp ? finalState.level : null,
      oldTreatsPerWalk,
      newTreatsPerWalk,
      cliffhangerTitle,
    },
  };
}

import { Walk } from '../types';
import { log } from '../utils/log';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { PersonalStatsRepository } from '../storage/PersonalStatsRepository';
import { awardWalkTreats, awardWalkXp, DenEconomyState, getUpgradeTease, UpgradeTease } from './denEconomy';
import { AchievementId, recordTreatsEarned, recordWalkClosed } from './personalStats';
import { BALANCE } from './balanceConfig';

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
 */
export async function awardWalkRewards(
  walk: Walk,
  distanceMeters: number,
  areaM2: number,
  deps: AwardWalkRewardsDeps
): Promise<AwardWalkRewardsResult> {
  const { denEconomyRepository, personalStatsRepository } = deps;

  const denState = await denEconomyRepository.getState();
  const rewarded = awardWalkTreats(denState);
  log('TREATS_AWARD', {
    walkId: walk.id,
    startSource: walk.startSource,
    amount: BALANCE.treatsPerWalk,
    before: denState.treats,
    after: rewarded.treats,
  });

  const personalStats = await personalStatsRepository.getState();
  const walkResult = recordWalkClosed(personalStats, walk);
  const treatsResult = recordTreatsEarned(walkResult.stats, BALANCE.treatsPerWalk);
  const newlyUnlockedAchievements = [...walkResult.newlyUnlocked, ...treatsResult.newlyUnlocked];
  await personalStatsRepository.saveState(treatsResult.stats);
  if (newlyUnlockedAchievements.length > 0) {
    await personalStatsRepository.unlockAchievements(newlyUnlockedAchievements, Date.now());
  }

  const { state: leveledState, leveledUp } = awardWalkXp(rewarded, distanceMeters, areaM2);
  log('XP_AWARD', {
    walkId: walk.id,
    startSource: walk.startSource,
    xp: leveledState.xp,
    level: leveledState.level,
    leveledUp,
  });
  await denEconomyRepository.saveState(leveledState);

  return {
    denEconomyState: leveledState,
    newlyUnlockedAchievements,
    celebration: {
      areaM2,
      hasTerritory: walk.territory !== undefined,
      treatsEarned: BALANCE.treatsPerWalk,
      tease: getUpgradeTease(leveledState),
      unlockedAchievements: newlyUnlockedAchievements,
      leveledUpTo: leveledUp ? leveledState.level : null,
    },
  };
}

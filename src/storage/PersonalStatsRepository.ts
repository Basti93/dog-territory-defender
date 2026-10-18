import { AchievementId, PersonalStatsState } from '../economy/personalStats';

export type { PersonalStatsState };

export interface UnlockedAchievement {
  id: AchievementId;
  unlockedAt: number;
}

export interface PersonalStatsRepository {
  getState(): Promise<PersonalStatsState>;
  saveState(state: PersonalStatsState): Promise<void>;
  getUnlockedAchievements(): Promise<UnlockedAchievement[]>;
  unlockAchievements(ids: AchievementId[], unlockedAt: number): Promise<void>;
  /** Backup & Restore only: wipes all unlocked achievements, then writes exactly the given ones (original unlockedAt preserved). */
  replaceUnlockedAchievements(list: UnlockedAchievement[]): Promise<void>;
}

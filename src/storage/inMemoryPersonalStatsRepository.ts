import { AchievementId, defaultPersonalStatsState, PersonalStatsState } from '../economy/personalStats';
import { PersonalStatsRepository, UnlockedAchievement } from './PersonalStatsRepository';

export function createInMemoryPersonalStatsRepository(): PersonalStatsRepository {
  let state: PersonalStatsState | null = null;
  const unlocked = new Map<AchievementId, UnlockedAchievement>();

  return {
    async getState(): Promise<PersonalStatsState> {
      if (!state) {
        state = defaultPersonalStatsState();
      }
      return state;
    },

    async saveState(next: PersonalStatsState): Promise<void> {
      state = next;
    },

    async getUnlockedAchievements(): Promise<UnlockedAchievement[]> {
      return Array.from(unlocked.values()).sort((a, b) => a.unlockedAt - b.unlockedAt);
    },

    async replaceUnlockedAchievements(list: UnlockedAchievement[]): Promise<void> {
      unlocked.clear();
      for (const a of list) unlocked.set(a.id, { ...a });
    },

    async unlockAchievements(ids: AchievementId[], unlockedAt: number): Promise<void> {
      for (const id of ids) {
        if (!unlocked.has(id)) {
          unlocked.set(id, { id, unlockedAt });
        }
      }
    },
  };
}

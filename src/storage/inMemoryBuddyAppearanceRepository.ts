import { BuddyAppearance, defaultBuddyAppearance, normalizeAppearance } from '../buddy/buddyAppearance';
import { BuddyAppearanceRepository } from './BuddyAppearanceRepository';

export function createInMemoryBuddyAppearanceRepository(): BuddyAppearanceRepository {
  let saved: BuddyAppearance | null = null;

  return {
    async getAppearance(): Promise<BuddyAppearance> {
      return saved ? { ...saved } : defaultBuddyAppearance();
    },
    async saveAppearance(appearance: BuddyAppearance): Promise<void> {
      saved = normalizeAppearance(appearance);
    },
    async reset(): Promise<void> {
      saved = null;
    },
    async hasChosen(): Promise<boolean> {
      return saved !== null;
    },
  };
}

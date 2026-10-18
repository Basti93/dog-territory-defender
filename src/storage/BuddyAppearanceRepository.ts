import { BuddyAppearance } from '../buddy/buddyAppearance';

export interface BuddyAppearanceRepository {
  /** Never fails for "nothing saved": returns the default appearance. */
  getAppearance(): Promise<BuddyAppearance>;
  saveAppearance(appearance: BuddyAppearance): Promise<void>;
  /** True once saveAppearance has been called at least once. */
  hasChosen(): Promise<boolean>;
  /** Forgets any saved look: back to the default and hasChosen false (backup restore). */
  reset(): Promise<void>;
}

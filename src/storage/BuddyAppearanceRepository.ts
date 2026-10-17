import { BuddyAppearance } from '../buddy/buddyAppearance';

export interface BuddyAppearanceRepository {
  /** Never fails for "nothing saved": returns the default appearance. */
  getAppearance(): Promise<BuddyAppearance>;
  saveAppearance(appearance: BuddyAppearance): Promise<void>;
  /** True once saveAppearance has been called at least once. */
  hasChosen(): Promise<boolean>;
}

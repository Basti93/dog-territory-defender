import { LocalePreference } from '../i18n/types';

export interface SettingsRepository {
  /** Never fails for "nothing saved": returns 'system'. */
  getLocalePreference(): Promise<LocalePreference>;
  saveLocalePreference(pref: LocalePreference): Promise<void>;
  /** First-launch onboarding (cards + permission primer) finished. Never fails: returns false when nothing saved. */
  getOnboardingDone(): Promise<boolean>;
  saveOnboardingDone(done: boolean): Promise<void>;
  /** Wild Extras (cosmetic yard cameos): local ISO day each extra last played. Never fails: returns {} when nothing saved. */
  getWildExtrasLastShown(): Promise<Record<string, string>>;
  saveWildExtrasLastShown(lastShown: Record<string, string>): Promise<void>;
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return value === 'en' || value === 'de' || value === 'system' ? value : 'system';
}

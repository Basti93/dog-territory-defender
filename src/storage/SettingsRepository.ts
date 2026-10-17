import { LocalePreference } from '../i18n/types';

export interface SettingsRepository {
  /** Never fails for "nothing saved": returns 'system'. */
  getLocalePreference(): Promise<LocalePreference>;
  saveLocalePreference(pref: LocalePreference): Promise<void>;
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return value === 'en' || value === 'de' || value === 'system' ? value : 'system';
}

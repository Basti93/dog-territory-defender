import { LocalePreference } from '../i18n/types';
import { normalizeLocalePreference, SettingsRepository } from './SettingsRepository';

export function createInMemorySettingsRepository(): SettingsRepository {
  let localePreference: LocalePreference = 'system';
  let onboardingDone = false;
  return {
    async getLocalePreference() {
      return localePreference;
    },
    async saveLocalePreference(pref) {
      localePreference = normalizeLocalePreference(pref);
    },
    async getOnboardingDone() {
      return onboardingDone;
    },
    async saveOnboardingDone(done) {
      onboardingDone = done === true;
    },
  };
}

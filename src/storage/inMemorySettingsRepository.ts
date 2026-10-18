import { LocalePreference } from '../i18n/types';
import { normalizeLastShown } from '../components/den/wildExtras';
import { normalizeLocalePreference, SettingsRepository } from './SettingsRepository';

export function createInMemorySettingsRepository(): SettingsRepository {
  let localePreference: LocalePreference = 'system';
  let onboardingDone = false;
  let wildExtrasLastShown: Record<string, string> = {};
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
    async getWildExtrasLastShown() {
      return { ...wildExtrasLastShown };
    },
    async saveWildExtrasLastShown(lastShown) {
      wildExtrasLastShown = normalizeLastShown(lastShown);
    },
  };
}

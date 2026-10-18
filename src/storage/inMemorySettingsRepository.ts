import { LocalePreference } from '../i18n/types';
import { normalizeLastShown } from '../components/den/wildExtras';
import { normalizeLocalePreference, normalizeSyncIdentity, SettingsRepository, SyncIdentity } from './SettingsRepository';

export function createInMemorySettingsRepository(): SettingsRepository {
  let localePreference: LocalePreference = 'system';
  let onboardingDone = false;
  let wildExtrasLastShown: Record<string, string> = {};
  let syncIdentity: SyncIdentity | null = null;
  let logShippingEnabled = true;
  return {
    async getSyncIdentity() {
      return syncIdentity ? { ...syncIdentity } : null;
    },
    async saveSyncIdentity(identity) {
      syncIdentity = normalizeSyncIdentity(identity);
    },
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
    async getLogShippingEnabled() {
      return logShippingEnabled;
    },
    async saveLogShippingEnabled(enabled) {
      logShippingEnabled = enabled !== false;
    },
  };
}

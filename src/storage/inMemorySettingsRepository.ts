import { DIARY_SEEN_NONE, DiarySeen, normalizeDiarySeen } from '../walks/walkDiary';
import { LocalePreference } from '../i18n/types';
import { normalizeLastShown } from '../components/den/wildExtras';
import { normalizeLocalePreference, normalizeShownWalkIds, normalizeSyncIdentity, SettingsRepository, SyncIdentity } from './SettingsRepository';

export function createInMemorySettingsRepository(): SettingsRepository {
  let localePreference: LocalePreference = 'system';
  let onboardingDone = false;
  let wildExtrasLastShown: Record<string, string> = {};
  let syncIdentity: SyncIdentity | null = null;
  let logShippingEnabled = true;
  let autoFinishEnabled = true;
  let liveShareEnabled = false;
  let liveSharePromptShown = false;
  let batteryHintShown = false;
  let dogPhotoConsent = false;
  let incomeBeatShown: { day: string; rate: number } | null = null;
  let shownPartnerWalkIds: string[] = [];
  let diarySeen: DiarySeen = { ...DIARY_SEEN_NONE };
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
    async getAutoFinishEnabled() {
      return autoFinishEnabled;
    },
    async saveAutoFinishEnabled(enabled) {
      autoFinishEnabled = enabled !== false;
    },
    async getLogShippingEnabled() {
      return logShippingEnabled;
    },
    async saveLogShippingEnabled(enabled) {
      logShippingEnabled = enabled !== false;
    },
    async getLiveShareEnabled() {
      return liveShareEnabled;
    },
    async saveLiveShareEnabled(enabled) {
      liveShareEnabled = enabled === true;
    },
    async getDogPhotoConsent() {
      return dogPhotoConsent;
    },
    async saveDogPhotoConsent(consent) {
      dogPhotoConsent = consent === true;
    },
    async getBatteryHintShown() {
      return batteryHintShown;
    },
    async saveBatteryHintShown(shown) {
      batteryHintShown = shown === true;
    },
    async getLiveSharePromptShown() {
      return liveSharePromptShown;
    },
    async saveLiveSharePromptShown(shown) {
      liveSharePromptShown = shown === true;
    },
    async getIncomeBeatShown() {
      return incomeBeatShown;
    },
    async saveIncomeBeatShown(shown) {
      incomeBeatShown = { ...shown };
    },
    async getDiarySeen() {
      return { ...diarySeen };
    },
    async saveDiarySeen(seen) {
      diarySeen = normalizeDiarySeen(seen);
    },
    async getShownPartnerWalkIds() {
      return [...shownPartnerWalkIds];
    },
    async saveShownPartnerWalkIds(ids) {
      shownPartnerWalkIds = normalizeShownWalkIds(ids);
    },
  };
}

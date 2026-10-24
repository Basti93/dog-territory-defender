import { LocalePreference } from '../i18n/types';

/** Household sync identity (multiplayer-sync). The token is stored unencrypted in SQLite: accepted for the 2-person test (design.md Decision 9). Never part of the Backup JSON. */
export interface SyncIdentity {
  serverUrl: string;
  token: string;
  householdId: string;
  playerId: string;
  deviceId: string;
  playerName: string;
  householdName?: string;
}

export function normalizeSyncIdentity(value: unknown): SyncIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' && x.length > 0 ? x : null);
  const serverUrl = str(v.serverUrl);
  const token = str(v.token);
  const householdId = str(v.householdId);
  const playerId = str(v.playerId);
  const deviceId = str(v.deviceId);
  if (!serverUrl || !token || !householdId || !playerId || !deviceId) return null;
  return { serverUrl, token, householdId, playerId, deviceId, playerName: typeof v.playerName === 'string' ? v.playerName : '', ...(typeof v.householdName === 'string' ? { householdName: v.householdName } : {}) };
}

export interface SettingsRepository {
  /** Household sync identity, or null when this phone has not joined a household. */
  getSyncIdentity(): Promise<SyncIdentity | null>;
  /** Pass null to disconnect (clears the token; local data stays). */
  saveSyncIdentity(identity: SyncIdentity | null): Promise<void>;
  /** Never fails for "nothing saved": returns 'system'. */
  getLocalePreference(): Promise<LocalePreference>;
  saveLocalePreference(pref: LocalePreference): Promise<void>;
  /** First-launch onboarding (cards + permission primer) finished. Never fails: returns false when nothing saved. */
  getOnboardingDone(): Promise<boolean>;
  saveOnboardingDone(done: boolean): Promise<void>;
  /** Wild Extras (cosmetic yard cameos): local ISO day each extra last played. Never fails: returns {} when nothing saved. */
  getWildExtrasLastShown(): Promise<Record<string, string>>;
  saveWildExtrasLastShown(lastShown: Record<string, string>): Promise<void>;
  /** "Protokoll an den Server senden" (log shipping, only acts while joined). Defaults to true when nothing is saved. */
  getLogShippingEnabled(): Promise<boolean>;
  saveLogShippingEnabled(enabled: boolean): Promise<void>;
  /** "Runde automatisch beenden": finish a walk by itself when back home. Defaults to true when nothing is saved. */
  getAutoFinishEnabled(): Promise<boolean>;
  saveAutoFinishEnabled(enabled: boolean): Promise<void>;
  /** "Runde live teilen": the household partner may see the path while a walk is in progress. OFF by default (nothing is sent until the player says yes). */
  getLiveShareEnabled(): Promise<boolean>;
  saveLiveShareEnabled(enabled: boolean): Promise<void>;
  /** The one-time "may {partner} see your walk live?" question was answered (either way). False until then. */
  getLiveSharePromptShown(): Promise<boolean>;
  saveLiveSharePromptShown(shown: boolean): Promise<void>;
  /** Android only: the one-time "keep walks running in the pocket" battery hint was shown. False until then. */
  getBatteryHintShown(): Promise<boolean>;
  saveBatteryHintShown(shown: boolean): Promise<void>;
  /** The player agreed that dog photos are sent to our server and Google Gemini (EU) for analysis. False until then. */
  getDogPhotoConsent(): Promise<boolean>;
  saveDogPhotoConsent(consent: boolean): Promise<void>;
  /** Ids of partner walks whose mini homecoming already played (newest last, capped by the caller). Returns [] when nothing saved. */
  getShownPartnerWalkIds(): Promise<string[]>;
  saveShownPartnerWalkIds(ids: string[]): Promise<void>;
  /** The last "Euer Boden: 0,4 → 0,5/Std." homecoming beat: local day and the rate it showed. Null until one was shown. */
  getIncomeBeatShown(): Promise<{ day: string; rate: number } | null>;
  saveIncomeBeatShown(shown: { day: string; rate: number }): Promise<void>;
}

/** Defensive read of the stored shown-partner-walk list. */
export function normalizeShownWalkIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return value === 'en' || value === 'de' || value === 'system' ? value : 'system';
}

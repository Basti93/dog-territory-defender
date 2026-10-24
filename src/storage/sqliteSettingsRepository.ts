import * as SQLite from 'expo-sqlite';

import { LocalePreference } from '../i18n/types';
import { normalizeLastShown } from '../components/den/wildExtras';
import { normalizeLocalePreference, normalizeShownWalkIds, normalizeSyncIdentity, SettingsRepository, SyncIdentity } from './SettingsRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const SINGLETON_ID = 'singleton';

// No automated test for this file (no expo-sqlite jest harness in the repo);
// the contract test covers the in-memory fake. Unknown stored values fall
// back to 'system' on read.
export function createSqliteSettingsRepository(dbName: string = DEFAULT_DB_NAME): SettingsRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id TEXT PRIMARY KEY,
        localePreference TEXT NOT NULL
      );
    `);
    // Migration-safe: older installs already have app_settings without this
    // column. SQLite has no ADD COLUMN IF NOT EXISTS, so check first.
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(app_settings)');
    if (!columns.some((c) => c.name === 'onboardingDone')) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN onboardingDone INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.some((c) => c.name === 'wildExtrasLastShown')) {
      await db.execAsync("ALTER TABLE app_settings ADD COLUMN wildExtrasLastShown TEXT NOT NULL DEFAULT '{}'");
    }
    if (!columns.some((c) => c.name === 'syncIdentity')) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN syncIdentity TEXT');
    }
    if (!columns.some((c) => c.name === 'logShipping')) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN logShipping INTEGER NOT NULL DEFAULT 1');
    }
    if (!columns.some((c) => c.name === 'autoFinish')) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN autoFinish INTEGER NOT NULL DEFAULT 1');
    }
    if (!columns.some((c) => c.name === 'liveShare')) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN liveShare INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.some((c) => c.name === 'liveSharePromptShown')) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN liveSharePromptShown INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.some((c) => c.name === 'batteryHintShown')) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN batteryHintShown INTEGER NOT NULL DEFAULT 0');
    }
    if (!columns.some((c) => c.name === 'shownPartnerWalks')) {
      await db.execAsync("ALTER TABLE app_settings ADD COLUMN shownPartnerWalks TEXT NOT NULL DEFAULT '[]'");
    }
    if (!columns.some((c) => c.name === 'incomeBeatShown')) {
      await db.execAsync("ALTER TABLE app_settings ADD COLUMN incomeBeatShown TEXT NOT NULL DEFAULT ''");
    }
    return db;
  });

  return {
    async getSyncIdentity(): Promise<SyncIdentity | null> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ syncIdentity: string | null }>(
        'SELECT syncIdentity FROM app_settings WHERE id = ?',
        SINGLETON_ID
      );
      try {
        return normalizeSyncIdentity(row?.syncIdentity ? JSON.parse(row.syncIdentity) : null);
      } catch {
        return null;
      }
    },

    async saveSyncIdentity(identity: SyncIdentity | null): Promise<void> {
      const db = await dbPromise;
      const normalized = normalizeSyncIdentity(identity);
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, syncIdentity) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET syncIdentity = excluded.syncIdentity`,
        SINGLETON_ID,
        normalized ? JSON.stringify(normalized) : null
      );
    },

    async getLocalePreference(): Promise<LocalePreference> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ localePreference: string }>(
        'SELECT localePreference FROM app_settings WHERE id = ?',
        SINGLETON_ID
      );
      return normalizeLocalePreference(row?.localePreference);
    },

    async saveLocalePreference(pref: LocalePreference): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET localePreference = excluded.localePreference`,
        SINGLETON_ID,
        normalizeLocalePreference(pref)
      );
    },

    async getOnboardingDone(): Promise<boolean> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ onboardingDone: number }>(
        'SELECT onboardingDone FROM app_settings WHERE id = ?',
        SINGLETON_ID
      );
      return row?.onboardingDone === 1;
    },

    async saveOnboardingDone(done: boolean): Promise<void> {
      const db = await dbPromise;
      // The row may not exist yet (no locale saved): insert with the default
      // locale 'system', which is what a missing row reads as anyway.
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, onboardingDone) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET onboardingDone = excluded.onboardingDone`,
        SINGLETON_ID,
        done ? 1 : 0
      );
    },

    async getWildExtrasLastShown(): Promise<Record<string, string>> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ wildExtrasLastShown: string }>(
        'SELECT wildExtrasLastShown FROM app_settings WHERE id = ?',
        SINGLETON_ID
      );
      try {
        return normalizeLastShown(JSON.parse(row?.wildExtrasLastShown ?? '{}'));
      } catch {
        return {};
      }
    },

    async saveWildExtrasLastShown(lastShown: Record<string, string>): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, wildExtrasLastShown) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET wildExtrasLastShown = excluded.wildExtrasLastShown`,
        SINGLETON_ID,
        JSON.stringify(normalizeLastShown(lastShown))
      );
    },

    async getAutoFinishEnabled(): Promise<boolean> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ autoFinish: number }>('SELECT autoFinish FROM app_settings WHERE id = ?', SINGLETON_ID);
      return row ? row.autoFinish !== 0 : true;
    },

    async saveAutoFinishEnabled(enabled: boolean): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, autoFinish) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET autoFinish = excluded.autoFinish`,
        SINGLETON_ID,
        enabled ? 1 : 0
      );
    },

    async getLogShippingEnabled(): Promise<boolean> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ logShipping: number }>('SELECT logShipping FROM app_settings WHERE id = ?', SINGLETON_ID);
      return row ? row.logShipping !== 0 : true;
    },

    async saveLogShippingEnabled(enabled: boolean): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, logShipping) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET logShipping = excluded.logShipping`,
        SINGLETON_ID,
        enabled ? 1 : 0
      );
    },

    async getLiveShareEnabled(): Promise<boolean> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ liveShare: number }>('SELECT liveShare FROM app_settings WHERE id = ?', SINGLETON_ID);
      return row?.liveShare === 1;
    },

    async saveLiveShareEnabled(enabled: boolean): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, liveShare) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET liveShare = excluded.liveShare`,
        SINGLETON_ID,
        enabled ? 1 : 0
      );
    },

    async getLiveSharePromptShown(): Promise<boolean> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ liveSharePromptShown: number }>(
        'SELECT liveSharePromptShown FROM app_settings WHERE id = ?',
        SINGLETON_ID
      );
      return row?.liveSharePromptShown === 1;
    },

    async saveLiveSharePromptShown(shown: boolean): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, liveSharePromptShown) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET liveSharePromptShown = excluded.liveSharePromptShown`,
        SINGLETON_ID,
        shown ? 1 : 0
      );
    },

    async getBatteryHintShown(): Promise<boolean> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ batteryHintShown: number }>(
        'SELECT batteryHintShown FROM app_settings WHERE id = ?',
        SINGLETON_ID
      );
      return row?.batteryHintShown === 1;
    },

    async saveBatteryHintShown(shown: boolean): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, batteryHintShown) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET batteryHintShown = excluded.batteryHintShown`,
        SINGLETON_ID,
        shown ? 1 : 0
      );
    },

    async getIncomeBeatShown(): Promise<{ day: string; rate: number } | null> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ incomeBeatShown: string }>('SELECT incomeBeatShown FROM app_settings WHERE id = ?', SINGLETON_ID);
      const [day, rate] = (row?.incomeBeatShown ?? '').split('|');
      return day && Number.isFinite(Number(rate)) && rate !== '' ? { day, rate: Number(rate) } : null;
    },

    async saveIncomeBeatShown(shown: { day: string; rate: number }): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, incomeBeatShown) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET incomeBeatShown = excluded.incomeBeatShown`,
        SINGLETON_ID,
        `${shown.day}|${shown.rate}`
      );
    },

    async getShownPartnerWalkIds(): Promise<string[]> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ shownPartnerWalks: string }>(
        'SELECT shownPartnerWalks FROM app_settings WHERE id = ?',
        SINGLETON_ID
      );
      try {
        return normalizeShownWalkIds(JSON.parse(row?.shownPartnerWalks ?? '[]'));
      } catch {
        return [];
      }
    },

    async saveShownPartnerWalkIds(ids: string[]): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO app_settings (id, localePreference, shownPartnerWalks) VALUES (?, 'system', ?)
         ON CONFLICT(id) DO UPDATE SET shownPartnerWalks = excluded.shownPartnerWalks`,
        SINGLETON_ID,
        JSON.stringify(normalizeShownWalkIds(ids))
      );
    },
  };
}

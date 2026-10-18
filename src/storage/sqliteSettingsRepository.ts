import * as SQLite from 'expo-sqlite';

import { LocalePreference } from '../i18n/types';
import { normalizeLocalePreference, SettingsRepository } from './SettingsRepository';

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
    return db;
  });

  return {
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
  };
}

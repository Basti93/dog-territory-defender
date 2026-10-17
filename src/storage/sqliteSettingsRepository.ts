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
  };
}

import * as SQLite from 'expo-sqlite';

import { FeedbackPrefs, FeedbackPrefsRepository, normalizeFeedbackPrefs } from './FeedbackPrefsRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const SINGLETON_ID = 'singleton';

// No automated test for this file (no expo-sqlite jest harness in the repo);
// the contract test covers the in-memory fake. Dedicated table so it never
// touches app_settings, which other features own.
export function createSqliteFeedbackPrefsRepository(dbName: string = DEFAULT_DB_NAME): FeedbackPrefsRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS feedback_prefs (
        id TEXT PRIMARY KEY,
        sound INTEGER NOT NULL,
        haptics INTEGER NOT NULL
      );
    `);
    return db;
  });

  return {
    async getPrefs(): Promise<FeedbackPrefs> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ sound: number; haptics: number }>(
        'SELECT sound, haptics FROM feedback_prefs WHERE id = ?',
        SINGLETON_ID
      );
      return normalizeFeedbackPrefs(row ? { sound: row.sound !== 0, haptics: row.haptics !== 0 } : null);
    },

    async savePrefs(prefs: FeedbackPrefs): Promise<void> {
      const db = await dbPromise;
      const p = normalizeFeedbackPrefs(prefs);
      await db.runAsync(
        `INSERT INTO feedback_prefs (id, sound, haptics) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET sound = excluded.sound, haptics = excluded.haptics`,
        SINGLETON_ID,
        p.sound ? 1 : 0,
        p.haptics ? 1 : 0
      );
    },
  };
}

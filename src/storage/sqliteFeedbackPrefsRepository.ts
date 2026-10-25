import * as SQLite from 'expo-sqlite';
import { openSharedDatabase } from './database';

import { FeedbackPrefs, FeedbackPrefsRepository, normalizeFeedbackPrefs } from './FeedbackPrefsRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const SINGLETON_ID = 'singleton';

// No automated test for this file (no expo-sqlite jest harness in the repo);
// the contract test covers the in-memory fake. Dedicated table so it never
// touches app_settings, which other features own.
export function createSqliteFeedbackPrefsRepository(dbName: string = DEFAULT_DB_NAME): FeedbackPrefsRepository {
  const dbPromise = openSharedDatabase(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS feedback_prefs (
        id TEXT PRIMARY KEY,
        sound INTEGER NOT NULL,
        haptics INTEGER NOT NULL
      );
    `);
    // Older installs have the table without `music`; SQLite has no ADD COLUMN IF NOT EXISTS.
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(feedback_prefs)');
    if (!columns.some((c) => c.name === 'music')) {
      await db.execAsync('ALTER TABLE feedback_prefs ADD COLUMN music INTEGER NOT NULL DEFAULT 1');
    }
    return db;
  });

  return {
    async getPrefs(): Promise<FeedbackPrefs> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ sound: number; haptics: number; music: number }>(
        'SELECT sound, haptics, music FROM feedback_prefs WHERE id = ?',
        SINGLETON_ID
      );
      return normalizeFeedbackPrefs(row ? { sound: row.sound !== 0, haptics: row.haptics !== 0, music: row.music !== 0 } : null);
    },

    async savePrefs(prefs: FeedbackPrefs): Promise<void> {
      const db = await dbPromise;
      const p = normalizeFeedbackPrefs(prefs);
      await db.runAsync(
        `INSERT INTO feedback_prefs (id, sound, haptics, music) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET sound = excluded.sound, haptics = excluded.haptics, music = excluded.music`,
        SINGLETON_ID,
        p.sound ? 1 : 0,
        p.haptics ? 1 : 0,
        p.music ? 1 : 0
      );
    },
  };
}

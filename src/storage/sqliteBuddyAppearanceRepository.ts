import * as SQLite from 'expo-sqlite';

import { BuddyAppearance, defaultBuddyAppearance, normalizeAppearance } from '../buddy/buddyAppearance';
import { BuddyAppearanceRepository } from './BuddyAppearanceRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const SINGLETON_ID = 'singleton';

// No automated test for this file (no expo-sqlite jest harness in the repo);
// the contract test covers the in-memory fake. Unknown stored values are
// normalised on read so removing an option later never crashes.
export function createSqliteBuddyAppearanceRepository(dbName: string = DEFAULT_DB_NAME): BuddyAppearanceRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS buddy_appearance (
        id TEXT PRIMARY KEY,
        coat TEXT NOT NULL,
        markings TEXT NOT NULL,
        earStyle TEXT NOT NULL,
        tailStyle TEXT NOT NULL,
        size TEXT NOT NULL,
        accentColour TEXT NOT NULL
      );
    `);
    return db;
  });

  return {
    async getAppearance(): Promise<BuddyAppearance> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM buddy_appearance WHERE id = ?',
        SINGLETON_ID
      );
      return row ? normalizeAppearance(row) : defaultBuddyAppearance();
    },

    async saveAppearance(appearance: BuddyAppearance): Promise<void> {
      const a = normalizeAppearance(appearance);
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO buddy_appearance (id, coat, markings, earStyle, tailStyle, size, accentColour)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           coat = excluded.coat,
           markings = excluded.markings,
           earStyle = excluded.earStyle,
           tailStyle = excluded.tailStyle,
           size = excluded.size,
           accentColour = excluded.accentColour`,
        SINGLETON_ID,
        a.coat,
        a.markings,
        a.earStyle,
        a.tailStyle,
        a.size,
        a.accentColour
      );
    },

    async hasChosen(): Promise<boolean> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM buddy_appearance WHERE id = ?',
        SINGLETON_ID
      );
      return row !== null && row !== undefined;
    },
  };
}

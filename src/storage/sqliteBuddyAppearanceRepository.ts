import * as SQLite from 'expo-sqlite';

import { BuddyAppearance, defaultBuddyAppearance, normalizeAppearance } from '../buddy/buddyAppearance';
import { BuddyAppearanceRepository } from './BuddyAppearanceRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const SINGLETON_ID = 'singleton';

// No automated test for this file (no expo-sqlite jest harness in the repo);
// the contract test covers the in-memory fake. Unknown stored values are
// normalised on read so removing an option later never crashes.
function parseFur(value: unknown): unknown {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

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
    // Zone-colour look (JSON). Older installs get the column once; legacy rows keep NULL and look as before.
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(buddy_appearance)');
    if (!columns.some((c) => c.name === 'fur')) await db.execAsync('ALTER TABLE buddy_appearance ADD COLUMN fur TEXT');
    return db;
  });

  return {
    async getAppearance(): Promise<BuddyAppearance> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM buddy_appearance WHERE id = ?',
        SINGLETON_ID
      );
      return row ? normalizeAppearance({ ...row, fur: parseFur(row.fur) }) : defaultBuddyAppearance();
    },

    async saveAppearance(appearance: BuddyAppearance): Promise<void> {
      const a = normalizeAppearance(appearance);
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO buddy_appearance (id, coat, markings, earStyle, tailStyle, size, accentColour, fur)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           coat = excluded.coat,
           markings = excluded.markings,
           earStyle = excluded.earStyle,
           tailStyle = excluded.tailStyle,
           size = excluded.size,
           accentColour = excluded.accentColour,
           fur = excluded.fur`,
        SINGLETON_ID,
        a.coat,
        a.markings,
        a.earStyle,
        a.tailStyle,
        a.size,
        a.accentColour,
        a.fur ? JSON.stringify(a.fur) : null
      );
    },

    async reset(): Promise<void> {
      const db = await dbPromise;
      await db.runAsync('DELETE FROM buddy_appearance WHERE id = ?', SINGLETON_ID);
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

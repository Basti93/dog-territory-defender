import * as SQLite from 'expo-sqlite';
import { openSharedDatabase } from './database';
import { runInTransaction } from './dbLock';

import { CornerRepository, cornerCoords, NewCorner, StoredCorner } from './CornerRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';

export function createSqliteCornerRepository(dbName: string = DEFAULT_DB_NAME): CornerRepository {
  const dbPromise = openSharedDatabase(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS corners (
        id TEXT PRIMARY KEY,
        ix INTEGER NOT NULL,
        iy INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        walkId TEXT,
        street TEXT,
        name TEXT,
        nameBy TEXT,
        nameAt INTEGER
      );
    `);
    return db;
  });

  return {
    async getCorners(): Promise<StoredCorner[]> {
      const db = await dbPromise;
      return db.getAllAsync<StoredCorner>('SELECT * FROM corners ORDER BY createdAt ASC, id ASC');
    },

    async addCorners(incoming: NewCorner[]) {
      if (incoming.length === 0) return;
      const db = await dbPromise;
      await runInTransaction(db, async () => {
        for (const c of incoming) {
          await db.runAsync('INSERT OR IGNORE INTO corners (id, ix, iy, createdAt, walkId) VALUES (?, ?, ?, ?, ?)', c.id, c.ix, c.iy, c.createdAt, c.walkId);
        }
      });
    },

    async setStreet(id, street) {
      const db = await dbPromise;
      await db.runAsync('UPDATE corners SET street = ? WHERE id = ?', street, id);
    },

    async setName(id, name, by, at) {
      const db = await dbPromise;
      const { ix, iy } = cornerCoords(id);
      await db.runAsync(
        `INSERT INTO corners (id, ix, iy, createdAt, name, nameBy, nameAt) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, nameBy = excluded.nameBy, nameAt = excluded.nameAt`,
        id,
        ix,
        iy,
        at,
        name,
        by,
        at
      );
    },
  };
}

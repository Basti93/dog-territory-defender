import * as SQLite from 'expo-sqlite';

import { Walk } from '../types';
import { StoredWalk, WalkRepository } from './WalkRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';

interface WalkRow {
  id: string;
  startTime: number;
  closed: number;
  syncedAt: number | null;
  data: string;
}

function rowToStoredWalk(row: WalkRow): StoredWalk {
  const walk: Walk = JSON.parse(row.data);
  return { ...walk, syncedAt: row.syncedAt };
}

export function createSqliteWalkRepository(dbName: string = DEFAULT_DB_NAME): WalkRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS walks (
        id TEXT PRIMARY KEY,
        startTime INTEGER NOT NULL,
        closed INTEGER NOT NULL,
        syncedAt INTEGER,
        data TEXT NOT NULL
      );
    `);
    return db;
  });

  return {
    async saveWalk(walk: Walk): Promise<void> {
      const db = await dbPromise;
      const existing = await db.getFirstAsync<{ syncedAt: number | null }>(
        'SELECT syncedAt FROM walks WHERE id = ?',
        walk.id
      );
      await db.runAsync(
        `INSERT INTO walks (id, startTime, closed, syncedAt, data) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET startTime = excluded.startTime, closed = excluded.closed, data = excluded.data`,
        walk.id,
        walk.startTime,
        walk.closed ? 1 : 0,
        existing?.syncedAt ?? null,
        JSON.stringify(walk)
      );
    },

    async getWalks(): Promise<StoredWalk[]> {
      const db = await dbPromise;
      const rows = await db.getAllAsync<WalkRow>('SELECT * FROM walks ORDER BY startTime DESC');
      return rows.map(rowToStoredWalk);
    },

    async getWalk(id: string): Promise<StoredWalk | null> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<WalkRow>('SELECT * FROM walks WHERE id = ?', id);
      return row ? rowToStoredWalk(row) : null;
    },

    async deleteWalk(id: string): Promise<void> {
      const db = await dbPromise;
      await db.runAsync('DELETE FROM walks WHERE id = ?', id);
    },

    async markSynced(id: string, at: number): Promise<void> {
      const db = await dbPromise;
      await db.runAsync('UPDATE walks SET syncedAt = ? WHERE id = ?', at, id);
    },

    async replaceAll(walks: Walk[]): Promise<void> {
      const db = await dbPromise;
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM walks');
        for (const walk of walks) {
          await db.runAsync(
            'INSERT OR REPLACE INTO walks (id, startTime, closed, syncedAt, data) VALUES (?, ?, ?, NULL, ?)',
            walk.id,
            walk.startTime,
            walk.closed ? 1 : 0,
            JSON.stringify(walk)
          );
        }
      });
    },
  };
}

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

    async getRecentWalks(limit: number): Promise<StoredWalk[]> {
      const db = await dbPromise;
      const rows = await db.getAllAsync<WalkRow>('SELECT * FROM walks ORDER BY startTime DESC LIMIT ?', Math.max(0, Math.floor(limit)));
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

    async countClosedWalks(): Promise<number> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM walks WHERE closed = 1');
      return row?.n ?? 0;
    },

    async getLastWalkEnd(): Promise<{ latitude: number; longitude: number } | null> {
      const db = await dbPromise;
      // Newest first, a few rows at a time: nearly always the first row has fixes, so only that one walk is parsed
      // (a manual log has none and is skipped).
      const PAGE = 10;
      for (let offset = 0; ; offset += PAGE) {
        const rows = await db.getAllAsync<{ data: string }>('SELECT data FROM walks ORDER BY startTime DESC LIMIT ? OFFSET ?', PAGE, offset);
        for (const row of rows) {
          const walk: Walk = JSON.parse(row.data);
          const end = walk.locations[walk.locations.length - 1];
          if (end) return { latitude: end.latitude, longitude: end.longitude };
        }
        if (rows.length < PAGE) return null;
      }
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

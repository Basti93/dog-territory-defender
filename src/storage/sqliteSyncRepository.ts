import * as SQLite from 'expo-sqlite';
import { openSharedDatabase } from './database';
import { runInTransaction } from './dbLock';

import { EMPTY_SYNC_STATE, NewOutboxItem, OutboxItem, SyncRepository, SyncState } from './SyncRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const STATE_ID = 'singleton';

interface OutboxRow {
  id: string;
  kind: string;
  payload: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  deadAt: number | null;
}

function rowToItem(row: OutboxRow): OutboxItem {
  return { ...row, kind: row.kind as OutboxItem['kind'], payload: JSON.parse(row.payload) };
}

// No automated test for this file (no expo-sqlite jest harness in the repo);
// the contract test covers the in-memory fake.
export function createSqliteSyncRepository(dbName: string = DEFAULT_DB_NAME): SyncRepository {
  const dbPromise = openSharedDatabase(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        nextAttemptAt INTEGER NOT NULL DEFAULT 0,
        lastError TEXT,
        deadAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS sync_state (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
    `);
    return db;
  });

  async function readState(): Promise<SyncState> {
    const db = await dbPromise;
    const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM sync_state WHERE id = ?', STATE_ID);
    if (!row) return { ...EMPTY_SYNC_STATE };
    try {
      return { ...EMPTY_SYNC_STATE, ...JSON.parse(row.data) };
    } catch {
      return { ...EMPTY_SYNC_STATE };
    }
  }

  return {
    async enqueue(item: NewOutboxItem) {
      const db = await dbPromise;
      await db.runAsync(
        'INSERT OR IGNORE INTO sync_outbox (id, kind, payload, createdAt) VALUES (?, ?, ?, ?)',
        item.id,
        item.kind,
        JSON.stringify(item.payload),
        item.createdAt
      );
    },
    async getPending() {
      const db = await dbPromise;
      const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM sync_outbox WHERE deadAt IS NULL ORDER BY createdAt ASC, rowid ASC');
      return rows.map(rowToItem);
    },
    async updatePayload(id, payload) {
      const db = await dbPromise;
      await db.runAsync('UPDATE sync_outbox SET payload = ? WHERE id = ?', JSON.stringify(payload), id);
    },
    async remove(id) {
      const db = await dbPromise;
      await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', id);
    },
    async recordFailure(id, error, nextAttemptAt, deadAt) {
      const db = await dbPromise;
      await db.runAsync(
        'UPDATE sync_outbox SET attempts = attempts + 1, lastError = ?, nextAttemptAt = ?, deadAt = ? WHERE id = ?',
        error,
        nextAttemptAt,
        deadAt,
        id
      );
    },
    async counts() {
      const db = await dbPromise;
      const row = await db.getFirstAsync<{ pending: number | null; dead: number | null }>(
        'SELECT SUM(deadAt IS NULL) AS pending, SUM(deadAt IS NOT NULL) AS dead FROM sync_outbox'
      );
      return { pending: row?.pending ?? 0, dead: row?.dead ?? 0 };
    },
    async getState() {
      return readState();
    },
    async saveState(patch) {
      const db = await dbPromise;
      const next = { ...(await readState()), ...patch };
      await db.runAsync(
        `INSERT INTO sync_state (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
        STATE_ID,
        JSON.stringify(next)
      );
    },
    async clear() {
      const db = await dbPromise;
      await runInTransaction(db, async () => {
        await db.runAsync('DELETE FROM sync_outbox');
        await db.runAsync('DELETE FROM sync_state');
      });
    },
  };
}

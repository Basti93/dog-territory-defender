import * as SQLite from 'expo-sqlite';
import { runInTransaction } from './dbLock';

import type { Location } from '../types';
import type { ActiveWalkRepository, ActiveWalkSnapshot } from './ActiveWalkRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const SINGLE_ROW = 1;

interface FixRow {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
}

// No automated test for this file (no expo-sqlite jest harness in the repo); the contract test covers the in-memory
// fake. Tables are created IF NOT EXISTS, so installs from before this feature simply gain them (no migration step).
// Fixes are one row each (append-only inserts), not one JSON blob: a long walk is never rewritten on every flush.
export function createSqliteActiveWalkRepository(dbName: string = DEFAULT_DB_NAME): ActiveWalkRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS active_walk (
        slot INTEGER PRIMARY KEY CHECK (slot = 1),
        id TEXT NOT NULL,
        startTime INTEGER NOT NULL,
        startSource TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS active_walk_fixes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        walkId TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        accuracy REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_active_walk_fixes_walk_time ON active_walk_fixes (walkId, timestamp);
    `);
    return db;
  });

  const insertFix = (db: SQLite.SQLiteDatabase, walkId: string, fix: Location) =>
    db.runAsync(
      'INSERT INTO active_walk_fixes (walkId, latitude, longitude, timestamp, accuracy) VALUES (?, ?, ?, ?, ?)',
      walkId,
      fix.latitude,
      fix.longitude,
      fix.timestamp,
      fix.accuracy
    );

  return {
    async start(meta, locations) {
      const db = await dbPromise;
      await runInTransaction(db, async () => {
        await db.runAsync('DELETE FROM active_walk_fixes');
        await db.runAsync(
          'INSERT OR REPLACE INTO active_walk (slot, id, startTime, startSource) VALUES (?, ?, ?, ?)',
          SINGLE_ROW,
          meta.id,
          meta.startTime,
          meta.startSource
        );
        for (const fix of locations) await insertFix(db, meta.id, fix);
      });
    },

    async appendFixes(walkId, fixes) {
      if (fixes.length === 0) return;
      const db = await dbPromise;
      await runInTransaction(db, async () => {
        const active = await db.getFirstAsync<{ id: string }>('SELECT id FROM active_walk WHERE slot = ?', SINGLE_ROW);
        if (!active || active.id !== walkId) return;
        const newest = await db.getFirstAsync<{ newest: number | null }>(
          'SELECT MAX(timestamp) AS newest FROM active_walk_fixes WHERE walkId = ?',
          walkId
        );
        let newestTimestamp = newest?.newest ?? Number.NEGATIVE_INFINITY;
        for (const fix of fixes) {
          if (fix.timestamp <= newestTimestamp) continue;
          newestTimestamp = fix.timestamp;
          await insertFix(db, walkId, fix);
        }
      });
    },

    async load(): Promise<ActiveWalkSnapshot | null> {
      const db = await dbPromise;
      const meta = await db.getFirstAsync<{ id: string; startTime: number; startSource: string }>(
        'SELECT id, startTime, startSource FROM active_walk WHERE slot = ?',
        SINGLE_ROW
      );
      if (!meta) return null;
      const rows = await db.getAllAsync<FixRow>(
        'SELECT latitude, longitude, timestamp, accuracy FROM active_walk_fixes WHERE walkId = ? ORDER BY seq ASC',
        meta.id
      );
      return {
        meta: { id: meta.id, startTime: meta.startTime, startSource: meta.startSource as ActiveWalkSnapshot['meta']['startSource'] },
        locations: rows,
      };
    },

    async clear() {
      const db = await dbPromise;
      await runInTransaction(db, async () => {
        await db.runAsync('DELETE FROM active_walk_fixes');
        await db.runAsync('DELETE FROM active_walk');
      });
    },
  };
}

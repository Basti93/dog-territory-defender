import * as SQLite from 'expo-sqlite';
import { openSharedDatabase } from './database';
import { runInTransaction } from './dbLock';

import { generateTerritoryId, IncrementTerritoryStatsInput, Territory, TerritoryId, TerritoryRepository } from './TerritoryRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';

interface TerritoryRow {
  id: string;
  name: string;
  createdAt: number;
  walksHere: number;
  treatsEarnedHere: number;
}

function rowToTerritory(row: TerritoryRow): Territory {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    walksHere: row.walksHere,
    treatsEarnedHere: row.treatsEarnedHere,
  };
}

export function createSqliteTerritoryRepository(dbName: string = DEFAULT_DB_NAME): TerritoryRepository {
  const dbPromise = openSharedDatabase(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS territories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        walksHere INTEGER NOT NULL DEFAULT 0,
        treatsEarnedHere REAL NOT NULL DEFAULT 0
      );
    `);
    return db;
  });

  return {
    async getTerritories(): Promise<Territory[]> {
      const db = await dbPromise;
      const rows = await db.getAllAsync<TerritoryRow>('SELECT * FROM territories');
      return rows.map(rowToTerritory);
    },

    async getTerritory(id: TerritoryId): Promise<Territory | null> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<TerritoryRow>('SELECT * FROM territories WHERE id = ?', id);
      return row ? rowToTerritory(row) : null;
    },

    async createTerritory(name: string, createdAt: number): Promise<TerritoryId> {
      const db = await dbPromise;
      const id = generateTerritoryId(createdAt);
      await db.runAsync(
        `INSERT INTO territories (id, name, createdAt, walksHere, treatsEarnedHere) VALUES (?, ?, ?, 0, 0)`,
        id,
        name,
        createdAt
      );
      return id;
    },

    async renameTerritory(id: TerritoryId, name: string): Promise<void> {
      const db = await dbPromise;
      await db.runAsync('UPDATE territories SET name = ? WHERE id = ?', name, id);
    },

    async mergeTerritoryStats(survivorId: TerritoryId, absorbedId: TerritoryId): Promise<void> {
      const db = await dbPromise;
      await runInTransaction(db, async () => {
        const absorbed = await db.getFirstAsync<TerritoryRow>('SELECT * FROM territories WHERE id = ?', absorbedId);
        if (!absorbed) return;
        await db.runAsync(
          `UPDATE territories SET walksHere = walksHere + ?, treatsEarnedHere = treatsEarnedHere + ? WHERE id = ?`,
          absorbed.walksHere,
          absorbed.treatsEarnedHere,
          survivorId
        );
        await db.runAsync('DELETE FROM territories WHERE id = ?', absorbedId);
      });
    },

    async upsertTerritories(incoming: Territory[]): Promise<void> {
      const db = await dbPromise;
      await runInTransaction(db, async () => {
        for (const t of incoming) {
          await db.runAsync(
            `INSERT INTO territories (id, name, createdAt, walksHere, treatsEarnedHere) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name,
               walksHere = MAX(walksHere, excluded.walksHere),
               treatsEarnedHere = MAX(treatsEarnedHere, excluded.treatsEarnedHere)`,
            t.id,
            t.name,
            t.createdAt,
            t.walksHere,
            t.treatsEarnedHere
          );
        }
      });
    },

    async removeTerritories(ids: TerritoryId[]): Promise<void> {
      const db = await dbPromise;
      await runInTransaction(db, async () => {
        for (const id of ids) await db.runAsync('DELETE FROM territories WHERE id = ?', id);
      });
    },

    async replaceAll(territories: Territory[]): Promise<void> {
      const db = await dbPromise;
      await runInTransaction(db, async () => {
        await db.runAsync('DELETE FROM territories');
        for (const t of territories) {
          await db.runAsync(
            'INSERT INTO territories (id, name, createdAt, walksHere, treatsEarnedHere) VALUES (?, ?, ?, ?, ?)',
            t.id,
            t.name,
            t.createdAt,
            t.walksHere,
            t.treatsEarnedHere
          );
        }
      });
    },

    async incrementTerritoryStats(id: TerritoryId, input: IncrementTerritoryStatsInput): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `UPDATE territories SET walksHere = walksHere + ?, treatsEarnedHere = treatsEarnedHere + ? WHERE id = ?`,
        input.walksIncrement,
        input.treatsIncrement,
        id
      );
    },
  };
}

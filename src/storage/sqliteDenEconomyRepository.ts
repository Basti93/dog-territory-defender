import * as SQLite from 'expo-sqlite';

import { defaultDenEconomyState, DenEconomyState } from '../economy/denEconomy';
import { DenEconomyRepository } from './DenEconomyRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const SINGLETON_ID = 'singleton';

interface DenEconomyRow {
  id: string;
  treats: number;
  doghouseLevel: number;
  bakeryLevel: number;
  sniffGardenLevel: number;
  lastTickAt: number;
}

function rowToState(row: DenEconomyRow): DenEconomyState {
  return {
    treats: row.treats,
    doghouseLevel: row.doghouseLevel,
    bakeryLevel: row.bakeryLevel,
    sniffGardenLevel: row.sniffGardenLevel,
    lastTickAt: row.lastTickAt,
  };
}

export function createSqliteDenEconomyRepository(dbName: string = DEFAULT_DB_NAME): DenEconomyRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS den_economy (
        id TEXT PRIMARY KEY,
        treats REAL NOT NULL,
        doghouseLevel INTEGER NOT NULL,
        bakeryLevel INTEGER NOT NULL,
        sniffGardenLevel INTEGER NOT NULL,
        lastTickAt INTEGER NOT NULL
      );
    `);
    return db;
  });

  return {
    async getState(): Promise<DenEconomyState> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<DenEconomyRow>('SELECT * FROM den_economy WHERE id = ?', SINGLETON_ID);
      if (row) {
        return rowToState(row);
      }

      const initial = defaultDenEconomyState(Date.now());
      await db.runAsync(
        `INSERT INTO den_economy (id, treats, doghouseLevel, bakeryLevel, sniffGardenLevel, lastTickAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        SINGLETON_ID,
        initial.treats,
        initial.doghouseLevel,
        initial.bakeryLevel,
        initial.sniffGardenLevel,
        initial.lastTickAt
      );
      return initial;
    },

    async saveState(state: DenEconomyState): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO den_economy (id, treats, doghouseLevel, bakeryLevel, sniffGardenLevel, lastTickAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           treats = excluded.treats,
           doghouseLevel = excluded.doghouseLevel,
           bakeryLevel = excluded.bakeryLevel,
           sniffGardenLevel = excluded.sniffGardenLevel,
           lastTickAt = excluded.lastTickAt`,
        SINGLETON_ID,
        state.treats,
        state.doghouseLevel,
        state.bakeryLevel,
        state.sniffGardenLevel,
        state.lastTickAt
      );
    },
  };
}

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
  xp: number;
  level: number;
}

function rowToState(row: DenEconomyRow): DenEconomyState {
  return {
    treats: row.treats,
    doghouseLevel: row.doghouseLevel,
    bakeryLevel: row.bakeryLevel,
    sniffGardenLevel: row.sniffGardenLevel,
    lastTickAt: row.lastTickAt,
    xp: row.xp,
    level: row.level,
  };
}

// SQLite has no `ADD COLUMN IF NOT EXISTS` — a fresh install's CREATE TABLE
// already includes the column, so the ALTER TABLE below hits a "duplicate
// column" error, which we catch and ignore. Any other error still throws.
async function addColumnIfMissing(db: SQLite.SQLiteDatabase, table: string, columnDef: string): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
  } catch (error) {
    if (!String(error).includes('duplicate column name')) {
      throw error;
    }
  }
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
        lastTickAt INTEGER NOT NULL,
        xp REAL NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1
      );
    `);
    // Migration for rows created before xp/level existed (e.g. an already-installed app).
    await addColumnIfMissing(db, 'den_economy', 'xp REAL NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'den_economy', 'level INTEGER NOT NULL DEFAULT 1');
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
        `INSERT INTO den_economy (id, treats, doghouseLevel, bakeryLevel, sniffGardenLevel, lastTickAt, xp, level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        SINGLETON_ID,
        initial.treats,
        initial.doghouseLevel,
        initial.bakeryLevel,
        initial.sniffGardenLevel,
        initial.lastTickAt,
        initial.xp,
        initial.level
      );
      return initial;
    },

    async saveState(state: DenEconomyState): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO den_economy (id, treats, doghouseLevel, bakeryLevel, sniffGardenLevel, lastTickAt, xp, level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           treats = excluded.treats,
           doghouseLevel = excluded.doghouseLevel,
           bakeryLevel = excluded.bakeryLevel,
           sniffGardenLevel = excluded.sniffGardenLevel,
           lastTickAt = excluded.lastTickAt,
           xp = excluded.xp,
           level = excluded.level`,
        SINGLETON_ID,
        state.treats,
        state.doghouseLevel,
        state.bakeryLevel,
        state.sniffGardenLevel,
        state.lastTickAt,
        state.xp,
        state.level
      );
    },
  };
}

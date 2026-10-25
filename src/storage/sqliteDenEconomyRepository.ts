import * as SQLite from 'expo-sqlite';
import { openSharedDatabase } from './database';

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
  dogName: string | null;
  cliffhangerShownForLevel: number | null;
  homeRangeBackfillComplete: number;
  manualLogDayKey: string | null;
  manualLogCountToday: number;
  routeRefreshDayKey: string | null;
  territoriesBackfillComplete: number;
  territoryIncomeRevealed: number;
  pile: number;
  tapDayKey: string | null;
  tapCount: number;
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
    dogName: row.dogName,
    cliffhangerShownForLevel: row.cliffhangerShownForLevel,
    homeRangeBackfillComplete: row.homeRangeBackfillComplete === 1,
    manualLogDayKey: row.manualLogDayKey,
    manualLogCountToday: row.manualLogCountToday,
    routeRefreshDayKey: row.routeRefreshDayKey,
    territoriesBackfillComplete: row.territoriesBackfillComplete === 1,
    territoryIncomeRevealed: row.territoryIncomeRevealed === 1,
    pile: row.pile ?? 0,
    tapDayKey: row.tapDayKey ?? null,
    tapCount: row.tapCount ?? 0,
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
  const dbPromise = openSharedDatabase(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS den_economy (
        id TEXT PRIMARY KEY,
        treats REAL NOT NULL,
        doghouseLevel INTEGER NOT NULL,
        bakeryLevel INTEGER NOT NULL,
        sniffGardenLevel INTEGER NOT NULL,
        lastTickAt INTEGER NOT NULL,
        xp REAL NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        dogName TEXT,
        cliffhangerShownForLevel INTEGER,
        homeRangeBackfillComplete INTEGER NOT NULL DEFAULT 0,
        manualLogDayKey TEXT,
        manualLogCountToday INTEGER NOT NULL DEFAULT 0,
        routeRefreshDayKey TEXT,
        territoriesBackfillComplete INTEGER NOT NULL DEFAULT 0,
        territoryIncomeRevealed INTEGER NOT NULL DEFAULT 0,
        pile REAL NOT NULL DEFAULT 0,
        tapDayKey TEXT,
        tapCount INTEGER NOT NULL DEFAULT 0
      );
    `);
    // Migration for rows created before xp/level existed (e.g. an already-installed app).
    await addColumnIfMissing(db, 'den_economy', 'xp REAL NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'den_economy', 'level INTEGER NOT NULL DEFAULT 1');
    // Migration for rows created before dogName/cliffhangerShownForLevel existed
    // (docs/decisions/2026-08-21-virtual-dog-companion.md) — both nullable, so an existing
    // row's default is exactly the "not set yet" state (task 1.3's fallback,
    // "cliffhanger not yet shown for any level").
    await addColumnIfMissing(db, 'den_economy', 'dogName TEXT');
    await addColumnIfMissing(db, 'den_economy', 'cliffhangerShownForLevel INTEGER');
    // Migration for rows created before the Home Range backfill flag existed
    // (docs/decisions/2026-08-21-home-range.md) — defaults to 0 ("not backfilled yet"),
    // which is exactly what an existing install needs: it has real walk
    // history sitting unbackfilled until the app runs the migration once.
    await addColumnIfMissing(db, 'den_economy', 'homeRangeBackfillComplete INTEGER NOT NULL DEFAULT 0');
    // Migration for rows created before the manual-log/route-refresh caps
    // existed (docs/decisions/2026-08-21-home-range-rewards.md) — all default to "never
    // used yet" (null day key / 0 count), which is exactly the correct
    // starting state for an existing install.
    await addColumnIfMissing(db, 'den_economy', 'manualLogDayKey TEXT');
    await addColumnIfMissing(db, 'den_economy', 'manualLogCountToday INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'den_economy', 'routeRefreshDayKey TEXT');
    // Migration for rows created before territories existed
    // (docs/decisions/territories.md) — both default to "not yet" (0), which
    // is exactly the correct starting state for an existing install: it has
    // real Home Range cells sitting unpartitioned until the backfill runs
    // once, and no territory-income line has ever been revealed.
    await addColumnIfMissing(db, 'den_economy', 'territoriesBackfillComplete INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'den_economy', 'territoryIncomeRevealed INTEGER NOT NULL DEFAULT 0');
    // Harvest pile and Buddy tap counter (docs/specs/den-economy.md): an existing install starts with an empty pile.
    await addColumnIfMissing(db, 'den_economy', 'pile REAL NOT NULL DEFAULT 0');
    await addColumnIfMissing(db, 'den_economy', 'tapDayKey TEXT');
    await addColumnIfMissing(db, 'den_economy', 'tapCount INTEGER NOT NULL DEFAULT 0');
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
        `INSERT INTO den_economy (id, treats, doghouseLevel, bakeryLevel, sniffGardenLevel, lastTickAt, xp, level, dogName, cliffhangerShownForLevel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        SINGLETON_ID,
        initial.treats,
        initial.doghouseLevel,
        initial.bakeryLevel,
        initial.sniffGardenLevel,
        initial.lastTickAt,
        initial.xp,
        initial.level,
        initial.dogName,
        initial.cliffhangerShownForLevel
      );
      return initial;
    },

    async saveState(state: DenEconomyState): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO den_economy (id, treats, doghouseLevel, bakeryLevel, sniffGardenLevel, lastTickAt, xp, level, dogName, cliffhangerShownForLevel, homeRangeBackfillComplete, manualLogDayKey, manualLogCountToday, routeRefreshDayKey, territoriesBackfillComplete, territoryIncomeRevealed, pile, tapDayKey, tapCount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           treats = excluded.treats,
           doghouseLevel = excluded.doghouseLevel,
           bakeryLevel = excluded.bakeryLevel,
           sniffGardenLevel = excluded.sniffGardenLevel,
           lastTickAt = excluded.lastTickAt,
           xp = excluded.xp,
           level = excluded.level,
           dogName = excluded.dogName,
           cliffhangerShownForLevel = excluded.cliffhangerShownForLevel,
           homeRangeBackfillComplete = excluded.homeRangeBackfillComplete,
           manualLogDayKey = excluded.manualLogDayKey,
           manualLogCountToday = excluded.manualLogCountToday,
           routeRefreshDayKey = excluded.routeRefreshDayKey,
           territoriesBackfillComplete = excluded.territoriesBackfillComplete,
           territoryIncomeRevealed = excluded.territoryIncomeRevealed,
           pile = excluded.pile,
           tapDayKey = excluded.tapDayKey,
           tapCount = excluded.tapCount`,
        SINGLETON_ID,
        state.treats,
        state.doghouseLevel,
        state.bakeryLevel,
        state.sniffGardenLevel,
        state.lastTickAt,
        state.xp,
        state.level,
        state.dogName,
        state.cliffhangerShownForLevel,
        state.homeRangeBackfillComplete ? 1 : 0,
        state.manualLogDayKey,
        state.manualLogCountToday,
        state.routeRefreshDayKey,
        state.territoriesBackfillComplete ? 1 : 0,
        state.territoryIncomeRevealed ? 1 : 0,
        state.pile,
        state.tapDayKey,
        state.tapCount
      );
    },
  };
}

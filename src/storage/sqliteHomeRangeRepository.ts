import * as SQLite from 'expo-sqlite';

import { CellId, parseCellKey } from '../utils/grid';
import { calendarDayKey } from '../utils/manualWalkLog';
import { Cell, HomeRangeRepository, NewGroundEvent, PaintCellInput } from './HomeRangeRepository';
import { TerritoryId } from './TerritoryRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';
const NEW_GROUND_EVENT_SINGLETON_ID = 'singleton';

interface CellRow {
  ix: number;
  iy: number;
  lastRefreshed: number;
  lastTracked: number;
  visits: number;
  territoryId: string | null;
  lastVisitCreditedDayKey: string | null;
}

function rowToCell(row: CellRow): Cell {
  return {
    ix: row.ix,
    iy: row.iy,
    lastRefreshed: row.lastRefreshed,
    lastTracked: row.lastTracked,
    visits: row.visits,
    territoryId: row.territoryId,
  };
}

interface NewGroundEventRow {
  occurredAt: number;
  cellIds: string; // JSON-encoded CellId[]
}

// SQLite has no `ADD COLUMN IF NOT EXISTS` — a fresh install's CREATE TABLE
// already includes the column, so the ALTER TABLE below hits a "duplicate
// column" error, which we catch and ignore. Any other error still throws.
// Mirrors sqliteDenEconomyRepository.ts's identical helper.
async function addColumnIfMissing(db: SQLite.SQLiteDatabase, table: string, columnDef: string): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
  } catch (error) {
    if (!String(error).includes('duplicate column name')) {
      throw error;
    }
  }
}

export function createSqliteHomeRangeRepository(dbName: string = DEFAULT_DB_NAME): HomeRangeRepository {
  const dbPromise = SQLite.openDatabaseAsync(dbName).then(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS home_range_cells (
        ix INTEGER NOT NULL,
        iy INTEGER NOT NULL,
        lastRefreshed INTEGER NOT NULL,
        lastTracked INTEGER NOT NULL,
        visits INTEGER NOT NULL,
        territoryId TEXT,
        lastVisitCreditedDayKey TEXT,
        PRIMARY KEY (ix, iy)
      );
    `);
    // Migration for rows created before territories existed
    // (docs/decisions/territories) — both nullable; territoryId starts
    // NULL until the one-time territory migration backfill assigns it
    // (storage/territoryMigration.ts), and lastVisitCreditedDayKey starts
    // NULL, which correctly reads as "no visit credited yet this scheme."
    await addColumnIfMissing(db, 'home_range_cells', 'territoryId TEXT');
    await addColumnIfMissing(db, 'home_range_cells', 'lastVisitCreditedDayKey TEXT');
    // docs/decisions/somewhere-wild/design.md Decision 4 — a single
    // overwritten row (same singleton-row convention den_economy already
    // uses), not an event log. cellIds is stored as JSON since it's never
    // queried by content, only read back whole.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS home_range_new_ground_event (
        id TEXT PRIMARY KEY,
        occurredAt INTEGER NOT NULL,
        cellIds TEXT NOT NULL
      );
    `);
    return db;
  });

  return {
    async getCells(): Promise<Cell[]> {
      const db = await dbPromise;
      const rows = await db.getAllAsync<CellRow>('SELECT * FROM home_range_cells');
      return rows.map(rowToCell);
    },

    async paintCells(input: PaintCellInput[]): Promise<void> {
      if (input.length === 0) return;
      const db = await dbPromise;

      // Single transaction for the whole batch — see design.md's "no DB
      // write per fix" cost budget: this is the one write at Finish Walk
      // (or the one-time migration backfill), never per GPS fix.
      await db.withTransactionAsync(async () => {
        for (const { ix, iy, refreshedAt, tracked, territoryId } of input) {
          const existing = await db.getFirstAsync<CellRow>(
            'SELECT * FROM home_range_cells WHERE ix = ? AND iy = ?',
            ix,
            iy
          );
          const todayKey = calendarDayKey(refreshedAt);

          if (!existing) {
            await db.runAsync(
              `INSERT INTO home_range_cells (ix, iy, lastRefreshed, lastTracked, visits, territoryId, lastVisitCreditedDayKey) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              ix,
              iy,
              refreshedAt,
              tracked ? refreshedAt : 0,
              tracked ? 1 : 0,
              territoryId ?? null,
              tracked ? todayKey : null
            );
            continue;
          }

          const nextLastRefreshed = Math.max(existing.lastRefreshed, refreshedAt);
          const nextLastTracked = tracked ? Math.max(existing.lastTracked, refreshedAt) : existing.lastTracked;

          // Anti-farming daily visits cap (docs/decisions/territories/
          // design.md Decision 6): a tracked repaint only bumps `visits`
          // once per local calendar day, completely silently. territoryId is
          // deliberately absent from this UPDATE — only reassignCellsToTerritory
          // (a merge) is allowed to change it.
          const alreadyCreditedToday = tracked && existing.lastVisitCreditedDayKey === todayKey;
          const nextVisits = tracked && !alreadyCreditedToday ? existing.visits + 1 : existing.visits;
          const nextVisitDayKey = tracked ? todayKey : existing.lastVisitCreditedDayKey;

          await db.runAsync(
            `UPDATE home_range_cells SET lastRefreshed = ?, lastTracked = ?, visits = ?, lastVisitCreditedDayKey = ? WHERE ix = ? AND iy = ?`,
            nextLastRefreshed,
            nextLastTracked,
            nextVisits,
            nextVisitDayKey,
            ix,
            iy
          );
        }
      });
    },

    async getCellsInBounds(minIx: number, maxIx: number, minIy: number, maxIy: number): Promise<Cell[]> {
      const db = await dbPromise;
      const rows = await db.getAllAsync<CellRow>(
        'SELECT * FROM home_range_cells WHERE ix >= ? AND ix <= ? AND iy >= ? AND iy <= ?',
        minIx,
        maxIx,
        minIy,
        maxIy
      );
      return rows.map(rowToCell);
    },

    async getLastNewGroundEvent(): Promise<NewGroundEvent | null> {
      const db = await dbPromise;
      const row = await db.getFirstAsync<NewGroundEventRow>(
        'SELECT * FROM home_range_new_ground_event WHERE id = ?',
        NEW_GROUND_EVENT_SINGLETON_ID
      );
      if (!row) return null;
      return { occurredAt: row.occurredAt, cellIds: JSON.parse(row.cellIds) as CellId[] };
    },

    async recordNewGroundEvent(occurredAt: number, cellIds: CellId[]): Promise<void> {
      const db = await dbPromise;
      await db.runAsync(
        `INSERT INTO home_range_new_ground_event (id, occurredAt, cellIds) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET occurredAt = excluded.occurredAt, cellIds = excluded.cellIds`,
        NEW_GROUND_EVENT_SINGLETON_ID,
        occurredAt,
        JSON.stringify(cellIds)
      );
    },

    async getCellsByTerritory(territoryId: TerritoryId): Promise<Cell[]> {
      const db = await dbPromise;
      const rows = await db.getAllAsync<CellRow>('SELECT * FROM home_range_cells WHERE territoryId = ?', territoryId);
      return rows.map(rowToCell);
    },

    async reassignCellsToTerritory(fromTerritoryId: TerritoryId | null, toTerritoryId: TerritoryId): Promise<void> {
      const db = await dbPromise;
      if (fromTerritoryId === null) {
        await db.runAsync(
          'UPDATE home_range_cells SET territoryId = ? WHERE territoryId IS NULL',
          toTerritoryId
        );
        return;
      }
      await db.runAsync(
        'UPDATE home_range_cells SET territoryId = ? WHERE territoryId = ?',
        toTerritoryId,
        fromTerritoryId
      );
    },

    async assignTerritoryToCells(cellIds: CellId[], territoryId: TerritoryId): Promise<void> {
      if (cellIds.length === 0) return;
      const db = await dbPromise;
      await db.withTransactionAsync(async () => {
        for (const id of cellIds) {
          const { ix, iy } = parseCellKey(id);
          await db.runAsync('UPDATE home_range_cells SET territoryId = ? WHERE ix = ? AND iy = ?', territoryId, ix, iy);
        }
      });
    },

    async mergeCells(incoming: Cell[]): Promise<void> {
      const db = await dbPromise;
      await db.withTransactionAsync(async () => {
        for (const c of incoming) {
          const existing = await db.getFirstAsync<CellRow>(
            'SELECT * FROM home_range_cells WHERE ix = ? AND iy = ?',
            c.ix,
            c.iy
          );
          if (!existing) {
            await db.runAsync(
              `INSERT INTO home_range_cells (ix, iy, lastRefreshed, lastTracked, visits, territoryId, lastVisitCreditedDayKey) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              c.ix,
              c.iy,
              c.lastRefreshed,
              c.lastTracked,
              c.visits,
              c.territoryId,
              c.lastTracked > 0 ? calendarDayKey(c.lastTracked) : null
            );
            continue;
          }
          const lastTracked = Math.max(existing.lastTracked, c.lastTracked);
          await db.runAsync(
            `UPDATE home_range_cells SET lastRefreshed = ?, lastTracked = ?, visits = ?, territoryId = ?, lastVisitCreditedDayKey = ? WHERE ix = ? AND iy = ?`,
            Math.max(existing.lastRefreshed, c.lastRefreshed),
            lastTracked,
            Math.max(existing.visits, c.visits),
            c.territoryId ?? existing.territoryId,
            lastTracked > existing.lastTracked ? calendarDayKey(lastTracked) : existing.lastVisitCreditedDayKey,
            c.ix,
            c.iy
          );
        }
      });
    },

    async replaceAll(cells: Cell[], newGroundEvent: NewGroundEvent | null): Promise<void> {
      const db = await dbPromise;
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM home_range_cells');
        await db.runAsync('DELETE FROM home_range_new_ground_event');
        for (const c of cells) {
          // The daily-visit anti-farming key isn't exported; re-derive it from
          // lastTracked so a restore can't hand out one extra visit today.
          await db.runAsync(
            `INSERT INTO home_range_cells (ix, iy, lastRefreshed, lastTracked, visits, territoryId, lastVisitCreditedDayKey) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            c.ix,
            c.iy,
            c.lastRefreshed,
            c.lastTracked,
            c.visits,
            c.territoryId,
            c.lastTracked > 0 ? calendarDayKey(c.lastTracked) : null
          );
        }
        if (newGroundEvent) {
          await db.runAsync(
            'INSERT INTO home_range_new_ground_event (id, occurredAt, cellIds) VALUES (?, ?, ?)',
            NEW_GROUND_EVENT_SINGLETON_ID,
            newGroundEvent.occurredAt,
            JSON.stringify(newGroundEvent.cellIds)
          );
        }
      });
    },

    async getWorldMass(): Promise<{ cellCount: number; visitsSum: number }> {
      const db = await dbPromise;
      // A single ungrouped aggregate over every cell, regardless of
      // territory — see HomeRangeRepository.getWorldMass's doc comment and
      // docs/decisions/territories/design.md Decision 6's split-invariance
      // guardrail. This query MUST NEVER gain a WHERE/GROUP BY territoryId.
      const row = await db.getFirstAsync<{ cellCount: number; visitsSum: number | null }>(
        'SELECT COUNT(*) AS cellCount, SUM(visits) AS visitsSum FROM home_range_cells'
      );
      return { cellCount: row?.cellCount ?? 0, visitsSum: row?.visitsSum ?? 0 };
    },
  };
}

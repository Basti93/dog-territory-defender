import * as SQLite from 'expo-sqlite';

import { Cell, HomeRangeRepository, PaintCellInput } from './HomeRangeRepository';

const DEFAULT_DB_NAME = 'dog-territory-defender.db';

interface CellRow {
  ix: number;
  iy: number;
  lastRefreshed: number;
  lastTracked: number;
  visits: number;
}

function rowToCell(row: CellRow): Cell {
  return { ix: row.ix, iy: row.iy, lastRefreshed: row.lastRefreshed, lastTracked: row.lastTracked, visits: row.visits };
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
        PRIMARY KEY (ix, iy)
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
        for (const { ix, iy, refreshedAt, tracked } of input) {
          const existing = await db.getFirstAsync<CellRow>(
            'SELECT * FROM home_range_cells WHERE ix = ? AND iy = ?',
            ix,
            iy
          );

          if (!existing) {
            await db.runAsync(
              `INSERT INTO home_range_cells (ix, iy, lastRefreshed, lastTracked, visits) VALUES (?, ?, ?, ?, ?)`,
              ix,
              iy,
              refreshedAt,
              tracked ? refreshedAt : 0,
              tracked ? 1 : 0
            );
            continue;
          }

          const nextLastRefreshed = Math.max(existing.lastRefreshed, refreshedAt);
          const nextLastTracked = tracked ? Math.max(existing.lastTracked, refreshedAt) : existing.lastTracked;
          const nextVisits = tracked ? existing.visits + 1 : existing.visits;

          await db.runAsync(
            `UPDATE home_range_cells SET lastRefreshed = ?, lastTracked = ?, visits = ? WHERE ix = ? AND iy = ?`,
            nextLastRefreshed,
            nextLastTracked,
            nextVisits,
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
  };
}

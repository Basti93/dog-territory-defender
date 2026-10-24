// One-off, idempotent data migration (2026-10-24, "Variante a"): territories with fewer than 2 walks are folded
// into the nearest kept one (home is always kept). Runs at server start after the SQL migrations; later runs find
// nothing to fold. Clients learn about it through the normal change feed (cells.changed reassigned + territory.changed).
import { and, eq, sql } from 'drizzle-orm';
import { planTerritoryFolds } from '@game/utils/territoryCluster';
import type { Db } from '../db/client';
import { cells, households, territories } from '../db/schema';
import { appendEvent, type EventBus } from './events';
import { lockDen, territoryFromRow } from './state';

/** Returns how many territories were folded across all households. */
export async function foldSmallTerritories(db: Db, bus?: EventBus, onError: (hid: string, err: unknown) => void = () => undefined): Promise<number> {
  const all = await db.select({ id: households.id }).from(households);
  let total = 0;
  for (const { id: hid } of all) {
    // One household failing must not stop the others (or the server): log and carry on.
    const folded = await db.transaction(async (tx) => {
      const dbx = tx as unknown as Db;
      await lockDen(dbx, hid); // serialises with walk ingest of this household; rows are read only after the lock
      const rows = await dbx.select().from(territories).where(eq(territories.householdId, hid));
      if (rows.length < 2) return 0;
      const cellRows = await dbx.select().from(cells).where(and(eq(cells.householdId, hid), eq(cells.generated, false)));
      const folds = planTerritoryFolds(
        rows,
        cellRows.map((r) => ({ ix: r.ix, iy: r.iy, lastRefreshed: r.lastRefreshed, lastTracked: r.lastTracked, visits: r.visits, territoryId: r.territoryId }))
      );
      if (folds.length === 0) return 0;
      for (const { loserId, survivorId } of folds) {
        await dbx.execute(sql`update cells set territory_id = ${survivorId} where household_id = ${hid}::uuid and territory_id = ${loserId}`);
        const loser = rows.find((r) => r.id === loserId)!;
        await dbx
          .update(territories)
          .set({
            walksHere: sql`${territories.walksHere} + ${loser.walksHere}`,
            treatsEarnedHere: sql`${territories.treatsEarnedHere} + ${loser.treatsEarnedHere}`,
          })
          .where(and(eq(territories.householdId, hid), eq(territories.id, survivorId)));
        await dbx.delete(territories).where(and(eq(territories.householdId, hid), eq(territories.id, loserId)));
      }
      const removedIds = folds.map((f) => f.loserId);
      const survivorIds = new Set(folds.map((f) => f.survivorId));
      const upserted = (await dbx.select().from(territories).where(eq(territories.householdId, hid))).filter((t) => survivorIds.has(t.id)).map(territoryFromRow);
      await appendEvent(dbx, hid, 'cells.changed', null, { cells: [], reassigned: folds.map((f) => ({ from: f.loserId, to: f.survivorId })) });
      await appendEvent(dbx, hid, 'territory.changed', null, { upserted, removedIds });
      return folds.length;
    }).catch((err) => {
      onError(hid, err);
      return 0;
    });
    if (folded > 0) bus?.notify(hid);
    total += folded;
  }
  return total;
}

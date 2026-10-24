// Founding import (POST /v1/households/import): the first device seeds the household with its
// existing local progress. Append-only for walks, baseline for cell visits, authoritative Den seed.
import { and, eq, sql } from 'drizzle-orm';
import type { ImportRequest, ImportResponse, WalkReward } from '@game/sync/apiContract';
import type { Db } from '../db/client';
import { cells, dogs, households, territories, walks } from '../db/schema';
import { appendEvent, type EventBus } from './events';
import { buildSnapshot } from './households';
import { cellFromRow, dogFromRow, lockDen, saveDen, territoryFromRow, walkMetaFromRow } from './state';
import type { AuthCtx } from './walks';

export type ImportResult = { kind: 'ok'; response: ImportResponse } | { kind: 'not-allowed' };

const CHUNK = 1000;

export async function importHousehold(
  db: Db,
  bus: EventBus,
  auth: AuthCtx,
  req: ImportRequest,
  now: number
): Promise<ImportResult> {
  const hid = auth.householdId;
  const outcome = await db.transaction(async (tx): Promise<'replayed' | 'done' | 'not-allowed'> => {
    const dbx = tx as unknown as Db;
    const denRow = await lockDen(dbx, hid);
    const [household] = await dbx.select().from(households).where(eq(households.id, hid));

    if (household.foundedImportDone) return household.importId === req.importId ? 'replayed' : 'not-allowed';
    const [{ n }] = await dbx.select({ n: sql<number>`count(*)::int` }).from(walks).where(eq(walks.householdId, hid));
    if (n > 0 || denRow.rev !== 0) return 'not-allowed';

    // walks: stored as-is, no reward recompute
    for (let i = 0; i < req.walks.length; i += CHUNK) {
      const rows = req.walks.slice(i, i + CHUNK).map((w) => {
        const reward: WalkReward = {
          qualifies: w.closed,
          cellsPainted: 0,
          newGroundCellCount: w.newGroundCellIds?.length ?? 0,
          bloomMultiplier: 1,
          walkOrderToday: 0,
          dailyMultiplier: 1,
          treatsEarned: w.treatsEarned ?? 0,
          xpEarned: 0,
          leveledUpTo: null,
          territoryId: null,
          newTerritoryName: null,
          mergedTerritoryNames: null,
        };
        return {
          householdId: hid,
          id: w.id,
          playerId: auth.playerId,
          startTime: w.startTime,
          startSource: w.startSource,
          route: w.locations,
          closed: w.closed,
          newGroundCellIds: w.newGroundCellIds ?? [],
          treatsEarned: w.treatsEarned ?? null,
          reward,
        };
      });
      if (rows.length > 0) await dbx.insert(walks).values(rows).onConflictDoNothing();
    }

    if (req.territories.length > 0) {
      await dbx
        .insert(territories)
        .values(req.territories.map((t) => ({ householdId: hid, ...t })))
        .onConflictDoNothing();
    }

    for (let i = 0; i < req.cells.length; i += CHUNK) {
      await dbx
        .insert(cells)
        .values(req.cells.slice(i, i + CHUNK).map((c) => ({ householdId: hid, ...c, baselineVisits: c.visits })))
        .onConflictDoNothing();
    }

    const { treats, doghouseLevel, bakeryLevel, sniffGardenLevel, lastTickAt, xp, level } = req.den;
    const seeded = await saveDen(
      dbx,
      hid,
      denRow.rev,
      {
        treats,
        doghouseLevel,
        bakeryLevel,
        sniffGardenLevel,
        lastTickAt: Math.min(lastTickAt, now),
        xp,
        level,
        territoryIncomeRevealed: denRow.territoryIncomeRevealed,
        pile: Math.max(0, req.den.pile ?? 0),
        tapDayKey: denRow.tapDayKey,
        tapCount: denRow.tapCount,
      },
      now
    );
    const [dogRow] = await dbx
      .update(dogs)
      .set({ name: req.dog.name, appearance: req.dog.appearance, updatedAt: now })
      .where(eq(dogs.householdId, hid))
      .returning();
    await dbx.update(households).set({ foundedImportDone: true, importId: req.importId }).where(eq(households.id, hid));

    // change feed, so a device that joined before the import converges too
    const storedWalks = await dbx.select().from(walks).where(eq(walks.householdId, hid));
    for (const w of storedWalks) {
      const { route: _route, ...meta } = w;
      await appendEvent(dbx, hid, 'walk.added', auth.playerId, { walk: walkMetaFromRow(meta), cellsPainted: 0 });
    }
    const cellRows = await dbx.select().from(cells).where(and(eq(cells.householdId, hid), eq(cells.generated, false)));
    for (let i = 0; i < cellRows.length; i += 500) {
      await appendEvent(dbx, hid, 'cells.changed', auth.playerId, {
        cells: cellRows.slice(i, i + 500).map(cellFromRow),
        reassigned: [],
      });
    }
    const territoryRows = await dbx.select().from(territories).where(eq(territories.householdId, hid));
    if (territoryRows.length > 0) {
      await appendEvent(dbx, hid, 'territory.changed', auth.playerId, { upserted: territoryRows.map(territoryFromRow), removedIds: [] });
    }
    await appendEvent(dbx, hid, 'den.updated', auth.playerId, { den: seeded });
    await appendEvent(dbx, hid, 'dog.updated', auth.playerId, { dog: dogFromRow(dogRow) });
    return 'done';
  });

  if (outcome === 'not-allowed') return { kind: 'not-allowed' };
  if (outcome === 'done') bus.notify(hid);
  const snapshot = await buildSnapshot(db, auth, now);
  return { kind: 'ok', response: { ...snapshot, replayed: outcome === 'replayed' } };
}


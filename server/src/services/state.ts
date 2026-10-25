// Row <-> API mappers and shared reads used by several services.
import { and, eq, sql } from 'drizzle-orm';
import type { ApiCell, ApiCorner, ApiDenState, ApiDog, ApiTerritory, ApiWalkMeta } from '@game/sync/apiContract';
import type { StatsExcludedReason } from '@game/types';
import type { Db } from '../db/client';
import { cells, corners, denState, dogs, territories, walks } from '../db/schema';
import type { DenState } from '../economy/denTransitions';

export function denFromRow(row: typeof denState.$inferSelect): ApiDenState {
  return {
    treats: row.treats,
    doghouseLevel: row.doghouseLevel,
    bakeryLevel: row.bakeryLevel,
    sniffGardenLevel: row.sniffGardenLevel,
    lastTickAt: row.lastTickAt,
    xp: row.xp,
    level: row.level,
    territoryIncomeRevealed: row.territoryIncomeRevealed,
    pile: row.pile,
    tapDayKey: row.tapDayKey,
    tapCount: row.tapCount,
    rev: row.rev,
  };
}

export const cellFromRow = (r: typeof cells.$inferSelect): ApiCell => ({
  ix: r.ix,
  iy: r.iy,
  lastRefreshed: r.lastRefreshed,
  lastTracked: r.lastTracked,
  visits: r.visits,
  territoryId: r.territoryId,
});

export const territoryFromRow = (r: typeof territories.$inferSelect): ApiTerritory => ({
  id: r.id,
  name: r.name,
  createdAt: r.createdAt,
  walksHere: r.walksHere,
  treatsEarnedHere: r.treatsEarnedHere,
});

export const cornerFromRow = (r: typeof corners.$inferSelect): ApiCorner => ({
  id: r.cornerId,
  name: r.name,
  updatedBy: r.updatedBy,
  updatedAt: r.updatedAt,
});

export const dogFromRow = (r: typeof dogs.$inferSelect): ApiDog => ({
  id: r.id,
  name: r.name,
  appearance: (r.appearance ?? {}) as Record<string, unknown>,
  appearanceRev: r.appearanceRev,
  updatedAt: r.updatedAt,
});

export const walkMetaFromRow = (r: Omit<typeof walks.$inferSelect, 'route' | 'generated'>): ApiWalkMeta => ({
  id: r.id,
  playerId: r.playerId as string, // null only for generated (bot) walks, which no human-facing query returns
  startTime: r.startTime,
  startSource: r.startSource as 'button' | 'manual-log',
  closed: r.closed,
  newGroundCellIds: (r.newGroundCellIds ?? []) as string[],
  ...(Array.isArray(r.metNeighbourIds) && r.metNeighbourIds.length > 0 ? { metNeighbourIds: r.metNeighbourIds as string[] } : {}),
  treatsEarned: r.treatsEarned,
  deleted: r.deletedAt !== null,
  ...(r.statsVersion !== null
    ? {
        statsVersion: r.statsVersion,
        ...(r.statsEndTime !== null ? { statsEndTime: r.statsEndTime } : {}),
        ...(r.statsDistanceM !== null ? { statsDistanceM: r.statsDistanceM } : {}),
        ...(r.statsExcluded ? { statsExcluded: r.statsExcluded as StatsExcludedReason } : {}),
      }
    : {}),
});

export function stripRev(den: ApiDenState): DenState {
  const { rev: _rev, pile, tapDayKey, tapCount, ...rest } = den;
  return { ...rest, pile: pile ?? 0, tapDayKey: tapDayKey ?? null, tapCount: tapCount ?? 0 };
}

/** Global ungrouped world mass (territoryEconomy split-invariance rule): one aggregate over the whole cells table. */
export async function worldMass(db: Db, householdId: string): Promise<{ cellCount: number; visitsSum: number }> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int`, v: sql<number>`coalesce(sum(${cells.visits}), 0)::int` })
    .from(cells)
    .where(and(eq(cells.householdId, householdId), eq(cells.generated, false)));
  return { cellCount: row?.n ?? 0, visitsSum: row?.v ?? 0 };
}

/** Loads the Den row, locking it: serialises every state change of one household. */
export async function lockDen(tx: Db, householdId: string): Promise<typeof denState.$inferSelect> {
  const [row] = await tx.select().from(denState).where(eq(denState.householdId, householdId)).for('update');
  if (!row) throw new Error('den_state missing for household');
  return row;
}

export async function saveDen(tx: Db, householdId: string, previousRev: number, next: DenState, now: number): Promise<ApiDenState> {
  const rev = previousRev + 1;
  await tx
    .update(denState)
    .set({ ...next, rev, updatedAt: now })
    .where(eq(denState.householdId, householdId));
  return { ...next, rev };
}

export async function loadDog(db: Db, householdId: string): Promise<typeof dogs.$inferSelect> {
  const [row] = await db.select().from(dogs).where(eq(dogs.householdId, householdId)).limit(1);
  if (!row) throw new Error('dog missing for household');
  return row;
}

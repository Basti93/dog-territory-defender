import { CellId } from '../utils/grid';
import { calendarDayKey } from '../utils/manualWalkLog';
import { Cell, HomeRangeRepository, NewGroundEvent, PaintCellInput } from './HomeRangeRepository';
import { TerritoryId } from './TerritoryRepository';

function cellKey(ix: number, iy: number): string {
  return `${ix},${iy}`;
}

/** Internal-only per-cell bookkeeping not part of the public Cell shape — see sqliteHomeRangeRepository.ts's identical lastVisitCreditedDayKey column for why this exists (docs/decisions/territories.md's anti-farming visits cap). */
interface InternalCell extends Cell {
  lastVisitCreditedDayKey: string | null;
}

export function createInMemoryHomeRangeRepository(): HomeRangeRepository {
  const cells = new Map<string, InternalCell>();
  let lastNewGroundEvent: NewGroundEvent | null = null;

  const toPublicCell = (c: InternalCell): Cell => ({
    ix: c.ix,
    iy: c.iy,
    lastRefreshed: c.lastRefreshed,
    lastTracked: c.lastTracked,
    visits: c.visits,
    territoryId: c.territoryId,
  });

  return {
    async getCells(): Promise<Cell[]> {
      return Array.from(cells.values()).map(toPublicCell);
    },

    async paintCells(input: PaintCellInput[]): Promise<void> {
      for (const { ix, iy, refreshedAt, tracked, territoryId } of input) {
        const key = cellKey(ix, iy);
        const existing = cells.get(key);
        const todayKey = calendarDayKey(refreshedAt);

        if (!existing) {
          cells.set(key, {
            ix,
            iy,
            lastRefreshed: refreshedAt,
            // A brand-new cell should only ever be created by a tracked paint
            // (design.md: a refresh can only touch cells already in the
            // Range). If it somehow isn't, lastTracked has nothing honest to
            // record yet — 0 (epoch) reads as "never tracked".
            lastTracked: tracked ? refreshedAt : 0,
            visits: tracked ? 1 : 0,
            // Territory membership is set once, only on insert — see
            // docs/decisions/territories.md Decision 1.
            territoryId: territoryId ?? null,
            lastVisitCreditedDayKey: tracked ? todayKey : null,
          });
          continue;
        }

        // Anti-farming daily visits cap (docs/decisions/territories.md
        // design.md Decision 6): a tracked repaint only bumps `visits` once
        // per local calendar day, completely silently — every other field
        // (lastRefreshed, lastTracked, and every stat outside this file)
        // updates exactly as before regardless of this cap.
        const alreadyCreditedToday = tracked && existing.lastVisitCreditedDayKey === todayKey;
        const nextVisits = tracked && !alreadyCreditedToday ? existing.visits + 1 : existing.visits;
        const nextVisitDayKey = tracked ? todayKey : existing.lastVisitCreditedDayKey;

        cells.set(key, {
          ...existing,
          lastRefreshed: Math.max(existing.lastRefreshed, refreshedAt),
          lastTracked: tracked ? Math.max(existing.lastTracked, refreshedAt) : existing.lastTracked,
          visits: nextVisits,
          lastVisitCreditedDayKey: nextVisitDayKey,
          // territoryId is never touched by this UPDATE path — only by
          // reassignCellsToTerritory below (a merge).
        });
      }
    },

    async getCellsInBounds(minIx: number, maxIx: number, minIy: number, maxIy: number): Promise<Cell[]> {
      return Array.from(cells.values())
        .filter((c) => c.ix >= minIx && c.ix <= maxIx && c.iy >= minIy && c.iy <= maxIy)
        .map(toPublicCell);
    },

    async getLastNewGroundEvent(): Promise<NewGroundEvent | null> {
      return lastNewGroundEvent;
    },

    async recordNewGroundEvent(occurredAt: number, cellIds: CellId[]): Promise<void> {
      lastNewGroundEvent = { occurredAt, cellIds };
    },

    async getCellsByTerritory(territoryId: TerritoryId): Promise<Cell[]> {
      return Array.from(cells.values())
        .filter((c) => c.territoryId === territoryId)
        .map(toPublicCell);
    },

    async reassignCellsToTerritory(fromTerritoryId: TerritoryId | null, toTerritoryId: TerritoryId): Promise<void> {
      for (const [key, cell] of cells) {
        if (cell.territoryId === fromTerritoryId) {
          cells.set(key, { ...cell, territoryId: toTerritoryId });
        }
      }
    },

    async assignTerritoryToCells(cellIds: CellId[], territoryId: TerritoryId): Promise<void> {
      for (const id of cellIds) {
        const existing = cells.get(id);
        if (existing) cells.set(id, { ...existing, territoryId });
      }
    },

    async mergeCells(incoming: Cell[]): Promise<void> {
      for (const c of incoming) {
        const key = cellKey(c.ix, c.iy);
        const existing = cells.get(key);
        if (!existing) {
          cells.set(key, { ...c, lastVisitCreditedDayKey: c.lastTracked > 0 ? calendarDayKey(c.lastTracked) : null });
          continue;
        }
        const lastTracked = Math.max(existing.lastTracked, c.lastTracked);
        cells.set(key, {
          ...existing,
          lastRefreshed: Math.max(existing.lastRefreshed, c.lastRefreshed),
          lastTracked,
          visits: Math.max(existing.visits, c.visits),
          territoryId: c.territoryId ?? existing.territoryId,
          lastVisitCreditedDayKey:
            lastTracked > existing.lastTracked ? calendarDayKey(lastTracked) : existing.lastVisitCreditedDayKey,
        });
      }
    },

    async replaceAll(next: Cell[], newGroundEvent: NewGroundEvent | null): Promise<void> {
      cells.clear();
      for (const c of next) {
        cells.set(cellKey(c.ix, c.iy), {
          ...c,
          lastVisitCreditedDayKey: c.lastTracked > 0 ? calendarDayKey(c.lastTracked) : null,
        });
      }
      lastNewGroundEvent = newGroundEvent;
    },

    async getWorldMass(): Promise<{ cellCount: number; visitsSum: number }> {
      // A single ungrouped aggregate over every cell, regardless of
      // territory — see HomeRangeRepository.getWorldMass's doc comment and
      // docs/decisions/territories.md Decision 6. Never filter or
      // group this by territoryId.
      let cellCount = 0;
      let visitsSum = 0;
      for (const cell of cells.values()) {
        cellCount += 1;
        visitsSum += cell.visits;
      }
      return { cellCount, visitsSum };
    },
  };
}

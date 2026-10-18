// One-time backfill: partitions every already-painted Home Range cell into
// Territories, exactly once, on first app load after this feature ships. See
// docs/decisions/territories.md Decision 9.
//
// Replays the exact same clustering algorithm a live walk uses
// (src/utils/territoryCluster.ts's resolveTerritoryChanges) over full
// history in one pass: every existing cell, in stable lastRefreshed order,
// is fed through as if it were its own one-cell "newCells" batch against
// whatever Territories have been built up so far in this same pass. No
// separate "bulk clustering" algorithm exists — this file is orchestration
// (read cells, call the pure function once per cell, persist) and I/O only.

import { resolveTerritoryChanges } from '../utils/territoryCluster';
import { Cell, HomeRangeRepository } from './HomeRangeRepository';
import { DenEconomyRepository } from './DenEconomyRepository';
import { TerritoryId, TerritoryRepository } from './TerritoryRepository';
import { CellId, cellCentre, cellKey } from '../utils/grid';

export interface TerritoryMigrationDeps {
  homeRangeRepository: HomeRangeRepository;
  territoryRepository: TerritoryRepository;
  denEconomyRepository: DenEconomyRepository;
  /** Injected so tests can avoid real reverse-geocode network calls — the real caller (App.tsx) passes streetLookup.ts's resolveTerritoryName. */
  resolveTerritoryName: (anchorLat: number, anchorLon: number, dogName: string | null) => Promise<string>;
}

function stableSortKey(cell: Cell): [number, number, number] {
  return [cell.lastRefreshed, cell.ix, cell.iy];
}

/**
 * Idempotent: guarded by `DenEconomyState.territoriesBackfillComplete`, the
 * same singleton-flag pattern homeRangeMigration.ts's own backfill uses. Safe
 * to call on every app load — a no-op after the first successful run. Must
 * run AFTER runHomeRangeMigrationIfNeeded (there must be a populated Range to
 * cluster) — see App.tsx's migration sequence.
 */
export async function runTerritoryMigrationIfNeeded(deps: TerritoryMigrationDeps): Promise<void> {
  const { homeRangeRepository, territoryRepository, denEconomyRepository, resolveTerritoryName } = deps;

  const state = await denEconomyRepository.getState();
  if (state.territoriesBackfillComplete) return;

  const allCells = await homeRangeRepository.getCells();
  const sortedCells = [...allCells].sort((a, b) => {
    const [aR, aX, aY] = stableSortKey(a);
    const [bR, bX, bY] = stableSortKey(b);
    return aR - bR || aX - bX || aY - bY;
  });

  // Grows as we go — this pass's own "rangeBefore" snapshot, one cell richer
  // each iteration (design.md Decision 9's "batch of size one" replay).
  const processed: Cell[] = [];
  const territoryCreatedAt = new Map<TerritoryId, number>();
  // Final resolved territoryId per cell — written to storage once at the end
  // via one grouped call per territory, rather than one DB write per cell.
  const finalAssignments = new Map<CellId, TerritoryId>();

  for (const rawCell of sortedCells) {
    const id = cellKey(rawCell.ix, rawCell.iy);
    const paintedSet = new Set<CellId>([id]);

    const plan = resolveTerritoryChanges(processed, paintedSet, rawCell.lastRefreshed, territoryCreatedAt);

    let resolvedId: TerritoryId;
    if (plan.births.length > 0) {
      // Exactly one cell in this "walk" — at most one birth, containing
      // exactly that cell.
      const birth = plan.births[0];
      const [lat, lon] = cellCentre(birth.anchorCell.ix, birth.anchorCell.iy);
      const name = await resolveTerritoryName(lat, lon, state.dogName);
      resolvedId = await territoryRepository.createTerritory(name, rawCell.lastRefreshed);
      territoryCreatedAt.set(resolvedId, rawCell.lastRefreshed);
    } else {
      resolvedId = plan.newCellAssignments.get(id) as TerritoryId;
    }

    for (const merge of plan.merges) {
      await homeRangeRepository.reassignCellsToTerritory(merge.loserId, merge.survivorId);
      await territoryRepository.mergeTerritoryStats(merge.survivorId, merge.loserId);
      territoryCreatedAt.delete(merge.loserId);
      for (const p of processed) {
        if (p.territoryId === merge.loserId) p.territoryId = merge.survivorId;
      }
      for (const [cid, tid] of finalAssignments) {
        if (tid === merge.loserId) finalAssignments.set(cid, merge.survivorId);
      }
      if (resolvedId === merge.loserId) resolvedId = merge.survivorId;
    }

    processed.push({ ...rawCell, territoryId: resolvedId });
    finalAssignments.set(id, resolvedId);
  }

  // One grouped write per resolved territory, not one per cell.
  const cellIdsByTerritory = new Map<TerritoryId, CellId[]>();
  for (const [cellId, territoryId] of finalAssignments) {
    const list = cellIdsByTerritory.get(territoryId) ?? [];
    list.push(cellId);
    cellIdsByTerritory.set(territoryId, list);
  }
  for (const [territoryId, cellIds] of cellIdsByTerritory) {
    await homeRangeRepository.assignTerritoryToCells(cellIds, territoryId);
  }

  await denEconomyRepository.saveState({ ...state, territoriesBackfillComplete: true });
}

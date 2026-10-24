// Territory migrations (docs/specs/home-range.md "Reviere"). Both are idempotent and safe on every app load.
//
// 1. Backfill (flag `territoriesBackfillComplete`): a Range painted before territories existed becomes ONE home
//    territory. Far patches are promoted later by the normal rule (2+ walks, 40+ cells, src/utils/territoryCluster.ts).
// 2. Fold (2026-10-24): territories with fewer than PROMOTE_MIN_WALKS walks are folded into the nearest kept one
//    (walk and treat counters summed, cells re-assigned). A no-op once nothing is left to fold.

import { planTerritoryFolds } from '../utils/territoryCluster';
import { HomeRangeRepository } from './HomeRangeRepository';
import { DenEconomyRepository } from './DenEconomyRepository';
import { TerritoryRepository } from './TerritoryRepository';
import { cellCentre, cellKey } from '../utils/grid';

export interface TerritoryMigrationDeps {
  homeRangeRepository: HomeRangeRepository;
  territoryRepository: TerritoryRepository;
  denEconomyRepository: DenEconomyRepository;
  /** Injected so tests can avoid real reverse-geocode network calls: the real caller passes streetLookup.ts's resolveTerritoryName. */
  resolveTerritoryName: (anchorLat: number, anchorLon: number, dogName: string | null) => Promise<string>;
}

export async function runTerritoryMigrationIfNeeded(deps: TerritoryMigrationDeps): Promise<void> {
  const { homeRangeRepository, territoryRepository, denEconomyRepository, resolveTerritoryName } = deps;

  const state = await denEconomyRepository.getState();
  if (state.territoriesBackfillComplete) return;

  const allCells = await homeRangeRepository.getCells();
  if (allCells.length > 0) {
    // The oldest painted cell is home's anchor (name lookup); ties by position keep it deterministic.
    const oldest = [...allCells].sort((a, b) => a.lastRefreshed - b.lastRefreshed || a.ix - b.ix || a.iy - b.iy)[0];
    const [lat, lon] = cellCentre(oldest.ix, oldest.iy);
    const name = await resolveTerritoryName(lat, lon, state.dogName);
    const homeId = await territoryRepository.createTerritory(name, oldest.lastRefreshed);
    await homeRangeRepository.assignTerritoryToCells(allCells.map((c) => cellKey(c.ix, c.iy)), homeId);
  }

  await denEconomyRepository.saveState({ ...state, territoriesBackfillComplete: true });
}

/** Folds every territory with fewer than 2 walks into the nearest kept one. Offline players only: a household's server does the same for everyone. */
export async function runTerritoryFoldIfNeeded(deps: Pick<TerritoryMigrationDeps, 'homeRangeRepository' | 'territoryRepository'>): Promise<number> {
  const { homeRangeRepository, territoryRepository } = deps;
  const territories = await territoryRepository.getTerritories();
  if (territories.length < 2) return 0;
  const folds = planTerritoryFolds(territories, await homeRangeRepository.getCells());
  for (const { loserId, survivorId } of folds) {
    await homeRangeRepository.reassignCellsToTerritory(loserId, survivorId);
    await territoryRepository.mergeTerritoryStats(survivorId, loserId);
  }
  return folds.length;
}

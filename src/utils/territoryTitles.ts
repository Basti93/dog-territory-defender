// Territory character titles — pure functions, no I/O. See
// docs/decisions/territories/design.md Decision 4. Computed live on every
// render, never persisted (the "Wild One" title is explicitly allowed to
// read a live wildness() value, unlike a persisted decaying score).

import { Cell } from '../storage/HomeRangeRepository';
import { Territory, TerritoryId } from '../storage/TerritoryRepository';
import { getDistance } from './geometry';
import { cellCentre, wildness } from './grid';

export type TerritoryTitle = 'Everyday' | 'Wild One' | 'Far One';

/**
 * Fixed priority order — the order the game-master's own brief listed them
 * in (proposal.md's Open Questions flags this specific ordering as a
 * game-master copy/balance call, not pinned here as final; this is the
 * documented placeholder default until that pass happens).
 */
const TITLE_PRIORITY: TerritoryTitle[] = ['Everyday', 'Wild One', 'Far One'];

function meanWildness(cells: Cell[], now: number): number {
  if (cells.length === 0) return 0;
  const total = cells.reduce((sum, c) => sum + wildness(c.lastRefreshed, now), 0);
  return total / cells.length;
}

function territoryCentroid(cells: Cell[]): [number, number] | null {
  if (cells.length === 0) return null;
  let sumLat = 0;
  let sumLon = 0;
  for (const cell of cells) {
    const [lat, lon] = cellCentre(cell.ix, cell.iy);
    sumLat += lat;
    sumLon += lon;
  }
  return [sumLat / cells.length, sumLon / cells.length];
}

/**
 * At-most-one title per Territory, computed fresh every call — design.md
 * Decision 4's algorithm exactly: rank categories in priority order, argmax
 * each in turn, skip an already-titled territory to that category's
 * next-best candidate, and let a category go unawarded rather than force a
 * hollow title onto an already-titled territory. A player with exactly one
 * Territory gets no titles (nothing to differentiate a solo territory from).
 */
export function assignTerritoryTitles(
  territories: Territory[],
  cellsByTerritory: ReadonlyMap<TerritoryId, Cell[]>,
  now: number
): Map<TerritoryId, TerritoryTitle> {
  const titles = new Map<TerritoryId, TerritoryTitle>();
  if (territories.length < 2) return titles;

  const oldestTerritory = territories.slice().sort((a, b) => a.createdAt - b.createdAt)[0];
  const oldestCentroid = territoryCentroid(cellsByTerritory.get(oldestTerritory.id) ?? []);

  const scoreFor = (category: TerritoryTitle, territory: Territory): number => {
    const cells = cellsByTerritory.get(territory.id) ?? [];
    switch (category) {
      case 'Everyday':
        return territory.walksHere;
      case 'Wild One':
        return meanWildness(cells, now);
      case 'Far One': {
        if (!oldestCentroid) return 0;
        const centroid = territoryCentroid(cells);
        if (!centroid) return 0;
        return getDistance(oldestCentroid[0], oldestCentroid[1], centroid[0], centroid[1]);
      }
    }
  };

  for (const category of TITLE_PRIORITY) {
    // Candidates ranked best-first; the first one not already holding a
    // higher-priority title wins this category (design.md's "skip to the
    // category's next-best candidate" rule).
    const ranked = territories
      .slice()
      .sort((a, b) => scoreFor(category, b) - scoreFor(category, a) || a.id.localeCompare(b.id));

    for (const candidate of ranked) {
      if (!titles.has(candidate.id)) {
        titles.set(candidate.id, category);
        break;
      }
    }
  }

  return titles;
}

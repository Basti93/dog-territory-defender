import { Cell } from '../../storage/HomeRangeRepository';
import { TerritoryId } from '../../storage/TerritoryRepository';
import { cellKey } from '../grid';
import {
  confirmPromotions,
  findPromotionCandidates,
  pickHomeTerritoryId,
  planTerritoryFolds,
  PROMOTE_MIN_CELLS,
  PROMOTE_MIN_WALKS,
  resolveCelebrationTerritoryBeat,
  resolveTerritoryChanges,
  SPAWN_DISTANCE_M,
  territoryCentre,
} from '../territoryCluster';

const NOW = Date.parse('2026-08-22T12:00:00Z');

function cell(ix: number, iy: number, territoryId: TerritoryId | null): Cell {
  return { ix, iy, lastRefreshed: NOW, lastTracked: NOW, visits: 1, territoryId };
}

function blockCellIds(originIx: number, originIy: number, width: number, height: number): Set<string> {
  const ids = new Set<string>();
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) ids.add(cellKey(originIx + dx, originIy + dy));
  return ids;
}

function blockCells(originIx: number, originIy: number, width: number, height: number, territoryId: TerritoryId | null): Cell[] {
  return Array.from(blockCellIds(originIx, originIy, width, height)).map((id) => {
    const [ix, iy] = id.split(',').map(Number);
    return cell(ix, iy, territoryId);
  });
}

// One grid step is about 20 m, so 50 steps are about 1000 m (SPAWN_DISTANCE_M).
const HOME = blockCells(0, 0, 10, 10, 't-home'); // centre about (4,4)
const CREATED = new Map([['t-home', 1000]]);

describe('constants', () => {
  it('birth distance is 1000 m from the home centre; a far patch needs 2 walks and 40 cells', () => {
    expect(SPAWN_DISTANCE_M).toBe(1000);
    expect(PROMOTE_MIN_WALKS).toBe(2);
    expect(PROMOTE_MIN_CELLS).toBe(40);
  });
});

describe('resolveTerritoryChanges', () => {
  it('the first-ever walk births exactly one territory (the silent first one)', () => {
    const painted = blockCellIds(0, 0, 3, 3);
    const plan = resolveTerritoryChanges([], painted, NOW, new Map());
    expect(plan.hadExistingTerritoryBefore).toBe(false);
    expect(plan.births).toHaveLength(1);
    expect(plan.births[0].cellIds).toHaveLength(9);
    for (const id of painted) expect(plan.newCellAssignments.get(id)).toBe(plan.births[0].provisionalId);
    expect(plan.creditedTerritoryId).toBe(plan.births[0].provisionalId);
  });

  it('new ground within 1000 m of the home CENTRE is home, however far from the nearest cell it is not', () => {
    const near = blockCellIds(40, 0, 2, 2); // about 720 m from the centre, 600 m from the nearest cell
    const plan = resolveTerritoryChanges(HOME, near, NOW, CREATED);
    expect(plan.births).toHaveLength(0);
    for (const id of near) expect(plan.newCellAssignments.get(id)).toBe('t-home');
  });

  it('far ground (beyond 1000 m of the centre) with no shown territory nearby stays home ground: no birth, ever', () => {
    const far = blockCellIds(120, 0, 3, 3);
    const plan = resolveTerritoryChanges(HOME, far, NOW, CREATED);
    expect(plan.births).toHaveLength(0);
    for (const id of far) expect(plan.newCellAssignments.get(id)).toBe('t-home');
  });

  it('far ground within 1000 m of a shown territory joins that territory', () => {
    const shown = blockCells(200, 0, 3, 3, 't-far');
    const near = blockCellIds(230, 0, 2, 2); // 540 m from the shown territory, 4 km from home
    const plan = resolveTerritoryChanges([...HOME, ...shown], near, NOW, new Map([['t-home', 1000], ['t-far', 2000]]));
    for (const id of near) expect(plan.newCellAssignments.get(id)).toBe('t-far');
    expect(plan.creditedTerritoryId).toBe('t-far');
  });

  it('two territories whose cells become literally 8-neighbour-adjacent merge, older surviving', () => {
    const plan = resolveTerritoryChanges(
      [...blockCells(0, 0, 2, 2, 't-a'), ...blockCells(3, 0, 2, 2, 't-b')],
      new Set([cellKey(2, 0)]),
      NOW,
      new Map([['t-a', 1000], ['t-b', 2000]])
    );
    expect(plan.merges).toEqual([{ survivorId: 't-a', loserId: 't-b' }]);
  });

  it('territories near each other but not touching do not merge', () => {
    const plan = resolveTerritoryChanges(
      [...blockCells(0, 0, 2, 2, 't-a'), ...blockCells(10, 0, 2, 2, 't-b')],
      new Set([cellKey(0, 5)]),
      NOW,
      new Map([['t-a', 1000], ['t-b', 2000]])
    );
    expect(plan.merges).toHaveLength(0);
  });

  it('credits the territory with most of the walk-s painted cells, tie broken by id', () => {
    const plan = resolveTerritoryChanges(
      [...blockCells(0, 0, 2, 2, 't-a'), ...blockCells(20, 0, 2, 2, 't-b')],
      new Set([cellKey(0, 0), cellKey(1, 0), cellKey(0, 1), cellKey(20, 0)]),
      NOW,
      new Map([['t-a', 1000], ['t-b', 2000]])
    );
    expect(plan.creditedTerritoryId).toBe('t-a');
  });

  it('re-covering only known ground resolves attribution with no births, merges or assignments', () => {
    const plan = resolveTerritoryChanges(HOME, new Set([cellKey(0, 0), cellKey(1, 1)]), NOW, CREATED);
    expect(plan.births).toHaveLength(0);
    expect(plan.merges).toHaveLength(0);
    expect(plan.newCellAssignments.size).toBe(0);
    expect(plan.creditedTerritoryId).toBe('t-home');
  });
});

describe('home and its centre', () => {
  it('home is the oldest territory (tie: lowest id)', () => {
    expect(pickHomeTerritoryId(new Map([['t-b', 5], ['t-a', 5], ['t-c', 1]]))).toBe('t-c');
    expect(pickHomeTerritoryId(new Map([['t-b', 5], ['t-a', 5]]))).toBe('t-a');
    expect(pickHomeTerritoryId(new Map())).toBeNull();
  });

  it('the centre is the median cell, so far patches that still count as home do not drag it away', () => {
    const coords = [...HOME, ...blockCells(300, 300, 7, 7, 't-home')].map((c) => ({ ix: c.ix, iy: c.iy }));
    const centre = territoryCentre(coords)!;
    expect(centre.ix).toBeLessThan(10);
    expect(centre.iy).toBeLessThan(10);
  });
});

describe('far patches: candidates and promotion', () => {
  const FAR_ORIGIN = 150; // 3 km away
  const farPatch = (w: number, h: number) => blockCells(FAR_ORIGIN, 0, w, h, 't-home');

  it('a far patch with 40+ cells that this walk touched is a candidate', () => {
    const patch = farPatch(8, 6); // 48 cells
    const painted = new Set([cellKey(FAR_ORIGIN, 0)]);
    const candidates = findPromotionCandidates([...HOME, ...patch], CREATED, painted);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].cellIds).toHaveLength(48);
    expect(candidates[0].anchorCell).toEqual({ ix: FAR_ORIGIN, iy: 0 });
  });

  it('too small, or not touched by this walk, is no candidate', () => {
    expect(findPromotionCandidates([...HOME, ...farPatch(6, 6)], CREATED, new Set([cellKey(FAR_ORIGIN, 0)]))).toHaveLength(0); // 36 cells
    expect(findPromotionCandidates([...HOME, ...farPatch(8, 6)], CREATED, new Set([cellKey(0, 0)]))).toHaveLength(0);
  });

  it('a patch physically connected to the home ground (a road out) is one place with home, never a candidate', () => {
    const road = Array.from({ length: 160 }, (_, i) => cell(10 + i, 5, 't-home')); // from home's edge to 3.2 km
    const patch = farPatch(8, 6);
    const painted = new Set([cellKey(FAR_ORIGIN, 0)]);
    expect(findPromotionCandidates([...HOME, ...road, ...patch], CREATED, painted)).toHaveLength(0);
  });

  it('only home ground is a candidate; an already shown territory is left alone', () => {
    const shown = blockCells(FAR_ORIGIN, 0, 8, 6, 't-far');
    expect(findPromotionCandidates([...HOME, ...shown], new Map([['t-home', 1000], ['t-far', 2000]]), new Set([cellKey(FAR_ORIGIN, 0)]))).toHaveLength(0);
  });

  it('promotes only with 2+ walks: this walk plus one earlier walk that touched the patch', () => {
    const candidate = { cellIds: Array.from(blockCellIds(FAR_ORIGIN, 0, 8, 6)), anchorCell: { ix: FAR_ORIGIN, iy: 0 } };
    const now = new Set([cellKey(FAR_ORIGIN, 1)]);
    const touching = new Set([cellKey(FAR_ORIGIN + 3, 3), cellKey(0, 0)]);
    const elsewhere = new Set([cellKey(0, 0)]);
    expect(confirmPromotions([candidate], now, [elsewhere])).toHaveLength(0);
    const [promotion] = confirmPromotions([candidate], now, [elsewhere, touching]);
    expect(promotion.walks).toBe(2);
    expect(promotion.cellIds).toHaveLength(48);
  });

  it('is deterministic: the same cells give the same candidates in any order', () => {
    const cells = [...HOME, ...farPatch(8, 6)];
    const painted = new Set([cellKey(FAR_ORIGIN, 0)]);
    const a = findPromotionCandidates(cells, CREATED, painted);
    const b = findPromotionCandidates([...cells].reverse(), CREATED, painted);
    expect(b.map((c) => c.cellIds.slice().sort())).toEqual(a.map((c) => c.cellIds.slice().sort()));
  });
});

describe('planTerritoryFolds', () => {
  const cells = [...blockCells(0, 0, 3, 3, 'h'), ...blockCells(100, 0, 3, 3, 'a'), ...blockCells(110, 0, 3, 3, 'b')];

  it('folds territories with fewer than 2 walks into the nearest kept one; home is always kept', () => {
    const folds = planTerritoryFolds(
      [
        { id: 'h', createdAt: 1, walksHere: 0 },
        { id: 'a', createdAt: 2, walksHere: 5 },
        { id: 'b', createdAt: 3, walksHere: 1 },
      ],
      cells
    );
    expect(folds).toEqual([{ loserId: 'b', survivorId: 'a' }]);
  });

  it('a household with one real territory ends with one: everything folds into home', () => {
    const folds = planTerritoryFolds(
      [
        { id: 'h', createdAt: 1, walksHere: 24 },
        { id: 'a', createdAt: 2, walksHere: 0 },
        { id: 'b', createdAt: 3, walksHere: 0 },
      ],
      cells
    );
    expect(folds.map((f) => f.survivorId)).toEqual(['h', 'h']);
  });

  it('plans nothing for a lone territory', () => {
    expect(planTerritoryFolds([{ id: 'h', createdAt: 1, walksHere: 0 }], cells)).toEqual([]);
  });
});

describe('resolveCelebrationTerritoryBeat', () => {
  it('a promotion gives the new-territory name; the first-ever territory (a birth) stays silent', () => {
    expect(resolveCelebrationTerritoryBeat({ merges: [] }, "Rex's territory on Aue", new Map()).newTerritoryName).toBe("Rex's territory on Aue");
    expect(resolveCelebrationTerritoryBeat({ merges: [] }, null, new Map()).newTerritoryName).toBeNull();
  });

  it('a merge gives the merge beat with both names', () => {
    const beat = resolveCelebrationTerritoryBeat({ merges: [{ survivorId: 't-a', loserId: 't-b' }] }, null, new Map([['t-a', 'Home'], ['t-b', 'Work']]));
    expect(beat.mergedTerritoryNames).toEqual(['Home', 'Work']);
  });
});

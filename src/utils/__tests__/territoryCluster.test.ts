import { Cell } from '../../storage/HomeRangeRepository';
import { TerritoryId } from '../../storage/TerritoryRepository';
import { cellKey } from '../grid';
import { resolveCelebrationTerritoryBeat, resolveTerritoryChanges, SPAWN_DISTANCE_M } from '../territoryCluster';

const NOW = Date.parse('2026-08-22T12:00:00Z');

/** A minimal Cell fixture — the fields territoryCluster.ts actually reads. */
function cell(ix: number, iy: number, territoryId: TerritoryId | null): Cell {
  return { ix, iy, lastRefreshed: NOW, lastTracked: NOW, visits: 1, territoryId };
}

/** A filled rectangular block of cell ids, origin at (originIx, originIy). */
function blockCellIds(originIx: number, originIy: number, width: number, height: number): Set<string> {
  const ids = new Set<string>();
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      ids.add(cellKey(originIx + dx, originIy + dy));
    }
  }
  return ids;
}

function blockCells(originIx: number, originIy: number, width: number, height: number, territoryId: TerritoryId | null): Cell[] {
  return Array.from(blockCellIds(originIx, originIy, width, height)).map((id) => {
    const [ix, iy] = id.split(',').map(Number);
    return cell(ix, iy, territoryId);
  });
}

describe('resolveTerritoryChanges', () => {
  it('the first-ever walk births exactly one territory, with no existing-territory beat implied', () => {
    const painted = blockCellIds(0, 0, 3, 3);

    const plan = resolveTerritoryChanges([], painted, NOW, new Map());

    expect(plan.hadExistingTerritoryBefore).toBe(false);
    expect(plan.births).toHaveLength(1);
    expect(plan.births[0].cellIds).toHaveLength(9);
    expect(plan.merges).toHaveLength(0);
    // Every painted cell resolves to the single birth's provisional id.
    const provisionalId = plan.births[0].provisionalId;
    for (const id of painted) {
      expect(plan.newCellAssignments.get(id)).toBe(provisionalId);
    }
    expect(plan.creditedTerritoryId).toBe(provisionalId);
  });

  it('ground within SPAWN_DISTANCE_M of exactly one existing territory assimilates without birthing', () => {
    // Existing territory: a 3x3 block at the origin. One 20m cell = one grid
    // index step at this scale's approximation used in this test (real
    // metre distance is computed via haversine on cell centres, so we pick
    // an offset comfortably inside SPAWN_DISTANCE_M in real metres: ~10
    // cell-widths away, well under the ~20-cell-width 400m threshold).
    const existingCells = blockCells(0, 0, 3, 3, 't-existing');
    const newGround = blockCellIds(10, 0, 2, 2); // a short gap away, not touching

    const plan = resolveTerritoryChanges(existingCells, newGround, NOW, new Map([['t-existing', 1000]]));

    expect(plan.hadExistingTerritoryBefore).toBe(true);
    expect(plan.births).toHaveLength(0);
    for (const id of newGround) {
      expect(plan.newCellAssignments.get(id)).toBe('t-existing');
    }
    expect(plan.creditedTerritoryId).toBe('t-existing');
  });

  it('ground farther than SPAWN_DISTANCE_M from every existing territory births a new one', () => {
    const existingCells = blockCells(0, 0, 3, 3, 't-existing');
    // ~30 cell-widths away (~600m at CELL_M=20m) — farther than SPAWN_DISTANCE_M.
    const farGround = blockCellIds(30, 0, 3, 3);

    const plan = resolveTerritoryChanges(existingCells, farGround, NOW, new Map([['t-existing', 1000]]));

    expect(plan.births).toHaveLength(1);
    expect(plan.merges).toHaveLength(0);
    for (const id of farGround) {
      expect(plan.newCellAssignments.get(id)).not.toBe('t-existing');
    }
  });

  it('two territories whose cells become literally 8-neighbour-adjacent merge, older surviving', () => {
    // Territory A: 2x2 block at origin (older). Territory B: 2x2 block just
    // out of reach, connected this walk by a bridging cell that touches both.
    const territoryA = blockCells(0, 0, 2, 2, 't-a'); // cells (0,0)-(1,1)
    const territoryB = blockCells(3, 0, 2, 2, 't-b'); // cells (3,0)-(4,1)
    const bridgingGround = new Set([cellKey(2, 0)]); // adjacent to both (1,0) and (3,0)

    const plan = resolveTerritoryChanges(
      [...territoryA, ...territoryB],
      bridgingGround,
      NOW,
      new Map([
        ['t-a', 1000], // older
        ['t-b', 2000],
      ])
    );

    expect(plan.merges).toEqual([{ survivorId: 't-a', loserId: 't-b' }]);
  });

  it('two territories within spawn distance but not literally touching do not merge', () => {
    const territoryA = blockCells(0, 0, 2, 2, 't-a');
    const territoryB = blockCells(10, 0, 2, 2, 't-b');
    // A small new patch near A only — not bridging to B, not touching either.
    const newGround = new Set([cellKey(0, 5)]);

    const plan = resolveTerritoryChanges(
      [...territoryA, ...territoryB],
      newGround,
      NOW,
      new Map([
        ['t-a', 1000],
        ['t-b', 2000],
      ])
    );

    expect(plan.merges).toHaveLength(0);
  });

  it('a walk with two disconnected new blobs births two territories in one walk', () => {
    const blobA = blockCellIds(0, 0, 2, 2);
    const blobB = blockCellIds(50, 50, 2, 2); // far from blobA and from nothing else
    const painted = new Set([...blobA, ...blobB]);

    const plan = resolveTerritoryChanges([], painted, NOW, new Map());

    expect(plan.births).toHaveLength(2);
    const totalBirthedCells = plan.births.reduce((sum, b) => sum + b.cellIds.length, 0);
    expect(totalBirthedCells).toBe(8);
  });

  it('majority-cell attribution picks the territory with the most of this walk-s painted cells, tie-broken deterministically', () => {
    const territoryA = blockCells(0, 0, 2, 2, 't-a'); // 4 cells
    const territoryB = blockCells(20, 0, 2, 2, 't-b'); // 4 cells, far from A
    // This walk re-covers 3 cells of A and 1 cell of B (a manual repaint scenario) — A should win.
    const painted = new Set([cellKey(0, 0), cellKey(1, 0), cellKey(0, 1), cellKey(20, 0)]);

    const plan = resolveTerritoryChanges(
      [...territoryA, ...territoryB],
      painted,
      NOW,
      new Map([
        ['t-a', 1000],
        ['t-b', 2000],
      ])
    );

    expect(plan.creditedTerritoryId).toBe('t-a');
  });

  it('re-covering only known ground (no new cells) still resolves attribution with no births/merges', () => {
    const territoryA = blockCells(0, 0, 2, 2, 't-a');
    const painted = new Set([cellKey(0, 0), cellKey(1, 1)]);

    const plan = resolveTerritoryChanges(territoryA, painted, NOW, new Map([['t-a', 1000]]));

    expect(plan.births).toHaveLength(0);
    expect(plan.merges).toHaveLength(0);
    expect(plan.newCellAssignments.size).toBe(0);
    expect(plan.creditedTerritoryId).toBe('t-a');
  });

  it('SPAWN_DISTANCE_M is 400 (the documented default)', () => {
    expect(SPAWN_DISTANCE_M).toBe(400);
  });
});

describe('resolveCelebrationTerritoryBeat', () => {
  it('the player\'s very first-ever territory produces no birth beat', () => {
    const plan = { births: [{ provisionalId: 'new-territory-0', anchorCell: { ix: 0, iy: 0 }, cellIds: ['0,0'] }], merges: [], hadExistingTerritoryBefore: false };

    const beat = resolveCelebrationTerritoryBeat(plan, new Map([['new-territory-0', "Buddy's First Range"]]), new Map());

    expect(beat.newTerritoryName).toBeNull();
  });

  it('a second territory (player already had one before this walk) produces a birth beat', () => {
    const plan = { births: [{ provisionalId: 'new-territory-0', anchorCell: { ix: 0, iy: 0 }, cellIds: ['0,0'] }], merges: [], hadExistingTerritoryBefore: true };

    const beat = resolveCelebrationTerritoryBeat(plan, new Map([['new-territory-0', "Buddy's Second Range"]]), new Map());

    expect(beat.newTerritoryName).toBe("Buddy's Second Range");
  });

  it('two births on the very first walk: the first is silent, the second announces', () => {
    const plan = {
      births: [
        { provisionalId: 'new-territory-0', anchorCell: { ix: 0, iy: 0 }, cellIds: ['0,0'] },
        { provisionalId: 'new-territory-1', anchorCell: { ix: 50, iy: 50 }, cellIds: ['50,50'] },
      ],
      merges: [],
      hadExistingTerritoryBefore: false,
    };

    const beat = resolveCelebrationTerritoryBeat(
      plan,
      new Map([
        ['new-territory-0', 'First'],
        ['new-territory-1', 'Second'],
      ]),
      new Map()
    );

    expect(beat.newTerritoryName).toBe('Second');
  });

  it('a merge produces the merge beat with both names', () => {
    const plan = { births: [], merges: [{ survivorId: 't-a', loserId: 't-b' }], hadExistingTerritoryBefore: true };

    const beat = resolveCelebrationTerritoryBeat(
      plan,
      new Map(),
      new Map([
        ['t-a', 'Home Range'],
        ['t-b', 'Work Range'],
      ])
    );

    expect(beat.mergedTerritoryNames).toEqual(['Home Range', 'Work Range']);
  });

  it('a walk with neither a birth nor a merge produces no beats', () => {
    const plan = { births: [], merges: [], hadExistingTerritoryBefore: true };

    const beat = resolveCelebrationTerritoryBeat(plan, new Map(), new Map());

    expect(beat.newTerritoryName).toBeNull();
    expect(beat.mergedTerritoryNames).toBeNull();
  });
});

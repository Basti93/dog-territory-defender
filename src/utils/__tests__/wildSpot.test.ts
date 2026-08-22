import { Cell } from '../../storage/HomeRangeRepository';
import { CELLS_PER_STREET } from '../grid';
import { wildestCluster, WILD_THRESHOLD } from '../wildSpot';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-22T12:00:00Z');

// WILD_THRESHOLD is a wildness (0..1) value; ~10 days of no refresh clears
// it comfortably (see utils/grid.ts's wildness() curve — reaches its ceiling
// at 18 days), while a cell refreshed "now" always reads as wildness 0.
const WILD_DAYS_AGO = NOW - 10 * MS_PER_DAY;
const FRESH = NOW;

/** A filled rectangular block of cells, origin at (originIx, originIy), width x height. */
function block(originIx: number, originIy: number, width: number, height: number, opts: { lastRefreshed: number; visits: number }): Cell[] {
  const cells: Cell[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      cells.push({
        ix: originIx + dx,
        iy: originIy + dy,
        lastRefreshed: opts.lastRefreshed,
        lastTracked: opts.lastRefreshed,
        visits: opts.visits,
        territoryId: null,
      });
    }
  }
  return cells;
}

describe('wildestCluster', () => {
  it('picks the one clear winning cluster (highest summed visits) over a smaller/less-visited wild patch', () => {
    // Winner: 4x3 = 12 cells (clears CELLS_PER_STREET), each with 5 visits -> visitsSum 60.
    const winner = block(0, 0, 4, 3, { lastRefreshed: WILD_DAYS_AGO, visits: 5 });
    // Loser: same size, fewer visits per cell -> visitsSum 12, far away so components don't merge.
    const loser = block(100, 100, 4, 3, { lastRefreshed: WILD_DAYS_AGO, visits: 1 });

    const cluster = wildestCluster([...winner, ...loser], NOW);

    expect(cluster).not.toBeNull();
    expect(cluster!.visitsSum).toBe(60);
    expect(cluster!.cellIds.size).toBe(12);
    // Anchor's coordinates must belong to the winning block, not the loser.
    expect(cluster!.anchor.ix).toBeGreaterThanOrEqual(0);
    expect(cluster!.anchor.ix).toBeLessThan(4);
  });

  it('a tie on visits sum resolves deterministically (larger cell count wins, then lowest (ix, iy))', () => {
    // Two components with identical visitsSum (12 cells x 5 visits = 60,
    // and 15 cells x 4 visits = 60) — the larger cell count should win.
    const smaller = block(0, 0, 4, 3, { lastRefreshed: WILD_DAYS_AGO, visits: 5 }); // 12 cells, sum 60
    const larger = block(100, 100, 5, 3, { lastRefreshed: WILD_DAYS_AGO, visits: 4 }); // 15 cells, sum 60

    const cluster = wildestCluster([...smaller, ...larger], NOW);

    expect(cluster).not.toBeNull();
    expect(cluster!.cellIds.size).toBe(15);
  });

  it('a fully-tied pair of clusters (same visitsSum, same cell count) resolves to the lowest (ix, iy) component', () => {
    const first = block(0, 0, 4, 3, { lastRefreshed: WILD_DAYS_AGO, visits: 5 }); // 12 cells, sum 60
    const second = block(100, 100, 4, 3, { lastRefreshed: WILD_DAYS_AGO, visits: 5 }); // 12 cells, sum 60

    const cluster = wildestCluster([...first, ...second], NOW);

    expect(cluster).not.toBeNull();
    // The (0,0)-origin component has the lowest (ix, iy) representative cell.
    expect(cluster!.bounds).toEqual({ minIx: 0, maxIx: 3, minIy: 0, maxIy: 2 });
  });

  it('a component smaller than CELLS_PER_STREET is dropped even though every cell is wild', () => {
    expect(CELLS_PER_STREET).toBeGreaterThan(1);
    const tooSmall = block(0, 0, CELLS_PER_STREET - 1, 1, { lastRefreshed: WILD_DAYS_AGO, visits: 10 });

    expect(wildestCluster(tooSmall, NOW)).toBeNull();
  });

  it('an empty Range returns no winner', () => {
    expect(wildestCluster([], NOW)).toBeNull();
  });

  it('an all-fresh Range (every cell below WILD_THRESHOLD) returns no winner — the "neither" card state\'s data-level precondition', () => {
    const allFresh = block(0, 0, 6, 6, { lastRefreshed: FRESH, visits: 20 });

    expect(wildestCluster(allFresh, NOW)).toBeNull();
  });

  it('WILD_THRESHOLD is a real wildness value strictly between 0 and 1', () => {
    expect(WILD_THRESHOLD).toBeGreaterThan(0);
    expect(WILD_THRESHOLD).toBeLessThan(1);
  });

  it('anchor tie-break: among cells sharing the winning component\'s highest visits, picks the lowest (ix, iy)', () => {
    // Every cell has the same visits (5) except none stands out — the anchor
    // should be the lowest (ix, iy) cell in the whole component (0,0).
    const uniform = block(0, 0, 4, 3, { lastRefreshed: WILD_DAYS_AGO, visits: 5 });

    const cluster = wildestCluster(uniform, NOW);

    expect(cluster).not.toBeNull();
    expect(cluster!.anchor).toEqual({ ix: 0, iy: 0 });
    expect(cluster!.anchorCellId).toBe('0,0');
  });
});

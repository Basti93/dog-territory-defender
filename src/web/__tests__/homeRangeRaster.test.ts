import { Cell } from '../../storage/HomeRangeRepository';
import { wildness } from '../../utils/grid';
import { OUTSIDE_RANGE_SENTINEL, buildHomeRangeRasterPayload, cellIdsToCoords, encodeBase64 } from '../homeRangeRaster';

function decodeBase64(b64: string): Uint8Array {
  // Node's Buffer is available under jest's node test environment.
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function makeCell(overrides: Partial<Cell>): Cell {
  return { ix: 0, iy: 0, lastRefreshed: 0, lastTracked: 0, visits: 1, ...overrides };
}

describe('encodeBase64', () => {
  it('round-trips arbitrary byte arrays (via Node Buffer decode)', () => {
    for (const bytes of [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([255]),
      new Uint8Array([1, 2, 3]),
      new Uint8Array([1, 2, 3, 4]),
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array(Array.from({ length: 50 }, (_, i) => i * 5)),
    ]) {
      const encoded = encodeBase64(bytes);
      const decoded = decodeBase64(encoded);
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    }
  });
});

describe('buildHomeRangeRasterPayload', () => {
  it('returns null when there are no cells and no live overlay', () => {
    expect(buildHomeRangeRasterPayload([], 1000)).toBeNull();
  });

  it('builds a 1x1 raster for a single cell', () => {
    const now = 1_000_000;
    const cell = makeCell({ ix: 5, iy: -3, lastRefreshed: now, visits: 4 });

    const payload = buildHomeRangeRasterPayload([cell], now);

    expect(payload).not.toBeNull();
    expect(payload!.origin).toEqual([5, -3]);
    expect(payload!.w).toBe(1);
    expect(payload!.h).toBe(1);

    const wild = decodeBase64(payload!.wild);
    const visits = decodeBase64(payload!.visits);
    expect(wild[0]).toBe(0); // just refreshed -> wildness 0
    expect(visits[0]).toBe(4);
  });

  it('sizes the raster to the bounding box of all cells, and marks empty cells with the outside-Range sentinel', () => {
    const now = 1_000_000;
    const cells = [makeCell({ ix: 0, iy: 0, lastRefreshed: now }), makeCell({ ix: 2, iy: 1, lastRefreshed: now })];

    const payload = buildHomeRangeRasterPayload(cells, now)!;

    expect(payload.origin).toEqual([0, 0]);
    expect(payload.w).toBe(3); // ix 0..2
    expect(payload.h).toBe(2); // iy 0..1

    const wild = decodeBase64(payload.wild);
    // (0,0) at index 0, (2,1) at index (1*3 + 2) = 5. Everything else is sentinel.
    expect(wild[0]).toBe(0);
    expect(wild[5]).toBe(0);
    expect(wild[1]).toBe(OUTSIDE_RANGE_SENTINEL);
    expect(wild[3]).toBe(OUTSIDE_RANGE_SENTINEL);
  });

  it('quantises wildness into the 0..254 band, reserving 255 for the sentinel', () => {
    const now = 1_000_000;
    const eighteenDaysAgo = now - 18 * 24 * 60 * 60 * 1000;
    const cell = makeCell({ ix: 0, iy: 0, lastRefreshed: eighteenDaysAgo });

    const payload = buildHomeRangeRasterPayload([cell], now)!;
    const wild = decodeBase64(payload.wild);

    expect(wildness(eighteenDaysAgo, now)).toBe(1); // fully wild
    expect(wild[0]).toBe(254); // quantised max, distinct from the 255 sentinel
  });

  it('overlays live-walk-only cells as fully fresh (wildness 0), extending the bounding box if needed', () => {
    const now = 1_000_000;
    const persisted = [makeCell({ ix: 0, iy: 0, lastRefreshed: now - 20 * 24 * 60 * 60 * 1000 })]; // fully wild

    const payload = buildHomeRangeRasterPayload(persisted, now, [{ ix: 3, iy: 0 }])!;

    expect(payload.w).toBe(4); // ix 0..3
    const wild = decodeBase64(payload.wild);
    expect(wild[0]).toBe(254); // the old persisted cell stays wild
    expect(wild[3]).toBe(0); // the live-walk cell renders fresh
  });

  it('returns a payload driven entirely by the live overlay when there are no persisted cells yet (first-ever walk in progress)', () => {
    const payload = buildHomeRangeRasterPayload([], 1000, [{ ix: 0, iy: 0 }]);
    expect(payload).not.toBeNull();
    expect(payload!.w).toBe(1);
    expect(payload!.h).toBe(1);
  });
});

describe('cellIdsToCoords', () => {
  it('parses a Set<CellId> into coordinate objects', () => {
    const coords = cellIdsToCoords(new Set(['1,2', '-3,4']));
    expect(coords).toEqual(expect.arrayContaining([{ ix: 1, iy: 2 }, { ix: -3, iy: 4 }]));
  });
});

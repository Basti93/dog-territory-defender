import * as fs from 'fs';
import * as path from 'path';

import { BALANCE } from '../../economy/balanceConfig';
import { Location } from '../../types';
import {
  CELL_M,
  MIN_CELLS_FOR_REWARD,
  NEW_GROUND_MIN_CELLS,
  cellForLocation,
  cellKey,
  newGroundCells,
  paintedCells,
  PAINT_MAX_ACCURACY_M,
  walkedCells,
  splitTrailByNewGround,
  streetsKnown,
  wildness,
} from '../grid';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const M_PER_DEG_LAT = 111320;

// --- synthetic route generator, mirroring home-range-prototype.mjs's rectLoop
// so the false-positive/true-positive worked values in design.md Decision 5
// are reproducible here, not just asserted from the script's own console output. ---

const LAT0 = 48.1374;
const LON0 = 11.5755;
const mToLat = (m: number) => m / M_PER_DEG_LAT;
const mToLon = (m: number) => m / (M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180));

// Deterministic PRNG (mulberry32), same shape as the prototype's, so repeated
// test runs are stable.
function mulberry(seed: number) {
  let a = seed;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, normal: () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next()) };
}

interface RectLoopOpts {
  perimeterM?: number;
  offsetE?: number;
  offsetN?: number;
  aspect?: number;
  jitterM?: number;
  rng?: ReturnType<typeof mulberry> | null;
}

function rectLoop({
  perimeterM = 1500,
  offsetE = 0,
  offsetN = 0,
  aspect = 1.5,
  jitterM = 0,
  rng = null,
}: RectLoopOpts = {}): Location[] {
  const half = perimeterM / 2;
  const w = (half * aspect) / (1 + aspect);
  const h = half - w;
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
    [0, 0],
  ];
  const pts: Location[] = [];
  let t = 0;
  for (let i = 1; i < corners.length; i++) {
    const [x0, y0] = corners[i - 1];
    const [x1, y1] = corners[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(len / 2));
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      let e = offsetE + x0 + (x1 - x0) * u;
      let n = offsetN + y0 + (y1 - y0) * u;
      if (jitterM > 0 && rng) {
        e += rng.normal() * jitterM;
        n += rng.normal() * jitterM;
      }
      pts.push({
        latitude: LAT0 + mToLat(n),
        longitude: LON0 + mToLon(e),
        timestamp: t * 1000,
        accuracy: 5,
      });
      t += 2 / 1.4;
    }
  }
  return pts;
}

// --- minimal test-only GPX -> Location[] helper (task 1.4) ---

function parseGpx(filePath: string): Location[] {
  const xml = fs.readFileSync(filePath, 'utf-8');
  const points: Location[] = [];
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)">([\s\S]*?)<\/trkpt>/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = trkptRegex.exec(xml)) !== null) {
    const [, latStr, lonStr, body] = match;
    const timeMatch = body.match(/<time>([^<]+)<\/time>/);
    const timestamp = timeMatch ? new Date(timeMatch[1]).getTime() : index * 2000;
    points.push({
      latitude: parseFloat(latStr),
      longitude: parseFloat(lonStr),
      timestamp,
      accuracy: 5,
    });
    index++;
  }
  return points;
}

describe('wildness', () => {
  const t0 = Date.parse('2026-01-01T00:00:00Z');

  it('is 0 at the moment of refresh', () => {
    expect(wildness(t0, t0)).toBe(0);
  });

  it('reaches exactly 1 at the 18-day ceiling', () => {
    expect(wildness(t0, t0 + 18 * MS_PER_DAY)).toBe(1);
  });

  it('is bit-identical at 30 days and 365 days — no unbounded decay past the ceiling', () => {
    expect(wildness(t0, t0 + 30 * MS_PER_DAY)).toBe(wildness(t0, t0 + 365 * MS_PER_DAY));
    expect(wildness(t0, t0 + 30 * MS_PER_DAY)).toBe(1);
  });

  it('increases monotonically up to the ceiling', () => {
    let prev = wildness(t0, t0);
    for (let day = 1; day <= 18; day++) {
      const next = wildness(t0, t0 + day * MS_PER_DAY);
      expect(next).toBeGreaterThan(prev);
      prev = next;
    }
  });

  it('the one-day step from fresh is the largest single-day step (front-loaded curve)', () => {
    const step0to1 = wildness(t0, t0 + MS_PER_DAY) - wildness(t0, t0);
    const step13to14 = wildness(t0, t0 + 14 * MS_PER_DAY) - wildness(t0, t0 + 13 * MS_PER_DAY);
    expect(step0to1).toBeGreaterThan(step13to14);
  });
});

describe('cellForLocation / paintedCells — grid geometry', () => {
  it('a typical 1.5km loop paints roughly the 165-cell figure measured in design.md', () => {
    const loop = rectLoop({ perimeterM: 1500 });
    const cells = paintedCells(loop);
    // design.md measured exactly 165 for its own synthetic loop; allow a wide
    // band since exact step counts depend on corner rounding, not asserting
    // bit-identical reproduction of a different implementation's loop walk.
    expect(cells.size).toBeGreaterThan(120);
    expect(cells.size).toBeLessThan(220);
  });

  it('a qualifying walk clears MIN_CELLS_FOR_REWARD (~200m of real ground)', () => {
    const loop = rectLoop({ perimeterM: 1500 });
    expect(paintedCells(loop).size).toBeGreaterThanOrEqual(MIN_CELLS_FOR_REWARD);
  });

  it('nearby locations map to the same or an adjacent cell (no drift at boundaries)', () => {
    const a = cellForLocation(48.1374, 11.5755);
    const b = cellForLocation(48.1374 + 0.00001, 11.5755 + 0.00001);
    expect(Math.abs(a.ix - b.ix)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.iy - b.iy)).toBeLessThanOrEqual(1);
  });
});

describe('paintedCells — anti-exploit segment guards', () => {
  it('does not paint through a signal-dropout gap (> MAX_SEGMENT_M)', () => {
    const a: Location = { latitude: 48.1374, longitude: 11.5755, timestamp: 0, accuracy: 5 };
    // ~500m away, teleport-style — should not paint a corridor between them.
    const b: Location = { latitude: 48.1374 + mToLat(500), longitude: 11.5755, timestamp: 10_000, accuracy: 5 };

    const cells = paintedCells([a, b]);
    const midLat = 48.1374 + mToLat(250);
    const midCell = cellForLocation(midLat, 11.5755);
    const midCellKey = `${midCell.ix},${midCell.iy}`;
    expect(Array.from(cells)).not.toContain(midCellKey);
  });

  it('does not paint a segment implying travel faster than a dog walk', () => {
    const a: Location = { latitude: 48.1374, longitude: 11.5755, timestamp: 0, accuracy: 5 };
    // 50m in 1 second = 50 m/s, far beyond MAX_SEGMENT_SPEED_MS (4.5 m/s).
    const b: Location = { latitude: 48.1374 + mToLat(50), longitude: 11.5755, timestamp: 1_000, accuracy: 5 };

    const cells = paintedCells([a, b]);
    const midLat = 48.1374 + mToLat(25);
    const midCell = cellForLocation(midLat, 11.5755);
    const midCellKey = `${midCell.ix},${midCell.iy}`;
    expect(Array.from(cells)).not.toContain(midCellKey);
  });
});

describe('newGroundCells — 8-neighbour dilation (design.md Decision 5)', () => {
  const rng = mulberry(20260821);
  const rangeBase = paintedCells(rectLoop({ perimeterM: 1500 }));

  it('the same loop re-walked with GPS jitter up to 20m never fires New Ground', () => {
    for (const sigma of [4, 8, 12, 15, 20]) {
      for (let i = 0; i < 20; i++) {
        const jittered = paintedCells(rectLoop({ perimeterM: 1500, jitterM: sigma, rng }));
        const newCells = newGroundCells(jittered, rangeBase);
        expect(newCells.size).toBeLessThan(NEW_GROUND_MIN_CELLS);
      }
    }
  });

  it('a 220m out-and-back detour down an unwalked street fires New Ground; 200m does not', () => {
    const makeDetourWalk = (detourM: number): Location[] => {
      const pts = rectLoop({ perimeterM: 1500 });
      const anchorIdx = Math.floor(pts.length / 4);
      const anchor = pts[anchorIdx];
      const spur: Location[] = [];
      for (let m = 0; m <= detourM; m += 2) {
        spur.push({
          latitude: anchor.latitude,
          longitude: anchor.longitude + mToLon(m),
          timestamp: anchor.timestamp + (m / 1.4) * 1000,
          accuracy: 5,
        });
      }
      return [...pts.slice(0, anchorIdx), ...spur, ...spur.slice().reverse(), ...pts.slice(anchorIdx)];
    };

    const at200 = newGroundCells(paintedCells(makeDetourWalk(200)), rangeBase);
    const at220 = newGroundCells(paintedCells(makeDetourWalk(220)), rangeBase);

    expect(at200.size).toBeLessThan(NEW_GROUND_MIN_CELLS);
    expect(at220.size).toBeGreaterThanOrEqual(NEW_GROUND_MIN_CELLS);
  });

  it('a first-ever walk (empty Range) fires New Ground entirely', () => {
    const walk = paintedCells(rectLoop({ perimeterM: 1500 }));
    const newCells = newGroundCells(walk, new Set());
    expect(newCells.size).toBe(walk.size);
  });
});

describe('splitTrailByNewGround (docs/decisions/walk-portrait.md Decision 4)', () => {
  // Points spaced 25m apart along a straight line — comfortably more than
  // one CELL_M (20m) apart, so each point lands in its own distinct cell,
  // with no ambiguity from the anti-exploit segment guards (this function
  // doesn't resample/guard at all, unlike paintedCells).
  function pointAt(indexAlongLine: number): Location {
    return {
      latitude: LAT0 + mToLat(indexAlongLine * 25),
      longitude: LON0,
      timestamp: indexAlongLine * 1000,
      accuracy: 5,
    };
  }

  function cellIdFor(loc: Location): string {
    const { ix, iy } = cellForLocation(loc.latitude, loc.longitude);
    return cellKey(ix, iy);
  }

  it('returns an empty array for an empty trail', () => {
    expect(splitTrailByNewGround([], [])).toEqual([]);
  });

  it('a missing newGroundCellIds produces one all-base run', () => {
    const trail = [pointAt(0), pointAt(1), pointAt(2)];
    const runs = splitTrailByNewGround(trail);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({ color: 'base', points: trail });
  });

  it('an empty newGroundCellIds produces one all-base run', () => {
    const trail = [pointAt(0), pointAt(1), pointAt(2)];
    const runs = splitTrailByNewGround(trail, []);
    expect(runs).toHaveLength(1);
    expect(runs[0].color).toBe('base');
  });

  it('New Ground only at the start produces [new-ground, base]', () => {
    const trail = [pointAt(0), pointAt(1), pointAt(2), pointAt(3)];
    const newGroundCellIds = [cellIdFor(trail[0])];

    const runs = splitTrailByNewGround(trail, newGroundCellIds);

    expect(runs.map((r) => r.color)).toEqual(['new-ground', 'base']);
    expect(runs[0].points).toEqual([trail[0]]);
    expect(runs[1].points).toEqual(trail.slice(1));
  });

  it('New Ground only at the end produces [base, new-ground]', () => {
    const trail = [pointAt(0), pointAt(1), pointAt(2), pointAt(3)];
    const newGroundCellIds = [cellIdFor(trail[3])];

    const runs = splitTrailByNewGround(trail, newGroundCellIds);

    expect(runs.map((r) => r.color)).toEqual(['base', 'new-ground']);
    expect(runs[1].points).toEqual([trail[3]]);
  });

  it('New Ground interleaved in the middle produces [base, new-ground, base]', () => {
    const trail = [pointAt(0), pointAt(1), pointAt(2), pointAt(3), pointAt(4)];
    const newGroundCellIds = [cellIdFor(trail[2])];

    const runs = splitTrailByNewGround(trail, newGroundCellIds);

    expect(runs.map((r) => r.color)).toEqual(['base', 'new-ground', 'base']);
    expect(runs[1].points).toEqual([trail[2]]);
  });

  it('a single-point trail produces one run of that one color', () => {
    const trail = [pointAt(0)];
    const runsBase = splitTrailByNewGround(trail, []);
    expect(runsBase).toEqual([{ color: 'base', points: trail }]);

    const runsNewGround = splitTrailByNewGround(trail, [cellIdFor(trail[0])]);
    expect(runsNewGround).toEqual([{ color: 'new-ground', points: trail }]);
  });
});

describe('streetsKnown', () => {
  it('is 0 for an empty Range', () => {
    expect(streetsKnown(0)).toBe(0);
  });

  it('is monotonic in rangeCellCount and never below 1 for a non-empty Range', () => {
    expect(streetsKnown(1)).toBe(1);
    expect(streetsKnown(10)).toBe(1);
    expect(streetsKnown(11)).toBe(1);
    expect(streetsKnown(22)).toBe(2);
    expect(streetsKnown(165)).toBe(15); // design.md's worked "one 1.5km walk -> 15 streets" figure
  });
});

describe('GPX replay through paintedCells: synthetic fixtures in testing/', () => {
  const gpxDir = path.join(__dirname, '../../../testing');
  const cellsOf = (file: string) => paintedCells(parseGpx(path.join(gpxDir, file)));
  // The XP area cap is measured in painted cells at 400 m2 each (balanceConfig.ts xp.areaCapM2).
  const areaCapCells = BALANCE.xp.areaCapM2 / 400;

  it.each(['sample-route-short.gpx', 'sample-route.gpx'])('%s stays under the reward floor and the XP area cap', (file) => {
    const cells = cellsOf(file);
    expect(cells.size).toBeGreaterThan(0);
    expect(cells.size).toBeLessThan(MIN_CELLS_FOR_REWARD);
    expect(cells.size).toBeLessThan(areaCapCells);
  });

  it('sample-route-long.gpx (700 m) clears the reward floor and goes over the XP area cap', () => {
    const cells = cellsOf('sample-route-long.gpx');
    expect(cells.size).toBeGreaterThanOrEqual(MIN_CELLS_FOR_REWARD);
    expect(cells.size).toBeGreaterThan(areaCapCells);
  });
});

// Keep CELL_M's real-world meaning honest — a sanity guard, not a design
// decision re-litigated here.
describe('CELL_M', () => {
  it('is 20 metres, per design.md Decision 1', () => {
    expect(CELL_M).toBe(20);
  });
});

describe('paint accuracy split (trail accepts up to 50 m, painting only up to 30 m)', () => {
  const fix = (ix: number, accuracy: number, t: number): Location => ({
    latitude: LAT0,
    longitude: LON0 + mToLon(ix * 8),
    timestamp: 1_800_000_000_000 + t * 5000,
    accuracy,
  });
  const straight = (accuracyOf: (i: number) => number): Location[] => Array.from({ length: 30 }, (_, i) => fix(i, accuracyOf(i), i));

  it('uses 30 m, the old threshold', () => {
    expect(PAINT_MAX_ACCURACY_M).toBe(30);
  });

  it('paints exactly as before when every fix is within 30 m', () => {
    expect(paintedCells(straight(() => 30)).size).toBeGreaterThan(20);
  });

  it('paints nothing from fixes between 30 and 50 m', () => {
    expect(paintedCells(straight(() => 45)).size).toBe(0);
    expect(walkedCells(straight(() => 45)).size).toBe(0);
  });

  it('a pocket walk with some rough fixes paints from the good ones only (no cell comes from a rough fix)', () => {
    const mixed = straight((i) => (i % 3 === 0 ? 20 : 45));
    const goodOnly = mixed.filter((l) => l.accuracy <= PAINT_MAX_ACCURACY_M);
    expect(paintedCells(mixed)).toEqual(paintedCells(goodOnly));
  });

  it('fixes without a usable accuracy still paint (older stored walks)', () => {
    const legacy = straight(() => 5).map((l) => ({ ...l, accuracy: undefined as unknown as number }));
    expect(paintedCells(legacy).size).toBe(paintedCells(straight(() => 5)).size);
  });
});

import {
  cumulativeDistance,
  cumulativeDistanceLegacy,
  DISTANCE_RULE_SINCE_MS,
  getDistance,
  splitAtGaps,
  stepCountsAsDistance,
  walkDistanceMeters,
  walkHasMovement,
} from '../geometry';
import { Location } from '../../types';
import { NO_MOVEMENT_CELLS_BELOW, NO_MOVEMENT_MAX_DISTANCE_M, NO_MOVEMENT_RADIUS_M, paintedCells } from '../grid';

function offsetLatitude(lat: number, meters: number): number {
  return lat + meters / 111320;
}

describe('cumulativeDistance', () => {
  it('is 0 for fewer than 2 points', () => {
    expect(cumulativeDistance([])).toBe(0);
    expect(cumulativeDistance([{ latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 }])).toBe(0);
  });

  it('sums consecutive point-to-point distances, not just start-to-end', () => {
    const base = { latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 };
    const locations = [
      base,
      { ...base, latitude: offsetLatitude(base.latitude, 50), timestamp: 40_000 }, // 50m north
      { ...base, timestamp: 80_000 }, // 50m back south — net displacement 0, but real distance traveled is 100m
    ];

    const total = cumulativeDistance(locations);

    // start-to-end distance would be ~0; cumulative distance must reflect the out-and-back
    expect(total).toBeGreaterThan(80);
    expect(total).toBeLessThan(120);
  });

  it('matches getDistance for a simple two-point walk', () => {
    const a = { latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 };
    const b = { latitude: 52.5004, longitude: 13.4, timestamp: 40_000, accuracy: 5 };

    expect(cumulativeDistance([a, b])).toBeCloseTo(getDistance(a.latitude, a.longitude, b.latitude, b.longitude), 5);
  });
});

// A fix `metres` north of the origin, `seconds` after t=0 (the origin fix is at t=0).
const ORIGIN: Location = { latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 };
function fixAt(metres: number, seconds: number | undefined, from: Location = ORIGIN): Location {
  return { ...from, latitude: offsetLatitude(from.latitude, metres), timestamp: seconds === undefined ? (undefined as unknown as number) : from.timestamp + seconds * 1000 };
}

describe('the distance rule (docs/specs/walk-lifecycle.md)', () => {
  it('counts a normal step: at most 60 m and at most 4.5 m/s', () => {
    expect(stepCountsAsDistance(ORIGIN, fixAt(50, 20))).toBe(true); // 2.5 m/s
    expect(stepCountsAsDistance(ORIGIN, fixAt(59, 20))).toBe(true);
    expect(stepCountsAsDistance(ORIGIN, fixAt(50, 10))).toBe(false); // 5 m/s: a bike or a jump
    expect(stepCountsAsDistance(ORIGIN, fixAt(18, 4))).toBe(true); // exactly 4.5 m/s
  });

  it('counts a dropout bridge: over 60 m up to 250 m, within 180 s, average at most 2 m/s', () => {
    expect(stepCountsAsDistance(ORIGIN, fixAt(100, 60))).toBe(true); // 1.7 m/s
    expect(stepCountsAsDistance(ORIGIN, fixAt(240, 150))).toBe(true); // 1.6 m/s
    expect(stepCountsAsDistance(ORIGIN, fixAt(100, 30))).toBe(false); // 3.3 m/s: not a stroll
    expect(stepCountsAsDistance(ORIGIN, fixAt(300, 200))).toBe(false); // over 250 m
    expect(stepCountsAsDistance(ORIGIN, fixAt(300, 400))).toBe(false);
    expect(stepCountsAsDistance(ORIGIN, fixAt(100, 181))).toBe(false); // over 180 s
  });

  it('with a missing, zero or negative time difference counts only up to 60 m', () => {
    expect(stepCountsAsDistance(ORIGIN, fixAt(50, undefined))).toBe(true);
    expect(stepCountsAsDistance(ORIGIN, fixAt(50, 0))).toBe(true);
    expect(stepCountsAsDistance(ORIGIN, fixAt(100, 0))).toBe(false);
    expect(stepCountsAsDistance(ORIGIN, fixAt(100, undefined))).toBe(false);
    expect(stepCountsAsDistance(fixAt(0, 10), fixAt(100, 0))).toBe(false); // clock went backwards
  });

  it('a zero time step (fixes under 1 ms apart collapse to the same ms) never divides: up to 60 m counts, more does not', () => {
    const a: Location = { ...ORIGIN, timestamp: Math.round(1792359406662.2) };
    const near: Location = { ...fixAt(30, 0, a), timestamp: Math.round(1792359406662.4) };
    const far: Location = { ...fixAt(90, 0, a), timestamp: Math.round(1792359406662.4) };
    expect(near.timestamp - a.timestamp).toBe(0);
    expect(stepCountsAsDistance(a, near)).toBe(true);
    expect(stepCountsAsDistance(a, far)).toBe(false);
    expect(Number.isFinite(cumulativeDistance([a, near]))).toBe(true);
  });

  it('cumulativeDistance skips failing steps; the legacy sum counts everything', () => {
    const a = ORIGIN;
    const b = fixAt(40, 30, a);
    const jump = fixAt(2000, 60, b); // tram ride
    const c = fixAt(40, 30, jump);
    const track = [a, b, jump, c];
    const step = getDistance(a.latitude, a.longitude, b.latitude, b.longitude);
    expect(cumulativeDistance(track)).toBeCloseTo(step * 2, 3);
    expect(cumulativeDistanceLegacy(track)).toBeGreaterThan(2000);
  });

  it('walkDistanceMeters keeps the legacy sum for walks that started before the rule shipped', () => {
    const jump = [ORIGIN, fixAt(2000, 60)];
    expect(walkDistanceMeters({ startTime: DISTANCE_RULE_SINCE_MS - 1, locations: jump })).toBeCloseTo(cumulativeDistanceLegacy(jump), 5);
    expect(walkDistanceMeters({ startTime: DISTANCE_RULE_SINCE_MS, locations: jump })).toBe(0);
  });

  it('the filtered distance is never above the legacy distance', () => {
    const track = [ORIGIN, fixAt(30, 20), fixAt(500, 40), fixAt(530, 60), fixAt(600, 100)];
    expect(cumulativeDistance(track)).toBeLessThanOrEqual(cumulativeDistanceLegacy(track));
  });
});

describe('splitAtGaps', () => {
  it('is [] for no points and one run for a continuous trail', () => {
    expect(splitAtGaps([])).toEqual([]);
    const track = [ORIGIN, fixAt(10, 10), fixAt(20, 20)];
    expect(splitAtGaps(track)).toEqual([track]);
  });

  it('cuts where a step fails the rule, no matter what comes after', () => {
    const a = ORIGIN;
    const b = fixAt(30, 20, a);
    const c = fixAt(3000, 30, b); // ride
    const d = fixAt(30, 20, c);
    const e = fixAt(150, 100, d); // dropout bridge: stays connected
    expect(splitAtGaps([a, b, c, d, e])).toEqual([[a, b], [c, d, e]]);
  });
});

describe('walkHasMovement', () => {
  const T = DISTANCE_RULE_SINCE_MS + 1_000_000;
  /** Fixes `stepM` metres apart, every 20 s (a stroll, under the speed limit), heading north. */
  const trail = (n: number, stepM: number): Location[] =>
    Array.from({ length: n }, (_, i) => ({ latitude: offsetLatitude(52.5, i * stepM), longitude: 13.4, timestamp: T + i * 20_000, accuracy: 5 }));
  const walkOf = (locations: Location[]) => ({ startTime: T, locations });

  it('is false for a walk that never left its spot (no fixes, one fix, many fixes in place)', () => {
    expect(walkHasMovement(walkOf([]))).toBe(false);
    expect(walkHasMovement(walkOf(trail(1, 0)))).toBe(false);
    expect(walkHasMovement(walkOf(trail(30, 0)))).toBe(false);
  });

  it('is false just under the distance floor, true from it', () => {
    expect(walkDistanceMeters(walkOf(trail(2, NO_MOVEMENT_MAX_DISTANCE_M - 2)))).toBeLessThan(NO_MOVEMENT_MAX_DISTANCE_M);
    expect(walkHasMovement(walkOf(trail(2, NO_MOVEMENT_MAX_DISTANCE_M - 2)))).toBe(false);
    expect(walkHasMovement(walkOf(trail(2, NO_MOVEMENT_MAX_DISTANCE_M + 2)))).toBe(true);
    expect(walkHasMovement(walkOf(trail(11, 10)))).toBe(true); // 100 m in ten steps
  });

  it('counts a real walk even when some steps are filtered out as jumps', () => {
    const jump = trail(2, 3000); // a ride: adds no distance
    expect(walkHasMovement(walkOf([...trail(6, 20), ...jump.slice(1).map((l) => ({ ...l, timestamp: T + 60_000 }))]))).toBe(true);
  });

  it('a spot paints fewer cells than the floor, so the cell half never lets a stationary walk count as movement', () => {
    // Measured: one spot paints about 5 cells. The cell floor must stay above that or the rule goes dead.
    expect(paintedCells(trail(1, 0)).size).toBeLessThan(NO_MOVEMENT_CELLS_BELOW);
    expect(paintedCells(trail(1, 0)).size).toBeGreaterThanOrEqual(2); // so a floor of 2 could never hold
  });

  it('20 minutes of +-15 m GPS jitter around one point is no movement, although it sums to far more than 50 m', () => {
    // 120 fixes, one per 10 s, on a 15 m circle around one spot (a phone left standing). Steps are up to 30 m in 10 s, so they all count as distance.
    const jitter: Location[] = Array.from({ length: 120 }, (_, i) => {
      const angle = i * 2.4;
      return {
        latitude: 52.5 + (15 * Math.sin(angle)) / 111320,
        longitude: 13.4 + (15 * Math.cos(angle)) / (111320 * Math.cos((52.5 * Math.PI) / 180)),
        timestamp: T + i * 10_000,
        accuracy: 5,
      };
    });
    expect(walkDistanceMeters(walkOf(jitter))).toBeGreaterThan(5 * NO_MOVEMENT_MAX_DISTANCE_M);
    expect(walkHasMovement(walkOf(jitter))).toBe(false);
  });

  it('the radius is measured from the first fix: a trail that gets beyond it is movement, even if it comes back', () => {
    const out = trail(6, 10); // 50 m out, in 10 m steps
    const back = [...out].reverse().map((l, i) => ({ ...l, timestamp: T + (6 + i) * 20_000 }));
    expect(NO_MOVEMENT_RADIUS_M).toBeLessThan(50);
    expect(walkHasMovement(walkOf([...out, ...back]))).toBe(true);
    expect(walkHasMovement(walkOf(trail(5, 9)))).toBe(false); // 36 m out: inside the radius
  });

  it('a teleport (a step the distance rule rejects) is not movement', () => {
    expect(walkHasMovement(walkOf(trail(2, 3000)))).toBe(false);
  });
});

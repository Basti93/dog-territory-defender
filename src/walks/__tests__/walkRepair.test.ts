import { eastwardTrail } from '../../test/postcardFixtures';
import type { Location } from '../../types';
import {
  analyseWalk,
  sameStoredStats,
  statsFields,
  STATS_MAX_WALK_MS,
  STILL_TAIL_MIN_MS,
  stillTailStart,
  walkStatsOf,
  WALK_STATS_VERSION,
} from '../walkRepair';

const T0 = Date.UTC(2026, 9, 20, 8, 0, 0);
const MIN = 60_000;

/** A brisk walk: `minutes` of fixes 2 s apart, ~2.7 m per step (1.3 m/s). */
const walking = (minutes: number, start = T0): Location[] => eastwardTrail(start, minutes * 30 + 1);

/** The phone left on a bench: fixes every 5 s jittering a few metres around `at`, for `minutes`. */
function idle(at: Location, minutes: number, from: number): Location[] {
  return Array.from({ length: minutes * 12 }, (_, i) => ({
    latitude: at.latitude + Math.sin(i * 1.7) * 0.00004,
    longitude: at.longitude + Math.cos(i * 2.3) * 0.00004,
    timestamp: from + (i + 1) * 5000,
    accuracy: 12,
  }));
}

const walk = (locations: Location[]) => ({ startTime: T0, startSource: 'button' as const, locations });

describe('analyseWalk', () => {
  it('leaves a normal walk unchanged: full duration, nothing trimmed, counts in the statistics', () => {
    const fixes = walking(30);
    const stats = analyseWalk(walk(fixes));
    expect(stats).toMatchObject({ version: WALK_STATS_VERSION, endTime: fixes[fixes.length - 1].timestamp, durationMs: 30 * MIN, excluded: null, trimmedFixCount: 0 });
    expect(stats.distanceMeters).toBeGreaterThan(1500);
  });

  it('cuts a long idle tail at the moment the dog arrived and recomputes duration and distance', () => {
    const moving = walking(30);
    const last = moving[moving.length - 1];
    const fixes = [...moving, ...idle(last, 120, last.timestamp)]; // 2 h on the bench, fixes keep coming
    const stats = analyseWalk(walk(fixes));
    // the tail starts when the dog came within 50 m of its resting place, i.e. about 40 s before the last step
    expect(stats.durationMs!).toBeGreaterThan(29 * MIN);
    expect(stats.durationMs!).toBeLessThanOrEqual(30 * MIN);
    expect(stats.trimmedFixCount).toBeGreaterThan(1000);
    expect(stats.excluded).toBeNull();
    expect(stats.distanceMeters!).toBeLessThan(analyseWalk(walk(moving)).distanceMeters! + 30);
  });

  it('keeps a short rest at the end (under the tail limit) and an unmoved walk end', () => {
    const moving = walking(20);
    const last = moving[moving.length - 1];
    const fixes = [...moving, ...idle(last, 10, last.timestamp)];
    expect(analyseWalk(walk(fixes)).trimmedFixCount).toBe(0);
    expect(STILL_TAIL_MIN_MS).toBe(20 * MIN);
  });

  it('ignores one stray GPS fix inside the idle tail', () => {
    const moving = walking(20);
    const last = moving[moving.length - 1];
    const tail = idle(last, 60, last.timestamp);
    tail[100] = { ...tail[100], latitude: tail[100].latitude + 0.01 }; // one fix 1 km away
    const arrival = stillTailStart([...moving, ...tail])!;
    expect(arrival).toBeGreaterThan(last.timestamp - MIN); // not at the stray fix (8 minutes later on)
    expect(arrival).toBeLessThanOrEqual(last.timestamp);
  });

  it('marks tiny and aborted walks too_short (few fixes, under 2 min, under 100 m)', () => {
    expect(analyseWalk(walk(walking(1))).excluded).toBe('too_short'); // 1 min
    expect(analyseWalk(walk(eastwardTrail(T0, 1))).excluded).toBe('too_short'); // one fix
    expect(analyseWalk(walk(eastwardTrail(T0, 90, 0.0000005))).excluded).toBe('too_short'); // 3 min, a few metres
    expect(analyseWalk(walk(walking(5))).excluded).toBeNull();
  });

  it('marks a walk that is still longer than 4 h, or crawled for 30+ min, as stuck', () => {
    const sparse = (hours: number, stepDeg: number): Location[] =>
      Array.from({ length: hours * 60 + 1 }, (_, i) => ({ latitude: 52.5, longitude: 13.4 + i * stepDeg, timestamp: T0 + i * MIN, accuracy: 5 })); // a fix per minute
    expect(analyseWalk(walk(sparse(5, 0.0006))).excluded).toBe('stuck'); // 5 h > cap, 40 m/min walking
    expect(STATS_MAX_WALK_MS).toBe(4 * 60 * MIN);
    expect(analyseWalk(walk(sparse(1, 0.00005))).excluded).toBe('stuck'); // 1 h, ~3.4 m per minute
  });

  it('marks an impossible average speed or a jumpy track as gps_glitch', () => {
    // 10 minutes at 4.3 m/s average (steps of 13 m every 3 s pass the step rule one by one): faster than any dog walk.
    const sprint = Array.from({ length: 200 }, (_, i) => ({ latitude: 52.5, longitude: 13.4 + i * 0.00019, timestamp: T0 + i * 3000, accuracy: 5 }));
    expect(analyseWalk(walk(sprint)).excluded).toBe('gps_glitch');
    // Every second fix leaps 700 m (each leap is rejected by the distance rule): the track is mostly jumps.
    const jumpy = Array.from({ length: 400 }, (_, i) => ({ latitude: 52.5, longitude: 13.4 + (i % 2 ? 0.01 : 0) + i * 0.00002, timestamp: T0 + i * 3000, accuracy: 5 }));
    expect(analyseWalk(walk(jumpy)).excluded).toBe('gps_glitch');
    // One glitch step in a good walk does not exclude it.
    const oneJump = walking(30);
    oneJump[400] = { ...oneJump[400], longitude: oneJump[400].longitude + 0.01 };
    expect(analyseWalk(walk(oneJump)).excluded).toBeNull();
  });

  it('is idempotent: analysing the already cut walk gives the same numbers, and a second look changes nothing', () => {
    const moving = walking(25);
    const last = moving[moving.length - 1];
    const full = [...moving, ...idle(last, 90, last.timestamp)];
    const first = analyseWalk(walk(full));
    const cut = full.filter((f) => f.timestamp <= first.endTime!);
    const again = analyseWalk(walk(cut));
    expect(again).toMatchObject({ endTime: first.endTime, durationMs: first.durationMs, excluded: first.excluded, trimmedFixCount: 0 });
    expect(again.distanceMeters).toBeCloseTo(first.distanceMeters!, 6);
    expect(analyseWalk(walk(full))).toEqual(first);
  });

  it('gives a manual log no values and never excludes it', () => {
    expect(analyseWalk({ startTime: T0, startSource: 'manual-log', locations: [] })).toEqual({ version: WALK_STATS_VERSION, endTime: null, durationMs: null, distanceMeters: null, excluded: null, trimmedFixCount: 0 });
  });
});

describe('stored fields', () => {
  it('walkStatsOf trusts current stored fields and analyses otherwise', () => {
    const fixes = walking(20);
    const stored = { ...walk(fixes), ...statsFields({ ...analyseWalk(walk(fixes)), excluded: 'stuck' }) };
    expect(walkStatsOf(stored).excluded).toBe('stuck'); // the stored view wins
    expect(walkStatsOf({ ...stored, statsVersion: 0 }).excluded).toBeNull(); // an older version is analysed again
    expect(walkStatsOf(walk(fixes)).durationMs).toBe(20 * MIN);
  });

  it('sameStoredStats compares absent as absent', () => {
    expect(sameStoredStats({ statsVersion: 1 }, { statsVersion: 1 })).toBe(true);
    expect(sameStoredStats({ statsVersion: 1, statsExcluded: 'stuck' }, { statsVersion: 1 })).toBe(false);
  });
});

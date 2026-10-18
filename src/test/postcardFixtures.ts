import type { StoredWalk } from '../storage/WalkRepository';
import type { Location } from '../types';

// Walk fixtures for the postcard tests. All walks start Tuesday 13 Oct 2026 (local time) unless told otherwise.

export const TUESDAY_AFTERNOON = new Date(2026, 9, 13, 15, 30).getTime();
export const DAY_MS = 24 * 60 * 60 * 1000;

/** A walk heading east: `points` fixes 2 s apart, `stepDeg` of longitude each (0.00004 deg is about 2.7 m at 52.5 N). */
export function eastwardTrail(startTime: number, points = 120, stepDeg = 0.00004, lat = 52.5, lon = 13.4): Location[] {
  return Array.from({ length: points }, (_, i) => ({
    latitude: lat + Math.sin(i / 9) * 0.00005,
    longitude: lon + i * stepDeg,
    timestamp: startTime + i * 2000,
    accuracy: 5,
  }));
}

export function trackedWalk(id: string, overrides: Partial<StoredWalk> = {}): StoredWalk {
  const startTime = overrides.startTime ?? TUESDAY_AFTERNOON;
  return {
    id,
    startTime,
    locations: overrides.locations ?? eastwardTrail(startTime),
    closed: true,
    startSource: 'button',
    syncedAt: null,
    ...overrides,
  };
}

export function manualWalk(id: string, startTime = TUESDAY_AFTERNOON): StoredWalk {
  return { id, startTime, locations: [], closed: true, startSource: 'manual-log', syncedAt: null };
}

/** A walk that stood still: every fix within a few metres. */
export function stillWalk(id: string, startTime = TUESDAY_AFTERNOON): StoredWalk {
  return trackedWalk(id, { startTime, locations: eastwardTrail(startTime, 30, 0.0000002) });
}

/** `n` new-ground cell ids (they only need to be distinct strings for the postcard logic). */
export function newGroundIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${i},0`);
}

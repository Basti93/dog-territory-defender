// Walk statistics hygiene: one pure function decides, for a tracked walk, where it REALLY ended, how long and far it
// really was, and whether it is meaningful enough to count in averages and records. Shared by the app (at finish, at
// app start for older walks) and the server (at upload, and the startup fold), which imports this file by path:
// no i18n, no React, no storage. Spec: docs/specs/walk-lifecycle.md ("Statistics hygiene").
//
// It NEVER changes what a walk earned: rewards and Home Range cells are paid from the full route as before. The result
// only feeds statistics (diary, records, lifetime figures); the stored fixes stay untouched (except the live "still"
// finish, which already cut them).
import { STILL_MS, trimStillTail } from '../app/autoFinish';
import type { StatsExcludedReason, Walk } from '../types';
import { cumulativeDistance, getDistance, walkDistanceMeters } from '../utils/geometry';

/** Bump when a rule below changes: walks stamped with an older version are analysed again (app start, server fold). */
export const WALK_STATS_VERSION = 1;

export type { StatsExcludedReason };

/** A walk shorter than this (after the idle tail is cut) is an aborted start, not a walk. */
export const STATS_MIN_WALK_MS = 2 * 60 * 1000;
/** ... or one that covered less ground than this. */
export const STATS_MIN_WALK_M = 100;
/** No dog walk lasts longer: a longer one is a forgotten stop button ("stuck"). */
export const STATS_MAX_WALK_MS = 4 * 60 * 60 * 1000;
/** A long walk that averaged slower than this was not walked, the phone was lying somewhere ("stuck"): 0.1 m/s = 360 m/h. */
export const STATS_STUCK_MIN_SPEED_MS = 0.1;
/** The slow-average test needs at least this much time (a short sniff stop is not "stuck"). */
export const STATS_STUCK_MIN_MS = 30 * 60 * 1000;
/** Average speed (counted distance / duration) no dog walk reaches: 4 m/s = 14.4 km/h, a fast jog ("gps_glitch"). */
export const STATS_MAX_AVG_SPEED_MS = 4;
/** More than this much of the raw GPS path was rejected as jumps/rides AND more than the counted distance: a glitchy track. */
export const STATS_GLITCH_MIN_REJECTED_M = 500;

/** Idle tail: it counts only when the dog stayed this long near its final spot (same length as auto-finish's still window). */
export const STILL_TAIL_MIN_MS = STILL_MS;
/** ... "near" = within this radius of where the walk ended (jitter of a standing phone, a rough fix adds its own error). */
export const STILL_TAIL_RADIUS_M = 50;
/** The final spot = the median position of the fixes of the last this-many ms (robust against one stray fix). */
const FINAL_SPOT_WINDOW_MS = 5 * 60 * 1000;
/** A rough fix (above this accuracy) may stray this much more. */
const ROUGH_ACCURACY_M = 30;

export interface WalkStats {
  version: number;
  /** Timestamp of the last meaningful fix; null for a walk without fixes (manual log). */
  endTime: number | null;
  durationMs: number | null;
  distanceMeters: number | null;
  /** Why the walk stays out of averages and records; null = it counts. */
  excluded: StatsExcludedReason | null;
  /** Fixes cut off the end because the dog was idle there (0 = nothing). */
  trimmedFixCount: number;
}

type FixList = Pick<Walk, 'locations'>['locations'];

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * When the dog arrived at its final resting place, if it then idled there for STILL_TAIL_MIN_MS or longer; else null.
 * Pass the result to trimStillTail. Phone-left-on-the-bench jitter (fixes keep coming, a few metres around) is what this
 * finds, including the case autoFinish's "still" clock misses because the jitter keeps moving its anchor.
 */
export function stillTailStart(locations: FixList): number | null {
  const n = locations.length;
  if (n < 3) return null;
  const end = locations[n - 1].timestamp;
  const recent = locations.filter((f) => f.timestamp >= end - FINAL_SPOT_WINDOW_MS);
  const spot = { latitude: median(recent.map((f) => f.latitude)), longitude: median(recent.map((f) => f.longitude)) };
  const outside = locations.map((f) => getDistance(spot.latitude, spot.longitude, f.latitude, f.longitude) > STILL_TAIL_RADIUS_M + (f.accuracy !== undefined && f.accuracy > ROUGH_ACCURACY_M ? f.accuracy : 0));
  // The last fix that is really outside; a single stray fix between (or after) inside neighbours is jitter, not walking.
  let lastMoving = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (!outside[i]) continue;
    const prevInside = i > 0 && !outside[i - 1];
    const nextInside = i < n - 1 ? !outside[i + 1] : true;
    if (prevInside && nextInside) continue;
    lastMoving = i;
    break;
  }
  const arrival = locations[Math.min(n - 1, lastMoving + 1)].timestamp;
  return end - arrival >= STILL_TAIL_MIN_MS ? arrival : null;
}

/** The statistics view of one walk. Pure and idempotent: analysing the cut walk again gives the same numbers. */
export function analyseWalk(walk: Pick<Walk, 'startTime' | 'startSource' | 'locations'>): WalkStats {
  if (walk.startSource === 'manual-log' || walk.locations.length === 0) {
    return { version: WALK_STATS_VERSION, endTime: null, durationMs: null, distanceMeters: null, excluded: null, trimmedFixCount: 0 };
  }
  const arrival = stillTailStart(walk.locations);
  const kept = arrival === null ? walk.locations : trimStillTail({ ...(walk as Walk), locations: walk.locations }, arrival).locations;
  const endTime = kept[kept.length - 1].timestamp;
  const durationMs = Math.max(0, endTime - walk.startTime);
  const distanceMeters = walkDistanceMeters({ startTime: walk.startTime, locations: kept });
  return {
    version: WALK_STATS_VERSION,
    endTime,
    durationMs,
    distanceMeters,
    excluded: classify(kept, durationMs, distanceMeters),
    trimmedFixCount: walk.locations.length - kept.length,
  };
}

function classify(kept: FixList, durationMs: number, distanceMeters: number): StatsExcludedReason | null {
  if (kept.length < 2) return 'too_short';
  // A track whose GPS path is mostly jumps/rides (rejected by the distance rule) cannot be trusted, however short it counts.
  let rawPath = 0;
  for (let i = 1; i < kept.length; i++) rawPath += getDistance(kept[i - 1].latitude, kept[i - 1].longitude, kept[i].latitude, kept[i].longitude);
  const rejected = rawPath - cumulativeDistance(kept);
  if (rejected > STATS_GLITCH_MIN_REJECTED_M && rejected > distanceMeters) return 'gps_glitch';
  if (durationMs < STATS_MIN_WALK_MS || distanceMeters < STATS_MIN_WALK_M) return 'too_short';
  if (durationMs > STATS_MAX_WALK_MS) return 'stuck';
  const speed = distanceMeters / (durationMs / 1000);
  if (durationMs >= STATS_STUCK_MIN_MS && speed < STATS_STUCK_MIN_SPEED_MS) return 'stuck';
  if (speed > STATS_MAX_AVG_SPEED_MS) return 'gps_glitch';
  return null;
}

/** The fields stored on a walk (client Walk, server walks table, ApiWalkMeta). Absent = not analysed yet. */
export type StoredWalkStats = Pick<Walk, 'statsVersion' | 'statsEndTime' | 'statsDistanceM' | 'statsExcluded'>;

export function statsFields(stats: WalkStats): StoredWalkStats {
  return {
    statsVersion: stats.version,
    ...(stats.endTime !== null ? { statsEndTime: stats.endTime } : {}),
    ...(stats.distanceMeters !== null ? { statsDistanceM: stats.distanceMeters } : {}),
    ...(stats.excluded ? { statsExcluded: stats.excluded } : {}),
  };
}

/** True when two sets of stored fields say the same thing (absent counts as absent). */
export function sameStoredStats(a: StoredWalkStats, b: StoredWalkStats): boolean {
  return (
    a.statsVersion === b.statsVersion &&
    (a.statsEndTime ?? null) === (b.statsEndTime ?? null) &&
    (a.statsDistanceM ?? null) === (b.statsDistanceM ?? null) &&
    (a.statsExcluded ?? null) === (b.statsExcluded ?? null)
  );
}

/**
 * The statistics view of a walk that may carry stored fields: the stored ones when they are of the current version,
 * otherwise a fresh analysis (a walk the repair has not reached yet, or an older rule set).
 */
export function walkStatsOf(walk: Pick<Walk, 'startTime' | 'startSource' | 'locations'> & StoredWalkStats): WalkStats {
  if (walk.statsVersion === WALK_STATS_VERSION) {
    const endTime = walk.statsEndTime ?? null;
    return {
      version: WALK_STATS_VERSION,
      endTime,
      durationMs: endTime === null ? null : Math.max(0, endTime - walk.startTime),
      distanceMeters: walk.statsDistanceM ?? null,
      excluded: walk.statsExcluded ?? null,
      trimmedFixCount: 0,
    };
  }
  return analyseWalk(walk);
}

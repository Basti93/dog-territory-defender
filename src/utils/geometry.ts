import { Location } from '../types';
import {
  DROPOUT_BRIDGE_MAX_M,
  DROPOUT_BRIDGE_MAX_S,
  DROPOUT_BRIDGE_MAX_SPEED_MS,
  MAX_SEGMENT_M,
  MAX_SEGMENT_SPEED_MS,
} from './grid';

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * The distance rule (docs/specs/walk-lifecycle.md "Distance rule"): does the step a -> b count as walked distance?
 * - normal: at most MAX_SEGMENT_M and at most MAX_SEGMENT_SPEED_MS (same limits as the paint filter);
 * - dropout bridge: over MAX_SEGMENT_M but at most DROPOUT_BRIDGE_MAX_M, within DROPOUT_BRIDGE_MAX_S, and an average
 *   of at most DROPOUT_BRIDGE_MAX_SPEED_MS (a GPS gap in a tunnel or after the app was killed, not a ride);
 * - a missing, zero or negative time difference counts only when the step is at most MAX_SEGMENT_M.
 * Silent by design: nothing in the UI ever says a step was not counted.
 * The web scripts (partnerTrailScript, homeRangeRendererScript, portraitHTML) inline this same logic; a test keeps them in step.
 */
export function stepCountsAsDistance(a: Location, b: Location): boolean {
  const d = getDistance(a.latitude, a.longitude, b.latitude, b.longitude);
  const dt = (b.timestamp - a.timestamp) / 1000;
  if (!(dt > 0)) return d <= MAX_SEGMENT_M; // also catches NaN timestamps
  if (d <= MAX_SEGMENT_M) return d / dt <= MAX_SEGMENT_SPEED_MS;
  return d <= DROPOUT_BRIDGE_MAX_M && dt <= DROPOUT_BRIDGE_MAX_S && d / dt <= DROPOUT_BRIDGE_MAX_SPEED_MS;
}

/** Walked distance in metres under the distance rule: steps that fail it (jumps, rides, long gaps) add nothing. */
export function cumulativeDistance(locations: Location[]): number {
  let total = 0;
  for (let i = 1; i < locations.length; i++) {
    const a = locations[i - 1];
    const b = locations[i];
    if (!stepCountsAsDistance(a, b)) continue;
    total += getDistance(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  return total;
}

/** The old rule: every step counts. Only for walks that started before DISTANCE_RULE_SINCE_MS (see walkDistanceMeters). */
export function cumulativeDistanceLegacy(locations: Location[]): number {
  let total = 0;
  for (let i = 1; i < locations.length; i++) {
    total += getDistance(
      locations[i - 1].latitude,
      locations[i - 1].longitude,
      locations[i].latitude,
      locations[i].longitude
    );
  }
  return total;
}

/**
 * Walks that started before this instant (2026-10-18 19:35 UTC, when the distance rule shipped) keep the legacy
 * unfiltered distance wherever a distance is recomputed from points, so no stored walk, stat or record ever goes down.
 * Server and app share this constant through @game/utils/geometry.
 */
export const DISTANCE_RULE_SINCE_MS = 1792352123000;

/**
 * The one entry point for "how far was this walk": filtered for walks started on or after DISTANCE_RULE_SINCE_MS,
 * legacy for older ones. Live map, finish, portrait, rewards and the server all call this, so they never disagree.
 */
export function walkDistanceMeters(walk: { startTime: number; locations: Location[] }): number {
  return walk.startTime >= DISTANCE_RULE_SINCE_MS ? cumulativeDistance(walk.locations) : cumulativeDistanceLegacy(walk.locations);
}

/**
 * Splits a trail into continuous runs: a new run starts wherever a step fails the distance rule, so no line is drawn
 * across a jump, ride or gap. Runs with a single point are kept (a dot) so a lone fix still shows; an empty input gives [].
 * Note: a dropout bridge step still counts as distance, so it stays connected.
 */
export function splitAtGaps(points: Location[]): Location[][] {
  const runs: Location[][] = [];
  let run: Location[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && !stepCountsAsDistance(points[i - 1], points[i])) {
      runs.push(run);
      run = [];
    }
    run.push(points[i]);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

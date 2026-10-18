import { getDistance } from '../utils/geometry';

/**
 * Auto-finish: a walk ends by itself when the player is back where it started
 * and forgot to tap Finish. Pure rules only; useWalkSession feeds it GPS fixes
 * and a 60 s timer tick. Tunables are plain constants (presentation tuning,
 * see the decisions log in docs/decisions/buddy-comes-alive.md).
 */

/** A walk shorter than this never auto-finishes. */
export const AUTO_FINISH_MIN_WALK_MS = 8 * 60 * 1000;
/** "Home" = within this radius of the walk's START point (park trip: start = the car). */
export const HOME_RADIUS_M = 40;
/** The walk must have been at least this far from the start at some point. */
export const AWAY_RADIUS_M = 150;
/** Continuous time inside the home radius before the walk finishes. */
export const HOME_DWELL_MS = 3 * 60 * 1000;
/** Safety net: no movement beyond STILL_RADIUS_M for this long finishes the walk. */
export const STILL_MS = 20 * 60 * 1000;
export const STILL_RADIUS_M = 25;
/** How often the hook re-evaluates with the last known fix (GPS may go quiet when still). */
export const AUTO_FINISH_TICK_MS = 60 * 1000;

export type AutoFinishDecision = 'home' | 'still';
export type WalkEndedBy = 'auto-home' | 'auto-still';

interface Point {
  latitude: number;
  longitude: number;
}

export interface AutoFinishState {
  enabled: boolean;
  startedAt: number;
  home: Point;
  /** Has the walk ever been at least AWAY_RADIUS_M from home? */
  awayReached: boolean;
  /** When the current unbroken stay inside HOME_RADIUS_M began; null while outside. */
  homeSince: number | null;
  /** Last position that counted as "moving", and when we saw it. */
  anchor: Point;
  anchorAt: number;
  lastFix: Point;
}

export function startAutoFinish(start: Point, now: number, enabled: boolean): AutoFinishState {
  const p = { latitude: start.latitude, longitude: start.longitude };
  return { enabled, startedAt: now, home: p, awayReached: false, homeSince: null, anchor: p, anchorAt: now, lastFix: p };
}

const dist = (a: Point, b: Point) => getDistance(a.latitude, a.longitude, b.latitude, b.longitude);

/**
 * Feed one GPS fix (or null for a timer tick, which re-uses the last fix) and
 * get the next state plus a finish decision. Never mutates its input.
 */
export function evaluateAutoFinish(
  state: AutoFinishState,
  fix: Point | null,
  now: number
): { state: AutoFinishState; decision: AutoFinishDecision | null } {
  let next = state;
  if (fix) {
    const lastFix = { latitude: fix.latitude, longitude: fix.longitude };
    const fromHome = dist(state.home, lastFix);
    next = {
      ...state,
      lastFix,
      awayReached: state.awayReached || fromHome >= AWAY_RADIUS_M,
      homeSince: fromHome <= HOME_RADIUS_M ? (state.homeSince ?? now) : null,
      ...(dist(state.anchor, lastFix) > STILL_RADIUS_M ? { anchor: lastFix, anchorAt: now } : {}),
    };
  }
  if (!next.enabled) return { state: next, decision: null };

  const walkLongEnough = now - next.startedAt >= AUTO_FINISH_MIN_WALK_MS;
  if (walkLongEnough && next.awayReached && next.homeSince !== null && now - next.homeSince >= HOME_DWELL_MS) {
    return { state: next, decision: 'home' };
  }
  if (walkLongEnough && now - next.anchorAt >= STILL_MS) {
    return { state: next, decision: 'still' };
  }
  return { state: next, decision: null };
}

/**
 * Whole minutes left in the "back home" countdown, or null when it has not
 * begun (disabled, never went away, or currently outside the home radius).
 * Never below 1, so the sign never shows "0 Min".
 */
export function homeCountdownMinutes(state: AutoFinishState, now: number): number | null {
  if (!state.enabled || !state.awayReached || state.homeSince === null) return null;
  const dwellLeft = HOME_DWELL_MS - (now - state.homeSince);
  const walkLeft = AUTO_FINISH_MIN_WALK_MS - (now - state.startedAt);
  return Math.max(1, Math.ceil(Math.max(dwellLeft, walkLeft) / 60000));
}

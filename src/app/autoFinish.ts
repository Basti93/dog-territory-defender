import { getDistance } from '../utils/geometry';
import { PAINT_MAX_ACCURACY_M } from '../utils/grid';

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
/**
 * Safety net: fixes that kept arriving but stayed within STILL_RADIUS_M for this long finish the walk. Only evidence
 * counts: no fixes at all (GPS gap, see GPS_GAP_MS) never finishes a walk as "still".
 */
export const STILL_MS = 20 * 60 * 1000;
export const STILL_RADIUS_M = 25;
/**
 * No accepted fix for this long is a GPS gap (battery saver, frozen or killed app, pocket): not evidence of anything.
 * During a gap no auto-finish decision is made, and the still/home clocks restart with the first fix after it.
 */
export const GPS_GAP_MS = 5 * 60 * 1000;
/** A gap this long (the still window) is worth a calm note on the live map when the app is back in front. */
export const GPS_GAP_NOTE_MS = STILL_MS;
/**
 * A gap this long ends the walk after all (same limit as restoreWalk.ts's RESTORE_MAX_AGE_MS): a phone left at home or
 * a dead GPS must not keep a walk open for ever while the app is alive. Finishes through the usual path (an empty or
 * stationary walk is discarded there), whether or not auto-finish is on, like the stale restore.
 */
export const GPS_GAP_MAX_MS = 3 * 60 * 60 * 1000;
/** How often the hook re-evaluates with the last known fix (GPS may go quiet when still). */
export const AUTO_FINISH_TICK_MS = 60 * 1000;

export type AutoFinishDecision = 'home' | 'still';
export type WalkEndedBy = 'auto-home' | 'auto-still';

interface Point {
  latitude: number;
  longitude: number;
  /** Metres; a rough fix (above PAINT_MAX_ACCURACY_M) must move further to count as moving. Missing = accurate. */
  accuracy?: number;
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
  /** When the newest accepted fix arrived (the walk's start before the first one). Drives the GPS-gap rule. */
  lastFixAt: number;
}

export function startAutoFinish(start: Point, now: number, enabled: boolean): AutoFinishState {
  const p = { latitude: start.latitude, longitude: start.longitude };
  return { enabled, startedAt: now, home: p, awayReached: false, homeSince: null, anchor: p, anchorAt: now, lastFix: p, lastFixAt: now };
}

/** A rough fix (pocket, 30-50 m) jitters beyond STILL_RADIUS_M on a standing phone: it must move by its own error more. */
const stillRadius = (fix: Point) => STILL_RADIUS_M + (fix.accuracy !== undefined && fix.accuracy > PAINT_MAX_ACCURACY_M ? fix.accuracy : 0);

const dist = (a: Point, b: Point) => getDistance(a.latitude, a.longitude, b.latitude, b.longitude);

export interface AutoFinishStep {
  state: AutoFinishState;
  decision: AutoFinishDecision | null;
  /** Ongoing GPS gap in ms (no fix for at least GPS_GAP_MS as of `now`), else null. */
  gapMs: number | null;
  /** The fix just fed in ended a gap of this many ms, else null. */
  gapEndedMs: number | null;
}

/**
 * Feed one GPS fix (or null for a timer tick, which re-uses the last fix) and
 * get the next state plus a finish decision. Never mutates its input.
 *
 * A decision needs evidence from fixes that really arrived. While the last fix is GPS_GAP_MS or older (a timer tick
 * after a frozen app, a restore after a kill) nothing is decided, and the first fix after a gap restarts the
 * still and home clocks: what happened during the gap is unknown, so it must not count as standing still.
 */
export function evaluateAutoFinish(state: AutoFinishState, fix: Point | null, now: number): AutoFinishStep {
  let next = state;
  let gapEndedMs: number | null = null;
  if (fix) {
    const lastFix = { latitude: fix.latitude, longitude: fix.longitude };
    const sinceLastFix = now - state.lastFixAt;
    const afterGap = sinceLastFix >= GPS_GAP_MS;
    if (afterGap) gapEndedMs = sinceLastFix;
    const fromHome = dist(state.home, lastFix);
    next = {
      ...state,
      lastFix,
      lastFixAt: now,
      awayReached: state.awayReached || fromHome >= AWAY_RADIUS_M,
      homeSince: fromHome <= HOME_RADIUS_M ? (afterGap ? now : (state.homeSince ?? now)) : null,
      ...(afterGap || dist(state.anchor, lastFix) > stillRadius(fix) ? { anchor: lastFix, anchorAt: now } : {}),
    };
  }
  const silentMs = now - next.lastFixAt;
  const gapMs = silentMs >= GPS_GAP_MS ? silentMs : null;
  if (gapMs !== null && gapMs >= GPS_GAP_MAX_MS) return { state: next, decision: 'still', gapMs, gapEndedMs };
  if (!next.enabled || gapMs !== null) return { state: next, decision: null, gapMs, gapEndedMs };

  const walkLongEnough = now - next.startedAt >= AUTO_FINISH_MIN_WALK_MS;
  if (walkLongEnough && next.awayReached && next.homeSince !== null && now - next.homeSince >= HOME_DWELL_MS) {
    return { state: next, decision: 'home', gapMs, gapEndedMs };
  }
  if (walkLongEnough && now - next.anchorAt >= STILL_MS) {
    return { state: next, decision: 'still', gapMs, gapEndedMs };
  }
  return { state: next, decision: null, gapMs, gapEndedMs };
}

/**
 * Whole minutes left in the "back home" countdown, or null when it has not
 * begun (disabled, never went away, currently outside the home radius, or in a GPS gap).
 * Never below 1, so the sign never shows "0 Min".
 */
export function homeCountdownMinutes(state: AutoFinishState, now: number): number | null {
  if (!state.enabled || !state.awayReached || state.homeSince === null) return null;
  if (now - state.lastFixAt >= GPS_GAP_MS) return null; // a GPS gap: the dwell is not counting down
  const dwellLeft = HOME_DWELL_MS - (now - state.homeSince);
  const walkLeft = AUTO_FINISH_MIN_WALK_MS - (now - state.startedAt);
  return Math.max(1, Math.ceil(Math.max(dwellLeft, walkLeft) / 60000));
}

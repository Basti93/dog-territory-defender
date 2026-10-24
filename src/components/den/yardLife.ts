// Pure decisions for "Buddy lives in the yard" (buddy-comes-alive, presentation only).
// No React, no Animated: YardBuddy.tsx owns the animation, this file owns the choices and the
// wander clock (pause/resume included), so all of it is unit-testable with a seeded rng.

/** Where he may stand in the Hof: `front` is the middle above the bowl; `bench` and `mailbox` are the ends of the bottom row. */
export type SpotId = 'front' | 'bench' | 'mailbox';
export type YardActivity = 'sniff' | 'sit' | 'sleep' | 'trick';

export const SPOT_IDS: readonly SpotId[] = ['bench', 'mailbox', 'front'];

export const WANDER_MIN_MS = 15000;
export const WANDER_MAX_MS = 30000;
export const WALK_SPEED_PX_PER_S = 90;
/** A walk always has 3..6 hops; the hop period stretches to fit the walk. */
export const MIN_HOPS = 3;
export const MAX_HOPS = 6;
export const TARGET_HOP_MS = 450;

export const ACTIVITY_MS: Record<YardActivity, number> = { sniff: 2500, sit: 3000, sleep: 8000, trick: 2400 };

type Rng = () => number;
const unit = (rng: Rng) => Math.min(0.999999, Math.max(0, rng()));

/** Delay before the next wander, in [WANDER_MIN_MS, WANDER_MAX_MS]. */
export function nextWanderDelayMs(rng: Rng): number {
  return WANDER_MIN_MS + Math.floor(unit(rng) * (WANDER_MAX_MS - WANDER_MIN_MS));
}

/** Any spot except where Buddy already is (so he never "wanders" to the spot he stands on). */
export function pickDestination(rng: Rng, current: SpotId | null): SpotId {
  const options = SPOT_IDS.filter((s) => s !== current);
  return options[Math.floor(unit(rng) * options.length)];
}

/** Sniffing only at the bench or the mailbox; the front spot (the middle of the yard, his doormat) is for sitting, a trick or lying down for a nap (listed twice: the mat is his favourite bed). */
export function activityOptions(spot: SpotId): YardActivity[] {
  if (spot === 'front') return ['sit', 'trick', 'sleep', 'sleep'];
  if (spot === 'bench') return ['sniff', 'sit', 'sleep', 'trick'];
  return ['sniff', 'sit', 'trick'];
}

export function pickActivity(rng: Rng, spot: SpotId): YardActivity {
  const options = activityOptions(spot);
  return options[Math.floor(unit(rng) * options.length)];
}

export interface WalkPlan {
  durationMs: number;
  hops: number;
  hopMs: number;
}

/** distance / 90 px/s, with 3..6 hops of equal length filling the walk. */
export function planWalk(distancePx: number): WalkPlan {
  const durationMs = Math.max(400, Math.round((Math.abs(distancePx) / WALK_SPEED_PX_PER_S) * 1000));
  const hops = Math.min(MAX_HOPS, Math.max(MIN_HOPS, Math.round(durationMs / TARGET_HOP_MS)));
  return { durationMs, hops, hopMs: durationMs / hops };
}

export interface WalkRange {
  min: number;
  max: number;
}

/** Keeps Buddy's centre on the grass. */
export function clampX(x: number, range: WalkRange): number {
  return Math.min(range.max, Math.max(range.min, x));
}

export function facingFor(fromX: number, toX: number, fallback: 'left' | 'right' = 'right'): 'left' | 'right' {
  if (toX < fromX) return 'left';
  if (toX > fromX) return 'right';
  return fallback;
}

/** Where a linear walk is after `elapsedMs` (used to stop mid-walk without reading the native value back). */
export function positionAt(fromX: number, toX: number, durationMs: number, elapsedMs: number): number {
  if (durationMs <= 0) return toX;
  const p = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return fromX + (toX - fromX) * p;
}

export interface WanderLoopOptions {
  rng: Rng;
  /** Called when the wait is over. The loop then waits for the caller to `arm()` again. */
  onFire: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

export interface WanderLoop {
  /** Start a fresh random wait (while paused, the wait starts on resume). */
  arm(): void;
  /** Cancel any pending wait without firing (a tap takes over); call `arm()` when done. */
  hold(): void;
  /** Freeze the wait; if a behaviour was running (fired, not re-armed) it counts as done and a fresh wait is queued. */
  pause(): void;
  resume(): void;
  stop(): void;
  isPaused(): boolean;
}

/** Wander clock: waiting -> fired (running) -> arm() -> waiting ..., with pause/resume preserving the remaining wait. */
export function createWanderLoop(opts: WanderLoopOptions): WanderLoop {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const now = opts.now ?? Date.now;
  let handle: unknown = null;
  let deadline = 0;
  let remaining: number | null = null; // wait carried through a pause
  let running = false; // fired, behaviour in progress
  let paused = false;
  let stopped = false;

  const schedule = (ms: number) => {
    deadline = now() + ms;
    handle = setTimer(() => {
      handle = null;
      running = true;
      opts.onFire();
    }, ms);
  };
  const cancel = () => {
    if (handle !== null) clearTimer(handle);
    handle = null;
  };

  return {
    arm() {
      if (stopped) return;
      cancel();
      running = false;
      const delay = nextWanderDelayMs(opts.rng);
      if (paused) remaining = delay;
      else schedule(delay);
    },
    hold() {
      cancel();
      remaining = null;
      running = true;
    },
    pause() {
      if (stopped || paused) return;
      paused = true;
      if (handle !== null) {
        remaining = Math.max(0, deadline - now());
        cancel();
      } else if (running) {
        running = false;
        remaining = nextWanderDelayMs(opts.rng);
      }
    },
    resume() {
      if (stopped || !paused) return;
      paused = false;
      if (remaining !== null) {
        const ms = remaining;
        remaining = null;
        schedule(ms);
      }
    },
    stop() {
      stopped = true;
      cancel();
      remaining = null;
    },
    isPaused: () => paused,
  };
}

/**
 * The "has the launch restore decided yet?" gate. Starting a walk calls ActiveWalkRepository.start, which replaces the
 * stored walk: a tap on "Gassi gehen" before the restore has looked at that stored walk would silently destroy it.
 * So the start waits here (see startWalkWhenRestored); useWalkRestore settles the gate when it is done, whatever came out.
 */
export interface RestoreGate {
  /** The restore is over (resumed, finished, discarded, nothing found, or failed). Idempotent: the first outcome stays. */
  settle(outcome: string): void;
  isSettled(): boolean;
  /** What the restore did, or null while it has not settled. */
  outcome(): string | null;
  /** Resolves true once settled, false when `timeoutMs` passes first. */
  wait(timeoutMs: number): Promise<boolean>;
}

export function createRestoreGate(): RestoreGate {
  let settledWith: string | null = null;
  const waiters: Array<() => void> = [];
  return {
    settle(outcome) {
      if (settledWith !== null) return;
      settledWith = outcome;
      waiters.splice(0).forEach((resolve) => resolve());
    },
    isSettled: () => settledWith !== null,
    outcome: () => settledWith,
    wait(timeoutMs) {
      if (settledWith !== null) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        waiters.push(() => {
          clearTimeout(timer);
          resolve(true);
        });
      });
    },
  };
}

/** A restore that has not settled after this long no longer holds a walk start back (a hung storage must not lock the gate). */
export const RESTORE_WAIT_MAX_MS = 10_000;

export interface StartAfterRestoreDeps {
  gate: RestoreGate;
  /** The player is waiting: show "Runde wird wiederhergestellt…" (true) and remove it again (false). */
  onWaiting: (waiting: boolean) => void;
  /** Starts the walk (navigation plus session.startWalk). */
  start: () => void;
  /** Called instead of `start` when the restore resumed a walk: that walk is live now, no second one is started. */
  onResumedInstead?: () => void;
  timeoutMs?: number;
}

/**
 * Start a walk, but only after the launch restore has decided. Settled already (the normal case): starts at once,
 * synchronously. Otherwise waits for the restore (at most timeoutMs), shows the waiting note meanwhile, and does not
 * start a walk when the restore just resumed one. Returns what happened.
 */
export async function startWalkWhenRestored(deps: StartAfterRestoreDeps): Promise<'started' | 'resumed-instead' | 'started-after-timeout'> {
  const { gate } = deps;
  if (gate.isSettled()) {
    deps.start();
    return 'started';
  }
  deps.onWaiting(true);
  let settled: boolean;
  try {
    settled = await gate.wait(deps.timeoutMs ?? RESTORE_WAIT_MAX_MS);
  } finally {
    deps.onWaiting(false);
  }
  if (settled && gate.outcome() === 'resumed') {
    deps.onResumedInstead?.();
    return 'resumed-instead';
  }
  deps.start();
  return settled ? 'started' : 'started-after-timeout';
}

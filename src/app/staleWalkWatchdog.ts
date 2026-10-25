import { GPS_GAP_MAX_MS } from './autoFinish';
import type { ActiveWalkRecorder } from './activeWalkRecorder';
import { log } from '../utils/log';

/**
 * Keeps a walk from running for hours when no fix arrives and no UI is there to judge it (the location task alone keeps
 * the process, and the Android foreground service with its notification, alive). The UI side ends such a walk itself at
 * GPS_GAP_MAX_MS (useWalkSession tick); this timer is the headless safety net, a few minutes later so it never races
 * that: it only stops the location task. The stored walk stays, and the next launch's restore finishes it at its last
 * fix (restoreWalk.ts: 3 hours old = finished as it stands).
 */
export const WATCHDOG_EVERY_MS = 5 * 60 * 1000;
export const WATCHDOG_GRACE_MS = 5 * 60 * 1000;

export interface StaleWalkWatchdogDeps {
  recorder: Pick<ActiveWalkRecorder, 'lastActivityAt'>;
  stopTask: () => Promise<void>;
  now?: () => number;
}

/** One check. True when the task was stopped. */
export async function checkStaleWalk({ recorder, stopTask, now = Date.now }: StaleWalkWatchdogDeps): Promise<boolean> {
  const lastAt = recorder.lastActivityAt();
  if (lastAt === null || now() - lastAt < GPS_GAP_MAX_MS + WATCHDOG_GRACE_MS) return false;
  log('WALK_TASK_STOPPED_STALE', { silentMin: Math.round((now() - lastAt) / 60000) });
  await stopTask().catch((error) => log('WALK_TASK_STOP_ERROR', { error: String(error) }));
  return true;
}

export function startStaleWalkWatchdog(deps: StaleWalkWatchdogDeps): () => void {
  const timer = setInterval(() => void checkStaleWalk(deps), WATCHDOG_EVERY_MS);
  return () => clearInterval(timer);
}

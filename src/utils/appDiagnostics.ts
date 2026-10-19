import { AppState } from 'react-native';

import { getPreviousRunLastLogAt } from './debugLog';
import { log } from './log';

/**
 * Process-level breadcrumbs for the server device log, to tell a killed app from a frozen one:
 * - APP_LAUNCH once per JS start (also a headless start), with the time since the previous run's last log line. A killed
 *   process shows up as a launch after a quiet stretch; a frozen one as a long silence WITHOUT a launch line afterwards.
 * - APP_STATE on every real AppState change (same state twice in a row is skipped).
 */
let started = false;

export function startAppDiagnostics(): void {
  if (started) return;
  started = true;
  let current = AppState.currentState;
  AppState.addEventListener('change', (next) => {
    if (next === current) return;
    log('APP_STATE', { from: current, to: next });
    current = next;
  });
  void getPreviousRunLastLogAt().then((previous) => {
    const sinceLastLogSec = previous ? Math.max(0, Math.round((Date.now() - Date.parse(previous)) / 1000)) : null;
    log('APP_LAUNCH', { cold: true, sinceLastLogSec, startState: AppState.currentState });
  });
}

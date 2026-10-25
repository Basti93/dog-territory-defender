import { AppState } from 'react-native';
import { appendToDebugLog } from './debugLog';
import { shipLog } from './logShipper';
import { setDatabaseEventListener } from '../storage/dbEvents';

/**
 * Structured logging for on-device test walks — one line per event, tagged,
 * with wall-clock time and foreground/background state. Goes to the console
 * (when Metro is attached) and to a local durable log (works regardless of
 * build variant or dev-server connectivity — see DebugLogScreen). When joined
 * to a household, a redacted copy is also shipped to the server (logShipper.ts).
 */
export function log(tag: string, data: Record<string, unknown> = {}): void {
  const entry = {
    t: new Date().toISOString(),
    appState: AppState.currentState,
    ...data,
  };
  const line = `[${tag}] ${JSON.stringify(entry)}`;
  console.log(line);
  appendToDebugLog(line);
  shipLog(tag, data, entry.appState);
}

// Storage (database.ts, dbLock.ts) reports DB_OPEN_ERROR, DB_LOCK_TIMEOUT and friends through the normal log.
setDatabaseEventListener((tag, data) => log(tag, data));

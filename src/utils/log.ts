import { AppState } from 'react-native';
import { appendToDebugLog } from './debugLog';

/**
 * Structured logging for on-device test walks — one line per event, tagged,
 * with wall-clock time and foreground/background state. Goes to the console
 * (when Metro is attached) and to a local durable log (works regardless of
 * build variant or dev-server connectivity — see DebugLogScreen).
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
}

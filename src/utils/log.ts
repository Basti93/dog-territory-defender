import { AppState } from 'react-native';

/**
 * Structured, copy-pasteable console logging for on-device test walks —
 * one line per event, tagged, with wall-clock time and foreground/background
 * state, so a pasted terminal transcript can be reviewed after the fact.
 */
export function log(tag: string, data: Record<string, unknown> = {}): void {
  const entry = {
    t: new Date().toISOString(),
    appState: AppState.currentState,
    ...data,
  };
  console.log(`[${tag}] ${JSON.stringify(entry)}`);
}

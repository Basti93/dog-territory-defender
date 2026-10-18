import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { flushLogShipper } from '../utils/logShipper';
import type { SyncCallbacks, SyncEngine } from './syncEngine';

/** Don't re-sync on every quick app switch. */
const MIN_RESUME_INTERVAL_MS = 15_000;

/**
 * Wires the sync engine into App: registers the callbacks that update React
 * state, and syncs when the app returns to the foreground. The sync at app
 * OPEN is not here: useLaunchEffects awaits it (briefly) so the Doorstep can
 * show household news on the first frame. Foreground-only by design: no
 * background task, no new native dependency.
 */
export function useSync(engine: SyncEngine, callbacks: SyncCallbacks) {
  const latest = useRef(callbacks);
  latest.current = callbacks;

  useEffect(() => {
    engine.setCallbacks({
      onDenChanged: (s) => latest.current.onDenChanged?.(s),
      onRangeChanged: () => latest.current.onRangeChanged?.(),
      onHouseholdNews: () => latest.current.onHouseholdNews?.(),
    });
    let lastRun = Date.now();
    const subscription = AppState.addEventListener('change', (state) => {
      void flushLogShipper(); // foreground and background transitions (rate limited inside)
      if (state !== 'active') return;
      const t = Date.now();
      if (t - lastRun < MIN_RESUME_INTERVAL_MS) return;
      lastRun = t;
      void engine.syncNow();
    });
    return () => subscription.remove();
  }, [engine]);
}

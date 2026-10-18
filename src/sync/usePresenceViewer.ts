import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { PresenceViewer } from './presenceViewer';
import type { SyncEngine } from './syncEngine';

/**
 * Runs the presence poller only while the app is in the foreground (and stops it, aborting the long-poll, the moment
 * it is not). Joining a household while the app is open starts it too: the engine notifies on any status change.
 */
export function usePresenceViewer(viewer: PresenceViewer, engine: Pick<SyncEngine, 'subscribe'>): void {
  useEffect(() => {
    const sync = (state: string) => (state === 'active' ? viewer.start() : viewer.stop());
    sync(AppState.currentState);
    const subscription = AppState.addEventListener('change', sync);
    const unsubscribe = engine.subscribe(() => {
      if (AppState.currentState === 'active') viewer.start(); // no-op while running
    });
    return () => {
      subscription.remove();
      unsubscribe();
      viewer.stop();
    };
  }, [viewer, engine]);
}

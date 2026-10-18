import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { PartnerHomecomingQueue, PartnerHomecomingRequest } from './partnerHomecoming';

/**
 * The partner homecoming that may play right now. `canPlay` is the caller's "nothing else is going on" gate (no walk in
 * progress, no own homecoming, the world scene in front): while it is false the request just waits its turn.
 */
export function usePartnerHomecoming(
  queue: PartnerHomecomingQueue,
  canPlay: boolean
): { request: PartnerHomecomingRequest | null; done: () => void } {
  const next = useSyncExternalStore(queue.subscribe, queue.peek);
  // Every return to the front is a new "open": one more late homecoming (partner walk that ended while we were away) may come.
  useEffect(() => {
    let last: string = AppState.currentState;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && last !== 'active') queue.noteForeground();
      last = state;
    });
    return () => subscription.remove();
  }, [queue]);
  const done = useCallback(() => queue.shift(), [queue]);
  return { request: canPlay ? next : null, done };
}

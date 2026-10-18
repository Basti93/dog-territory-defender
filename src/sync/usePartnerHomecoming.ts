import { useCallback, useSyncExternalStore } from 'react';

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
  const done = useCallback(() => queue.shift(), [queue]);
  return { request: canPlay ? next : null, done };
}

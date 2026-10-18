import { useSyncExternalStore } from 'react';

import type { NearbyItem } from './apiContract';
import { getNearby, subscribeNearby } from './nearbyStore';

/** The neighbour dogs from the last GET /v1/nearby (re-renders when the cache is replaced). `[]` while neighbours are off. */
export function useNearby(): NearbyItem[] {
  return useSyncExternalStore(subscribeNearby, getNearby);
}

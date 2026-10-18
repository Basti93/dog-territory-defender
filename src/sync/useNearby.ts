import { useSyncExternalStore } from 'react';

import type { NearbyItem } from './apiContract';
import { getNearby, subscribeNeighbourhood } from './neighbourhoodStore';

/** The neighbour dogs from the last GET /v1/nearby (re-renders when the store replaces them). `[]` while neighbours are off. */
export function useNearby(): NearbyItem[] {
  return useSyncExternalStore(subscribeNeighbourhood, getNearby);
}

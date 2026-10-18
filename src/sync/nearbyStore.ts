// In-memory cache of GET /v1/nearby (Track B). Deliberately not persisted yet: bots are simulated and refetched on
// every launch's first sync. The map layer reads it; nothing here touches the game's own Range.

import type { NearbyItem } from './apiContract';

let items: NearbyItem[] = [];
const listeners = new Set<() => void>();

export const getNearby = (): NearbyItem[] => items;

export function setNearby(next: NearbyItem[]): void {
  items = next;
  listeners.forEach((l) => l());
}

export function subscribeNearby(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

import type { Location } from '../types';
import type { ActiveWalkMeta, ActiveWalkRepository, ActiveWalkSnapshot } from './ActiveWalkRepository';

export function createInMemoryActiveWalkRepository(): ActiveWalkRepository {
  let active: { meta: ActiveWalkMeta; locations: Location[] } | null = null;

  return {
    async start(meta, locations) {
      active = { meta: { ...meta }, locations: locations.map((l) => ({ ...l })) };
    },
    async appendFixes(walkId, fixes) {
      if (!active || active.meta.id !== walkId) return;
      for (const fix of fixes) {
        const newest = active.locations[active.locations.length - 1];
        if (newest && fix.timestamp <= newest.timestamp) continue;
        active.locations.push({ ...fix });
      }
    },
    async load(): Promise<ActiveWalkSnapshot | null> {
      return active ? { meta: { ...active.meta }, locations: active.locations.map((l) => ({ ...l })) } : null;
    },
    async clear() {
      active = null;
    },
  };
}

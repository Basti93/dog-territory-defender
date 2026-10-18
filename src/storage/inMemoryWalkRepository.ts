import { Walk } from '../types';
import { StoredWalk, WalkRepository } from './WalkRepository';

export function createInMemoryWalkRepository(): WalkRepository {
  const walks = new Map<string, StoredWalk>();
  const newestFirst = () => Array.from(walks.values()).sort((a, b) => b.startTime - a.startTime);

  return {
    async saveWalk(walk: Walk): Promise<void> {
      const existing = walks.get(walk.id);
      walks.set(walk.id, { ...walk, syncedAt: existing?.syncedAt ?? null });
    },

    async getWalks(): Promise<StoredWalk[]> {
      return newestFirst();
    },

    async getRecentWalks(limit: number): Promise<StoredWalk[]> {
      return newestFirst().slice(0, Math.max(0, Math.floor(limit)));
    },

    async getWalk(id: string): Promise<StoredWalk | null> {
      return walks.get(id) ?? null;
    },

    async deleteWalk(id: string): Promise<void> {
      walks.delete(id);
    },

    async markSynced(id: string, at: number): Promise<void> {
      const existing = walks.get(id);
      if (existing) walks.set(id, { ...existing, syncedAt: at });
    },

    async countClosedWalks(): Promise<number> {
      let n = 0;
      for (const w of walks.values()) if (w.closed) n += 1;
      return n;
    },

    async getLastWalkEnd(): Promise<{ latitude: number; longitude: number } | null> {
      let latest: StoredWalk | null = null;
      for (const w of walks.values()) if (w.locations.length > 0 && (!latest || w.startTime > latest.startTime)) latest = w;
      const end = latest?.locations[latest.locations.length - 1];
      return end ? { latitude: end.latitude, longitude: end.longitude } : null;
    },

    async replaceAll(next: Walk[]): Promise<void> {
      walks.clear();
      for (const walk of next) walks.set(walk.id, { ...walk, syncedAt: null });
    },
  };
}

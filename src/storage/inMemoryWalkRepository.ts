import { Walk } from '../types';
import { StoredWalk, WalkRepository } from './WalkRepository';

export function createInMemoryWalkRepository(): WalkRepository {
  const walks = new Map<string, StoredWalk>();

  return {
    async saveWalk(walk: Walk): Promise<void> {
      const existing = walks.get(walk.id);
      walks.set(walk.id, { ...walk, syncedAt: existing?.syncedAt ?? null });
    },

    async getWalks(): Promise<StoredWalk[]> {
      return Array.from(walks.values()).sort((a, b) => b.startTime - a.startTime);
    },

    async getWalk(id: string): Promise<StoredWalk | null> {
      return walks.get(id) ?? null;
    },

    async deleteWalk(id: string): Promise<void> {
      walks.delete(id);
    },

    async replaceAll(next: Walk[]): Promise<void> {
      walks.clear();
      for (const walk of next) walks.set(walk.id, { ...walk, syncedAt: null });
    },
  };
}

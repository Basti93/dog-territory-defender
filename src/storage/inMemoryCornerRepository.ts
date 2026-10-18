import { CornerRepository, cornerCoords, NewCorner, StoredCorner } from './CornerRepository';
import type { CornerId } from '../utils/cornerDetection';

export function createInMemoryCornerRepository(): CornerRepository {
  const corners = new Map<CornerId, StoredCorner>();

  return {
    async getCorners() {
      return Array.from(corners.values()).map((c) => ({ ...c }));
    },
    async addCorners(incoming: NewCorner[]) {
      for (const c of incoming) {
        if (corners.has(c.id)) continue;
        corners.set(c.id, { ...c, street: null, name: null, nameBy: null, nameAt: null });
      }
    },
    async setStreet(id, street) {
      const existing = corners.get(id);
      if (existing) corners.set(id, { ...existing, street });
    },
    async setName(id, name, by, at) {
      const existing = corners.get(id);
      if (existing) {
        corners.set(id, { ...existing, name, nameBy: by, nameAt: at });
        return;
      }
      const { ix, iy } = cornerCoords(id);
      corners.set(id, { id, ix, iy, createdAt: at, walkId: null, street: null, name, nameBy: by, nameAt: at });
    },
  };
}

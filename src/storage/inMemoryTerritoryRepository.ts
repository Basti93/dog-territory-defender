import { generateTerritoryId, IncrementTerritoryStatsInput, Territory, TerritoryId, TerritoryRepository } from './TerritoryRepository';

export function createInMemoryTerritoryRepository(): TerritoryRepository {
  const territories = new Map<TerritoryId, Territory>();

  return {
    async getTerritories(): Promise<Territory[]> {
      return Array.from(territories.values());
    },

    async getTerritory(id: TerritoryId): Promise<Territory | null> {
      return territories.get(id) ?? null;
    },

    async createTerritory(name: string, createdAt: number): Promise<TerritoryId> {
      const id = generateTerritoryId(createdAt);
      territories.set(id, { id, name, createdAt, walksHere: 0, treatsEarnedHere: 0 });
      return id;
    },

    async renameTerritory(id: TerritoryId, name: string): Promise<void> {
      const existing = territories.get(id);
      if (!existing) return;
      territories.set(id, { ...existing, name });
    },

    async mergeTerritoryStats(survivorId: TerritoryId, absorbedId: TerritoryId): Promise<void> {
      const survivor = territories.get(survivorId);
      const absorbed = territories.get(absorbedId);
      if (!survivor || !absorbed) return;
      territories.set(survivorId, {
        ...survivor,
        walksHere: survivor.walksHere + absorbed.walksHere,
        treatsEarnedHere: survivor.treatsEarnedHere + absorbed.treatsEarnedHere,
      });
      territories.delete(absorbedId);
    },

    async replaceAll(next: Territory[]): Promise<void> {
      territories.clear();
      for (const t of next) territories.set(t.id, { ...t });
    },

    async incrementTerritoryStats(id: TerritoryId, input: IncrementTerritoryStatsInput): Promise<void> {
      const existing = territories.get(id);
      if (!existing) return;
      territories.set(id, {
        ...existing,
        walksHere: existing.walksHere + input.walksIncrement,
        treatsEarnedHere: existing.treatsEarnedHere + input.treatsIncrement,
      });
    },
  };
}

import { createInMemoryTerritoryRepository } from '../inMemoryTerritoryRepository';

// Matches homeRangeRepository.contract.test.ts's/walkRepository.contract.test.ts's
// existing pattern: the contract is exercised against the in-memory
// implementation only (the sqlite implementation is native-backed and isn't
// exercised under jest anywhere else in this codebase either).

describe('TerritoryRepository contract', () => {
  it('returns no territories before any are created', async () => {
    const repo = createInMemoryTerritoryRepository();

    expect(await repo.getTerritories()).toEqual([]);
  });

  it('creates a territory with the supplied name/createdAt and zeroed counters', async () => {
    const repo = createInMemoryTerritoryRepository();

    const id = await repo.createTerritory("Buddy's Hauptstraße Range", 1000);
    const territory = await repo.getTerritory(id);

    expect(territory).toEqual({ id, name: "Buddy's Hauptstraße Range", createdAt: 1000, walksHere: 0, treatsEarnedHere: 0 });
  });

  it('getTerritory returns null for an unknown id', async () => {
    const repo = createInMemoryTerritoryRepository();

    expect(await repo.getTerritory('nope')).toBeNull();
  });

  it('two territories created in the same millisecond get distinct ids', async () => {
    const repo = createInMemoryTerritoryRepository();

    const idA = await repo.createTerritory('A', 1000);
    const idB = await repo.createTerritory('B', 1000);

    expect(idA).not.toBe(idB);
  });

  it('renameTerritory updates the name and nothing else', async () => {
    const repo = createInMemoryTerritoryRepository();
    const id = await repo.createTerritory('Old Name', 1000);

    await repo.renameTerritory(id, 'New Name');
    const territory = await repo.getTerritory(id);

    expect(territory?.name).toBe('New Name');
    expect(territory?.createdAt).toBe(1000);
  });

  it('incrementTerritoryStats adds to walksHere/treatsEarnedHere, never resets', async () => {
    const repo = createInMemoryTerritoryRepository();
    const id = await repo.createTerritory('T', 1000);

    await repo.incrementTerritoryStats(id, { walksIncrement: 1, treatsIncrement: 50 });
    await repo.incrementTerritoryStats(id, { walksIncrement: 1, treatsIncrement: 55 });

    const territory = await repo.getTerritory(id);
    expect(territory?.walksHere).toBe(2);
    expect(territory?.treatsEarnedHere).toBe(105);
  });

  it('mergeTerritoryStats sums counters into the survivor and deletes the absorbed territory', async () => {
    const repo = createInMemoryTerritoryRepository();
    const survivorId = await repo.createTerritory('Older', 1000);
    const absorbedId = await repo.createTerritory('Newer', 2000);
    await repo.incrementTerritoryStats(survivorId, { walksIncrement: 3, treatsIncrement: 90 });
    await repo.incrementTerritoryStats(absorbedId, { walksIncrement: 2, treatsIncrement: 40 });

    await repo.mergeTerritoryStats(survivorId, absorbedId);

    const survivor = await repo.getTerritory(survivorId);
    expect(survivor).toMatchObject({ walksHere: 5, treatsEarnedHere: 130 });
    expect(await repo.getTerritory(absorbedId)).toBeNull();
  });
});

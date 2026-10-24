import { createInMemoryDenEconomyRepository } from '../inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../inMemoryHomeRangeRepository';
import { createInMemoryTerritoryRepository } from '../inMemoryTerritoryRepository';
import { runTerritoryFoldIfNeeded, runTerritoryMigrationIfNeeded } from '../territoryMigration';

const fakeResolveTerritoryName = jest.fn(async () => 'Fake Territory Name');

beforeEach(() => {
  fakeResolveTerritoryName.mockClear();
});

describe('runTerritoryMigrationIfNeeded', () => {
  it('does nothing when the Range is empty, but still marks the backfill complete', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const denEconomyRepository = createInMemoryDenEconomyRepository();

    await runTerritoryMigrationIfNeeded({
      homeRangeRepository,
      territoryRepository,
      denEconomyRepository,
      resolveTerritoryName: fakeResolveTerritoryName,
    });

    expect(await territoryRepository.getTerritories()).toEqual([]);
    expect((await denEconomyRepository.getState()).territoriesBackfillComplete).toBe(true);
  });

  it('a pre-existing Range with two far-apart clusters backfills into ONE home territory (far patches are promoted later by walks)', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const denEconomyRepository = createInMemoryDenEconomyRepository();
    const paintInputs = [];
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        paintInputs.push({ ix: dx, iy: dy, refreshedAt: 1_000_000, tracked: true });
        paintInputs.push({ ix: 100 + dx, iy: 100 + dy, refreshedAt: 2_000_000, tracked: true });
      }
    }
    await homeRangeRepository.paintCells(paintInputs);

    await runTerritoryMigrationIfNeeded({ homeRangeRepository, territoryRepository, denEconomyRepository, resolveTerritoryName: fakeResolveTerritoryName });

    expect(await territoryRepository.getTerritories()).toHaveLength(1);
    const cells = await homeRangeRepository.getCells();
    expect(new Set(cells.map((c) => c.territoryId)).size).toBe(1);
    expect(cells.every((c) => c.territoryId !== null)).toBe(true);
  });

  it('a single contiguous blob backfills into exactly one territory', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const denEconomyRepository = createInMemoryDenEconomyRepository();

    const paintInputs = [];
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        paintInputs.push({ ix: dx, iy: dy, refreshedAt: 1_000_000 + dx * 1000 + dy, tracked: true });
      }
    }
    await homeRangeRepository.paintCells(paintInputs);

    await runTerritoryMigrationIfNeeded({
      homeRangeRepository,
      territoryRepository,
      denEconomyRepository,
      resolveTerritoryName: fakeResolveTerritoryName,
    });

    expect(await territoryRepository.getTerritories()).toHaveLength(1);
  });

  it('running the migration twice does not double-create territories (idempotent on a second app load)', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const denEconomyRepository = createInMemoryDenEconomyRepository();
    await homeRangeRepository.paintCells([{ ix: 0, iy: 0, refreshedAt: 1000, tracked: true }]);

    await runTerritoryMigrationIfNeeded({
      homeRangeRepository,
      territoryRepository,
      denEconomyRepository,
      resolveTerritoryName: fakeResolveTerritoryName,
    });
    await runTerritoryMigrationIfNeeded({
      homeRangeRepository,
      territoryRepository,
      denEconomyRepository,
      resolveTerritoryName: fakeResolveTerritoryName,
    });

    expect(await territoryRepository.getTerritories()).toHaveLength(1);
  });
});

describe('runTerritoryFoldIfNeeded', () => {
  async function setup() {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const home = await territoryRepository.createTerritory('Home', 1000);
    const far = await territoryRepository.createTerritory('Far, walked twice', 2000);
    const tiny = await territoryRepository.createTerritory('Tiny, walked once', 3000);
    await territoryRepository.incrementTerritoryStats(home, { walksIncrement: 25, treatsIncrement: 100 });
    await territoryRepository.incrementTerritoryStats(far, { walksIncrement: 2, treatsIncrement: 8 });
    await territoryRepository.incrementTerritoryStats(tiny, { walksIncrement: 1, treatsIncrement: 5 });
    const paint = (ix0: number, id: string) => [0, 1].flatMap((dy) => [0, 1].map((dx) => ({ ix: ix0 + dx, iy: dy, refreshedAt: 1, tracked: true, territoryId: id })));
    await homeRangeRepository.paintCells([...paint(0, home), ...paint(500, far), ...paint(510, tiny)]);
    return { homeRangeRepository, territoryRepository, home, far, tiny };
  }

  it('folds a territory with fewer than 2 walks into the nearest kept one, summing the counters', async () => {
    const { homeRangeRepository, territoryRepository, home, far, tiny } = await setup();

    expect(await runTerritoryFoldIfNeeded({ homeRangeRepository, territoryRepository })).toBe(1);

    const ids = (await territoryRepository.getTerritories()).map((t) => t.id).sort();
    expect(ids).toEqual([home, far].sort());
    const farTerritory = await territoryRepository.getTerritory(far);
    expect(farTerritory?.walksHere).toBe(3);
    expect(farTerritory?.treatsEarnedHere).toBe(13);
    expect((await homeRangeRepository.getCellsByTerritory(far)).length).toBe(8);
    expect((await homeRangeRepository.getCellsByTerritory(tiny)).length).toBe(0);
  });

  it('is idempotent and leaves a lone territory alone', async () => {
    const { homeRangeRepository, territoryRepository } = await setup();
    await runTerritoryFoldIfNeeded({ homeRangeRepository, territoryRepository });
    expect(await runTerritoryFoldIfNeeded({ homeRangeRepository, territoryRepository })).toBe(0);
  });

  it('folds into home when no other territory has enough walks (the owner\'s household ends with 1 territory)', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const home = await territoryRepository.createTerritory('Lindenstrasse', 1000);
    const other = await territoryRepository.createTerritory('Birkenweg', 2000);
    await territoryRepository.incrementTerritoryStats(home, { walksIncrement: 24, treatsIncrement: 0 });
    await homeRangeRepository.paintCells([
      { ix: 0, iy: 0, refreshedAt: 1, tracked: true, territoryId: home },
      { ix: 900, iy: 900, refreshedAt: 1, tracked: true, territoryId: other },
    ]);

    await runTerritoryFoldIfNeeded({ homeRangeRepository, territoryRepository });

    expect((await territoryRepository.getTerritories()).map((t) => t.id)).toEqual([home]);
    expect((await homeRangeRepository.getCellsByTerritory(home)).length).toBe(2);
  });
});

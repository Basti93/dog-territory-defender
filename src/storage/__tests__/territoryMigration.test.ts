import { createInMemoryDenEconomyRepository } from '../inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../inMemoryHomeRangeRepository';
import { createInMemoryTerritoryRepository } from '../inMemoryTerritoryRepository';
import { runTerritoryMigrationIfNeeded } from '../territoryMigration';

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

  it('a synthetic pre-existing Range with two geographically separate clusters backfills into two territories, not one', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const denEconomyRepository = createInMemoryDenEconomyRepository();

    // Two well-separated 3x3 blocks (~600+m apart in grid-index terms — far
    // beyond SPAWN_DISTANCE_M), painted with no territoryId (pre-migration state).
    const paintInputs = [];
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        paintInputs.push({ ix: dx, iy: dy, refreshedAt: 1_000_000, tracked: true });
      }
    }
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        paintInputs.push({ ix: 100 + dx, iy: 100 + dy, refreshedAt: 2_000_000, tracked: true });
      }
    }
    await homeRangeRepository.paintCells(paintInputs);

    await runTerritoryMigrationIfNeeded({
      homeRangeRepository,
      territoryRepository,
      denEconomyRepository,
      resolveTerritoryName: fakeResolveTerritoryName,
    });

    const territories = await territoryRepository.getTerritories();
    expect(territories).toHaveLength(2);

    const cells = await homeRangeRepository.getCells();
    expect(cells.every((c) => c.territoryId !== null)).toBe(true);
    const territoryIdsUsed = new Set(cells.map((c) => c.territoryId));
    expect(territoryIdsUsed.size).toBe(2);
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

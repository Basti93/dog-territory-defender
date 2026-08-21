import { Walk } from '../../types';
import { paintedCells } from '../../utils/grid';
import { createInMemoryDenEconomyRepository } from '../inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../inMemoryHomeRangeRepository';
import { createInMemoryWalkRepository } from '../inMemoryWalkRepository';
import { runHomeRangeMigrationIfNeeded } from '../homeRangeMigration';

function makeTrackedWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: overrides.id ?? 'tracked-1',
    startTime: overrides.startTime ?? 1_700_000_000_000,
    locations: overrides.locations ?? [
      { latitude: 48.1374, longitude: 11.5755, timestamp: 0, accuracy: 5 },
      { latitude: 48.1384, longitude: 11.5765, timestamp: 60_000, accuracy: 5 },
      { latitude: 48.1394, longitude: 11.5775, timestamp: 120_000, accuracy: 5 },
    ],
    closed: overrides.closed ?? true,
    startSource: overrides.startSource ?? 'button',
  };
}

function makeManualWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: overrides.id ?? 'manual-1',
    startTime: overrides.startTime ?? 1_700_100_000_000,
    locations: [],
    closed: true,
    startSource: 'manual-log',
    ...overrides,
  };
}

describe('runHomeRangeMigrationIfNeeded', () => {
  it('backfills real-trail walks and skips manual-log walks entirely', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const denEconomyRepository = createInMemoryDenEconomyRepository();

    const walkA = makeTrackedWalk({ id: 'a', startTime: 1_000_000 });
    const walkB = makeTrackedWalk({
      id: 'b',
      startTime: 2_000_000,
      locations: [
        { latitude: 48.2, longitude: 11.6, timestamp: 0, accuracy: 5 },
        { latitude: 48.201, longitude: 11.601, timestamp: 60_000, accuracy: 5 },
      ],
    });
    const manualWalk = makeManualWalk({ id: 'manual', startTime: 3_000_000 });

    await walkRepository.saveWalk(walkA);
    await walkRepository.saveWalk(walkB);
    await walkRepository.saveWalk(manualWalk);

    await runHomeRangeMigrationIfNeeded({ walkRepository, homeRangeRepository, denEconomyRepository });

    const cells = await homeRangeRepository.getCells();
    const expectedCellCount = paintedCells(walkA.locations).size + paintedCells(walkB.locations).size;
    expect(cells.length).toBe(expectedCellCount);

    // Each walk's cells are seeded with that walk's own startTime, not the replay time.
    const cellsFromWalkA = paintedCells(walkA.locations);
    const firstCellId = Array.from(cellsFromWalkA)[0];
    const [ix, iy] = firstCellId.split(',').map(Number);
    const stored = cells.find((c) => c.ix === ix && c.iy === iy);
    expect(stored?.lastRefreshed).toBe(walkA.startTime);
    expect(stored?.lastTracked).toBe(walkA.startTime);
  });

  it('marks the backfill complete so it never re-runs', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const denEconomyRepository = createInMemoryDenEconomyRepository();
    await walkRepository.saveWalk(makeTrackedWalk());

    await runHomeRangeMigrationIfNeeded({ walkRepository, homeRangeRepository, denEconomyRepository });
    const state = await denEconomyRepository.getState();
    expect(state.homeRangeBackfillComplete).toBe(true);
  });

  it('running the backfill twice does not double-count visits (idempotent on a second app load)', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const denEconomyRepository = createInMemoryDenEconomyRepository();
    const walk = makeTrackedWalk();
    await walkRepository.saveWalk(walk);

    await runHomeRangeMigrationIfNeeded({ walkRepository, homeRangeRepository, denEconomyRepository });
    const cellsAfterFirstRun = await homeRangeRepository.getCells();

    // Simulate a second app load: run it again with the same (now-flagged) state.
    await runHomeRangeMigrationIfNeeded({ walkRepository, homeRangeRepository, denEconomyRepository });
    const cellsAfterSecondRun = await homeRangeRepository.getCells();

    expect(cellsAfterSecondRun).toEqual(cellsAfterFirstRun);
    for (const cell of cellsAfterSecondRun) {
      expect(cell.visits).toBe(1);
    }
  });

  it('does nothing when there are no walks at all', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const denEconomyRepository = createInMemoryDenEconomyRepository();

    await runHomeRangeMigrationIfNeeded({ walkRepository, homeRangeRepository, denEconomyRepository });

    expect(await homeRangeRepository.getCells()).toEqual([]);
    expect((await denEconomyRepository.getState()).homeRangeBackfillComplete).toBe(true);
  });
});

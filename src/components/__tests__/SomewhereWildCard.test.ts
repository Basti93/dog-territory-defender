import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryTerritoryRepository } from '../../storage/inMemoryTerritoryRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { Location } from '../../types';
import { CELLS_PER_STREET, cellKey } from '../../utils/grid';
import { dayPhrase, evaluateSomewhereWild, evaluateSomewhereWildShared, INITIAL_WILD_CLUSTER_VARIANT_STATE } from '../SomewhereWildCard';
import { setLocale } from '../../i18n';

// These tests assert English copy; pin the locale explicitly.
beforeAll(() => setLocale('en'));

// streetLookup.ts caches resolved labels in a module-level Map keyed by
// anchor cell id / event occurredAt (by design — see its own doc comment).
// Every test below therefore uses its own, non-overlapping block of grid
// cells (and, for New Ground events, its own occurredAt) so no test's
// geocode result leaks into another's cache entry.

const mockReverseGeocodeAsync = jest.fn();
jest.mock('expo-location', () => ({
  reverseGeocodeAsync: (...args: unknown[]) => mockReverseGeocodeAsync(...args),
}));

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-22T12:00:00Z');
const WILD_DAYS_AGO = NOW - 10 * MS_PER_DAY;

/**
 * Paints a width x height block of cells via the real repository API,
 * repainting each cell `visitMultiplier` times so its `visits` count is a
 * real, comparable ranking signal (paintCells has no "set visits directly"
 * escape hatch — see storage/HomeRangeRepository.ts). Each repeat visit
 * lands on its own distinct calendar day (docs/decisions/territories.md'
 * daily visits cap would otherwise collapse same-day repaints to a single
 * credited visit) while the LAST visit still lands exactly on `refreshedAt`,
 * so lastRefreshed/wildness stay exactly what callers already expect.
 */
async function paintBlock(
  repo: ReturnType<typeof createInMemoryHomeRangeRepository>,
  originIx: number,
  originIy: number,
  width: number,
  height: number,
  refreshedAt: number,
  visitMultiplier: number = 1
) {
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      for (let v = 0; v < visitMultiplier; v++) {
        const visitAt = refreshedAt - (visitMultiplier - 1 - v) * MS_PER_DAY;
        await repo.paintCells([{ ix: originIx + dx, iy: originIy + dy, refreshedAt: visitAt, tracked: true }]);
      }
    }
  }
}

/** A short GPS trail comfortably inside the given grid cell's lat/lon range (grid.ts's CELL_M=20 cells are tiny — well under 0.001 degrees), so paintedCells()/reverse-geocode fallback lookups have something real to find. */
function trailNear(ix: number, iy: number): Location[] {
  const lat = iy * (20 / 111320) + 0.00001;
  const lon = ix * (20 / 111320) + 0.00001;
  return [
    { latitude: lat, longitude: lon, timestamp: 1000, accuracy: 5 },
    { latitude: lat + 0.000005, longitude: lon + 0.000005, timestamp: 2000, accuracy: 5 },
  ];
}

beforeEach(() => {
  mockReverseGeocodeAsync.mockReset();
});

describe('evaluateSomewhereWild — full path', () => {
  it('New Ground takes priority: a fresh event with a resolvable place renders the "with place" template', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    await walkRepository.saveWalk({ id: '1', startTime: 1, locations: trailNear(0, 0), closed: true, startSource: 'button' });
    await homeRangeRepository.recordNewGroundEvent(NOW - MS_PER_DAY / 2, ['0,0', '1,0', '0,1']);
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Parkweg', district: null, city: null }]);

    const result = await evaluateSomewhereWild({ homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW });

    expect(result.card).not.toBeNull();
    expect(result.card!.text).toMatch(/^Buddy learned 1 new street by Parkweg (today|yesterday)\.$/);
  });

  it('New Ground with no resolvable label still renders, using the "without place" template', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    await walkRepository.saveWalk({
      id: '2',
      startTime: 1,
      locations: trailNear(1000, 0),
      closed: true,
      startSource: 'button',
    });
    await homeRangeRepository.recordNewGroundEvent(NOW - MS_PER_DAY / 2 - 1, ['1000,0', '1001,0']);
    mockReverseGeocodeAsync.mockResolvedValue([]); // geocoder never resolves anything

    const result = await evaluateSomewhereWild({ homeRangeRepository, walkRepository, dogName: null, now: NOW });

    expect(result.card).not.toBeNull();
    expect(result.card!.text).toMatch(/^Your dog learned 1 new street (today|yesterday)\.$/);
  });

  it('a New Ground event older than 48h is ignored, falling through to the wild-cluster state', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    await homeRangeRepository.recordNewGroundEvent(NOW - 49 * 60 * 60 * 1000, ['2000,0']);
    await paintBlock(homeRangeRepository, 2000, 2000, 4, 3, WILD_DAYS_AGO);
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Sonnenallee', district: null, city: null }]);

    const result = await evaluateSomewhereWild({ homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW });

    expect(result.card).not.toBeNull();
    expect(result.card!.text).toContain('Sonnenallee');
  });

  it('with no New Ground event, a qualifying wild cluster with a resolvable place renders one of the 4 rotating variants', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    await paintBlock(homeRangeRepository, 3000, 3000, 4, 3, WILD_DAYS_AGO);
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Karl-Marx-Straße', district: null, city: null }]);

    const result = await evaluateSomewhereWild({ homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW });

    expect(result.card).not.toBeNull();
    expect([
      'The old scent mark at Karl-Marx-Straße has surely faded by now. Time for a fresh one!',
      'The neighbour dogs have been busy marking at Karl-Marx-Straße, and Buddy would love to reply.',
      'Fresh sniff-mail waiting at Karl-Marx-Straße.',
      'At Karl-Marx-Straße, Buddy would like to go sniffing and marking again.',
    ]).toContain(result.card!.text);
  });

  it.each(['en', 'de'] as const)('no wild-cluster variant starts with the lowercase dog fallback (%s)', async (locale) => {
    setLocale(locale);
    try {
      const homeRangeRepository = createInMemoryHomeRangeRepository();
      const walkRepository = createInMemoryWalkRepository();
      await paintBlock(homeRangeRepository, 3500, 3500, 4, 3, WILD_DAYS_AGO);
      mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Parkweg', district: null, city: null }]);
      const result = await evaluateSomewhereWild({ homeRangeRepository, walkRepository, dogName: null, now: NOW });
      expect(result.card!.text).not.toMatch(/\{|^(your pup|dein Hund)/);
      expect(result.card!.text).toContain('Parkweg');
    } finally {
      setLocale('en');
    }
  });

  // docs/decisions/territories.md's "Somewhere Wild becomes
  // territory-aware" requirement.
  it('a wild cluster inside a named Territory uses the Territory name instead of the raw street label', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const walkRepository = createInMemoryWalkRepository();
    await paintBlock(homeRangeRepository, 8000, 8000, 4, 3, WILD_DAYS_AGO);
    const territoryId = await territoryRepository.createTerritory("Buddy's Office Range", 1000);
    const cellIds: string[] = [];
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        cellIds.push(cellKey(8000 + dx, 8000 + dy));
      }
    }
    await homeRangeRepository.assignTerritoryToCells(cellIds, territoryId);
    // Even if the raw reverse-geocode succeeds, the Territory name must win.
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Some Random Street', district: null, city: null }]);

    const result = await evaluateSomewhereWild({
      homeRangeRepository,
      walkRepository,
      territoryRepository,
      dogName: 'Buddy',
      now: NOW,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.text).toContain("Buddy's territory on Office");
    expect(result.card!.text).not.toContain('Some Random Street');
  });

  it('a wild cluster with no territory assigned falls back to the raw street label unchanged, even when territoryRepository is supplied', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const walkRepository = createInMemoryWalkRepository();
    await paintBlock(homeRangeRepository, 9000, 9000, 4, 3, WILD_DAYS_AGO);
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Karl-Marx-Straße', district: null, city: null }]);

    const result = await evaluateSomewhereWild({
      homeRangeRepository,
      walkRepository,
      territoryRepository,
      dogName: 'Buddy',
      now: NOW,
    });

    expect(result.card).not.toBeNull();
    expect(result.card!.text).toContain('Karl-Marx-Straße');
  });

  it('the wild-cluster variant epoch only advances when the winning cluster itself changes', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    await paintBlock(homeRangeRepository, 4000, 4000, 4, 3, WILD_DAYS_AGO);
    mockReverseGeocodeAsync.mockResolvedValue([{ street: 'Erste Straße', district: null, city: null }]);

    const first = await evaluateSomewhereWild(
      { homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW },
      INITIAL_WILD_CLUSTER_VARIANT_STATE
    );
    const second = await evaluateSomewhereWild(
      { homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW + 1000 },
      first.wildClusterVariantState
    );

    // Same winning cluster both times (nothing painted in between) -> same epoch, same anchor, same text.
    expect(second.wildClusterVariantState).toEqual(first.wildClusterVariantState);
    expect(second.card!.text).toBe(first.card!.text);

    // A brand-new cluster with far more visits becomes the winner -> anchor changes -> epoch advances.
    await paintBlock(homeRangeRepository, 5000, 5000, 4, 3, WILD_DAYS_AGO, 10);
    mockReverseGeocodeAsync.mockResolvedValue([{ street: 'Zweite Straße', district: null, city: null }]);
    const third = await evaluateSomewhereWild(
      { homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW + 2000 },
      second.wildClusterVariantState
    );

    expect(third.wildClusterVariantState.anchorCellId).not.toBe(second.wildClusterVariantState.anchorCellId);
    expect(third.wildClusterVariantState.epoch).toBe(second.wildClusterVariantState.epoch + 1);
  });

  it('a wild cluster whose label fails to resolve renders neither a card (Fix 2: no orphaned marker/card)', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    await paintBlock(homeRangeRepository, 6000, 6000, 4, 3, WILD_DAYS_AGO);
    mockReverseGeocodeAsync.mockResolvedValue([]); // never resolves, and no walk history to fall back to

    const result = await evaluateSomewhereWild({ homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW });

    expect(result.card).toBeNull();
  });

  it('renders null (the common case) when there is no New Ground event and no qualifying wild cluster', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    // A patch too small to qualify as a cluster (design.md's CELLS_PER_STREET floor).
    await paintBlock(homeRangeRepository, 7000, 7000, CELLS_PER_STREET - 1, 1, WILD_DAYS_AGO);

    const result = await evaluateSomewhereWild({ homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW });

    expect(result.card).toBeNull();
    expect(mockReverseGeocodeAsync).not.toHaveBeenCalled();
  });
});

describe('evaluateSomewhereWildShared — once per data change', () => {
  it('reuses one evaluation for the same data version, re-runs on a new version, a new dog name or after the TTL', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    const getCells = jest.spyOn(homeRangeRepository, 'getCells');
    const deps = { homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW };

    const first = await evaluateSomewhereWildShared(deps, 0);
    const again = await evaluateSomewhereWildShared({ ...deps, now: NOW + 60_000 }, 0);
    expect(again).toBe(first);
    expect(getCells).toHaveBeenCalledTimes(1);

    await evaluateSomewhereWildShared(deps, 1); // a walk was finished
    expect(getCells).toHaveBeenCalledTimes(2);
    await evaluateSomewhereWildShared({ ...deps, dogName: 'Rex' }, 1);
    expect(getCells).toHaveBeenCalledTimes(3);
    await evaluateSomewhereWildShared({ ...deps, dogName: 'Rex', now: NOW + 21 * 60_000 }, 1);
    expect(getCells).toHaveBeenCalledTimes(4);
  });

  it('does not remember a failed evaluation', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const walkRepository = createInMemoryWalkRepository();
    const getCells = jest.spyOn(homeRangeRepository, 'getCells').mockRejectedValueOnce(new Error('offline'));
    const deps = { homeRangeRepository, walkRepository, dogName: 'Buddy', now: NOW };

    await expect(evaluateSomewhereWildShared(deps, 0)).rejects.toThrow('offline');
    await expect(evaluateSomewhereWildShared(deps, 0)).resolves.toEqual(expect.objectContaining({ card: null }));
    expect(getCells).toHaveBeenCalledTimes(2);
  });
});

describe('dayPhrase', () => {
  it('same calendar day -> "today"', () => {
    expect(dayPhrase(NOW - 60 * 60 * 1000, NOW)).toBe('today');
  });

  it('previous calendar day -> "yesterday"', () => {
    expect(dayPhrase(NOW - MS_PER_DAY, NOW)).toBe('yesterday');
  });

  it('two calendar days back -> "on {Weekday}"', () => {
    expect(dayPhrase(NOW - 2 * MS_PER_DAY, NOW)).toMatch(/^on [A-Z][a-z]+day$/);
  });
});

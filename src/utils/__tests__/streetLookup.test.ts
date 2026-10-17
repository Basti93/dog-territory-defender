import { NewGroundEvent } from '../../storage/HomeRangeRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { Location } from '../../types';
import * as grid from '../grid';
import { resolveNewGroundSpot, resolveTerritoryName, resolveWildClusterLabel } from '../streetLookup';
import { WildCluster } from '../wildSpot';
import { setLocale } from '../../i18n';

// These tests assert English copy; pin the locale explicitly.
beforeAll(() => setLocale('en'));

const mockReverseGeocodeAsync = jest.fn();
jest.mock('expo-location', () => ({
  reverseGeocodeAsync: (...args: unknown[]) => mockReverseGeocodeAsync(...args),
}));

function makeCluster(overrides: Partial<WildCluster> = {}): WildCluster {
  return {
    anchor: { ix: 0, iy: 0 },
    anchorCellId: '0,0',
    cellIds: new Set(['0,0', '1,0', '0,1']),
    bounds: { minIx: 0, maxIx: 1, minIy: 0, maxIy: 1 },
    visitsSum: 10,
    ...overrides,
  };
}

// A short GPS trail comfortably inside cell (0,0)/(1,0)/(0,1)'s lat/lon range
// (grid.ts's CELL_M=20 cells are tiny — well under 0.001 degrees), so
// paintedCells() on it intersects the fixture cluster above.
const OVERLAPPING_WALK_LOCATIONS: Location[] = [
  { latitude: 0.00005, longitude: 0.00005, timestamp: 1000, accuracy: 5 },
  { latitude: 0.00006, longitude: 0.00006, timestamp: 2000, accuracy: 5 },
];

// Far away from the fixture cluster — well outside its bounding box, so the
// bbox pre-filter should exclude this walk before paintedCells() ever runs.
const FAR_AWAY_WALK_LOCATIONS: Location[] = [
  { latitude: 10, longitude: 10, timestamp: 1000, accuracy: 5 },
  { latitude: 10.001, longitude: 10.001, timestamp: 2000, accuracy: 5 },
];

async function saveWalk(repo: ReturnType<typeof createInMemoryWalkRepository>, id: string, locations: Location[]) {
  await repo.saveWalk({ id, startTime: Number(id), locations, closed: true, startSource: 'button' });
}

beforeEach(() => {
  mockReverseGeocodeAsync.mockReset();
});

describe('resolveWildClusterLabel', () => {
  it('primary-path success short-circuits the fallback walk-history scan', async () => {
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Sonnenallee', district: null, city: null } as never]);
    const walkRepository = createInMemoryWalkRepository();
    const getWalksSpy = jest.spyOn(walkRepository, 'getWalks');

    const label = await resolveWildClusterLabel(makeCluster({ anchorCellId: 'primary-success' }), { walkRepository });

    expect(label).toBe('Sonnenallee');
    expect(getWalksSpy).not.toHaveBeenCalled();
    expect(mockReverseGeocodeAsync).toHaveBeenCalledTimes(1);
  });

  it('primary-path failure falls through to the bounded walk-history scan and finds a match', async () => {
    // Primary reverse-geocode (the anchor cell centre) resolves nothing.
    mockReverseGeocodeAsync.mockResolvedValueOnce([]);
    // Fallback reverse-geocode (a real location from the overlapping walk) succeeds.
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Karl-Marx-Straße', district: null, city: null } as never]);

    const walkRepository = createInMemoryWalkRepository();
    await saveWalk(walkRepository, '1000', OVERLAPPING_WALK_LOCATIONS);

    const label = await resolveWildClusterLabel(makeCluster({ anchorCellId: 'primary-failure' }), { walkRepository });

    expect(label).toBe('Karl-Marx-Straße');
    expect(mockReverseGeocodeAsync).toHaveBeenCalledTimes(2);
  });

  it('returns null when both the primary reverse-geocode and the fallback scan fail to resolve anything', async () => {
    mockReverseGeocodeAsync.mockResolvedValue([]);
    const walkRepository = createInMemoryWalkRepository();
    await saveWalk(walkRepository, '1000', OVERLAPPING_WALK_LOCATIONS);

    const label = await resolveWildClusterLabel(makeCluster({ anchorCellId: 'both-fail' }), { walkRepository });

    expect(label).toBeNull();
  });

  it('the bounding-box pre-filter narrows the candidate set before the more expensive paintedCells() call', async () => {
    mockReverseGeocodeAsync.mockResolvedValueOnce([]); // primary fails, forces the fallback scan
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Real Street', district: null, city: null } as never]);

    const walkRepository = createInMemoryWalkRepository();
    // Three walks nowhere near the cluster (should be excluded by the bbox
    // pre-filter, never reaching paintedCells()) and one that actually overlaps.
    await saveWalk(walkRepository, '4000', FAR_AWAY_WALK_LOCATIONS);
    await saveWalk(walkRepository, '3000', FAR_AWAY_WALK_LOCATIONS);
    await saveWalk(walkRepository, '2000', FAR_AWAY_WALK_LOCATIONS);
    await saveWalk(walkRepository, '1000', OVERLAPPING_WALK_LOCATIONS);

    const paintedCellsSpy = jest.spyOn(grid, 'paintedCells');

    const label = await resolveWildClusterLabel(makeCluster({ anchorCellId: 'bbox-prefilter' }), { walkRepository });

    expect(label).toBe('Real Street');
    // Only the one overlapping walk should ever reach paintedCells() — the
    // three far-away walks are excluded by the cheap bbox check first.
    expect(paintedCellsSpy).toHaveBeenCalledTimes(1);
    expect(paintedCellsSpy).toHaveBeenCalledWith(OVERLAPPING_WALK_LOCATIONS);

    paintedCellsSpy.mockRestore();
  });
});

describe('resolveNewGroundSpot', () => {
  function makeEvent(overrides: Partial<NewGroundEvent> = {}): NewGroundEvent {
    return { occurredAt: 999000, cellIds: ['0,0', '1,0', '0,1'], ...overrides };
  }

  it('finds the discovering walk (via the same bounded scan the wild-cluster fallback uses) and resolves its label', async () => {
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Parkweg', district: null, city: null } as never]);
    const walkRepository = createInMemoryWalkRepository();
    await saveWalk(walkRepository, '1000', OVERLAPPING_WALK_LOCATIONS);

    const spot = await resolveNewGroundSpot(makeEvent({ occurredAt: 1 }), walkRepository);

    expect(spot).not.toBeNull();
    expect(spot!.label).toBe('Parkweg');
    expect(OVERLAPPING_WALK_LOCATIONS).toContainEqual(spot!.location);
  });

  it('renders with no label ("without place" template territory) rather than nothing, when the geocoder resolves nothing but a real location was found', async () => {
    mockReverseGeocodeAsync.mockResolvedValueOnce([]);
    const walkRepository = createInMemoryWalkRepository();
    await saveWalk(walkRepository, '1000', OVERLAPPING_WALK_LOCATIONS);

    const spot = await resolveNewGroundSpot(makeEvent({ occurredAt: 2 }), walkRepository);

    expect(spot).not.toBeNull();
    expect(spot!.label).toBeNull();
    expect(spot!.location).toBeDefined();
  });

  it('returns null when no walk in history overlaps this event\'s cells at all', async () => {
    const walkRepository = createInMemoryWalkRepository();
    await saveWalk(walkRepository, '1000', FAR_AWAY_WALK_LOCATIONS);

    const spot = await resolveNewGroundSpot(makeEvent({ occurredAt: 3 }), walkRepository);

    expect(spot).toBeNull();
    expect(mockReverseGeocodeAsync).not.toHaveBeenCalled();
  });
});

// openspec/changes/territories/design.md Decision 5 — a Territory must
// always get a real, non-empty name, even when reverse-geocoding fails
// (unlike the wild-cluster/New-Ground states above, which render nothing).
describe('resolveTerritoryName', () => {
  it('composes the dog name and the resolved place when geocoding succeeds', async () => {
    mockReverseGeocodeAsync.mockResolvedValueOnce([{ street: 'Hauptstraße', district: null, city: null } as never]);

    const name = await resolveTerritoryName(48.1, 11.5, 'Buddy');

    expect(name).toBe("Buddy's Hauptstraße Range");
  });

  it('falls back to a non-empty placeholder name when geocoding resolves nothing', async () => {
    mockReverseGeocodeAsync.mockResolvedValueOnce([]);

    const name = await resolveTerritoryName(48.1, 11.5, 'Buddy');

    expect(name).toBe("Buddy's New Range");
  });

  it('falls back to a non-empty placeholder name when the geocoder throws', async () => {
    mockReverseGeocodeAsync.mockRejectedValueOnce(new Error('offline'));

    const name = await resolveTerritoryName(48.1, 11.5, 'Buddy');

    expect(name).toBe("Buddy's New Range");
  });

  it('uses the generic dog fallback when no dog name is set', async () => {
    mockReverseGeocodeAsync.mockResolvedValueOnce([]);

    const name = await resolveTerritoryName(48.1, 11.5, null);

    expect(name).toBe("Your dog's New Range");
  });
});

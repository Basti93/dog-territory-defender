import { Walk } from '../../types';
import { defaultDenEconomyState, DenEconomyState } from '../denEconomy';
import { defaultPersonalStatsState, recordBuildingUpgrade, recordTreatsEarned, recordWalkClosed } from '../personalStats';
import { setLocale } from '../../i18n';
import { DISTANCE_RULE_SINCE_MS } from '../../utils/geometry';

// These tests assert English copy; pin the locale explicitly.
beforeAll(() => setLocale('en'));

function makeWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'walk-1',
    startTime: 1000,
    closed: true,
    startSource: 'button',
    locations: [
      { latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 },
      { latitude: 52.501, longitude: 13.4, timestamp: 1000, accuracy: 5 },
    ],
    ...overrides,
  };
}

describe('recordWalkClosed — distance rule', () => {
  // 40 m, then a 3 km tram ride 60 s later, then 40 m again: only the two strolls are walked distance.
  const ride = [
    { latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 },
    { latitude: 52.5 + 40 / 111320, longitude: 13.4, timestamp: 30_000, accuracy: 5 },
    { latitude: 52.5 + 3040 / 111320, longitude: 13.4, timestamp: 90_000, accuracy: 5 },
    { latitude: 52.5 + 3080 / 111320, longitude: 13.4, timestamp: 120_000, accuracy: 5 },
  ];

  it('a walk started after the rule shipped does not count the ride', () => {
    const { stats } = recordWalkClosed(defaultPersonalStatsState(), makeWalk({ startTime: DISTANCE_RULE_SINCE_MS + 1, locations: ride }), 30);
    expect(stats.lifetimeDistanceMeters).toBeGreaterThan(70);
    expect(stats.lifetimeDistanceMeters).toBeLessThan(90);
  });

  it('a walk started before keeps the old, unfiltered distance (nothing recomputed ever goes down)', () => {
    const { stats } = recordWalkClosed(defaultPersonalStatsState(), makeWalk({ startTime: DISTANCE_RULE_SINCE_MS - 1, locations: ride }), 30);
    expect(stats.lifetimeDistanceMeters).toBeGreaterThan(3000);
  });
});

describe('recordWalkClosed', () => {
  it('unlocks first-steps exactly once, on the first walk only', () => {
    let stats = defaultPersonalStatsState();

    const first = recordWalkClosed(stats, makeWalk(), 30);
    expect(first.newlyUnlocked).toContain('first-steps');
    stats = first.stats;

    const second = recordWalkClosed(stats, makeWalk({ id: 'walk-2' }), 30);
    expect(second.newlyUnlocked).not.toContain('first-steps');
  });

  it('unlocks paws-on-the-pavement at exactly 10 walks, not before or after', () => {
    let stats = defaultPersonalStatsState();
    let lastResult: ReturnType<typeof recordWalkClosed> | null = null;

    for (let i = 0; i < 10; i++) {
      lastResult = recordWalkClosed(stats, makeWalk({ id: `walk-${i}` }), 30);
      stats = lastResult.stats;
    }

    expect(lastResult!.newlyUnlocked).toContain('paws-on-the-pavement');

    const eleventh = recordWalkClosed(stats, makeWalk({ id: 'walk-11' }), 30);
    expect(eleventh.newlyUnlocked).not.toContain('paws-on-the-pavement');
  });

  it('unlocks ground-claimed the first time a walk paints enough cells to clear 50m2', () => {
    let stats = defaultPersonalStatsState();

    const small = recordWalkClosed(stats, makeWalk(), 0); // 0 cells = 0 m² (e.g. a manual log)
    expect(small.newlyUnlocked).not.toContain('ground-claimed');
    stats = small.stats;

    const big = recordWalkClosed(stats, makeWalk({ id: 'walk-2' }), 1); // 1 cell = 400 m², clears the 50m² bar
    expect(big.newlyUnlocked).toContain('ground-claimed');
    stats = big.stats;

    const again = recordWalkClosed(stats, makeWalk({ id: 'walk-3' }), 1);
    expect(again.newlyUnlocked).not.toContain('ground-claimed');
  });

  it('unlocks long-way-round the first time a single walk covers 3000m', () => {
    const stats = defaultPersonalStatsState();
    const farWalk = makeWalk({
      locations: [
        { latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 },
        { latitude: 52.527, longitude: 13.4, timestamp: 40 * 60_000, accuracy: 5 }, // ~3000m north in 40 minutes
      ],
    });

    const result = recordWalkClosed(stats, farWalk, 30);
    expect(result.newlyUnlocked).toContain('long-way-round');
  });

  it('tracks lifetime distance and territory area cumulatively', () => {
    let stats = defaultPersonalStatsState();
    stats = recordWalkClosed(stats, makeWalk(), 1).stats; // 400 m²
    stats = recordWalkClosed(stats, makeWalk({ id: 'walk-2' }), 2).stats; // 800 m²

    expect(stats.lifetimeTerritoryAreaM2).toBe(1200);
    expect(stats.totalWalksClosed).toBe(2);
  });
});

describe('recordTreatsEarned', () => {
  it('unlocks first-bakery-batch at exactly 100 lifetime treats', () => {
    let stats = defaultPersonalStatsState();

    const partial = recordTreatsEarned(stats, 60);
    expect(partial.newlyUnlocked).not.toContain('first-bakery-batch');
    stats = partial.stats;

    const rest = recordTreatsEarned(stats, 40);
    expect(rest.newlyUnlocked).toContain('first-bakery-batch');
  });

  it('does not re-trigger an already-crossed threshold', () => {
    let stats = defaultPersonalStatsState();
    stats = recordTreatsEarned(stats, 150).stats;

    const again = recordTreatsEarned(stats, 10);
    expect(again.newlyUnlocked).not.toContain('first-bakery-batch');
  });

  it('ignores non-positive amounts', () => {
    const stats = defaultPersonalStatsState();
    const result = recordTreatsEarned(stats, 0);
    expect(result.stats.totalTreatsEarnedLifetime).toBe(0);
    expect(result.newlyUnlocked).toEqual([]);
  });
});

describe('recordBuildingUpgrade', () => {
  function withLevels(overrides: Partial<DenEconomyState>): DenEconomyState {
    return { ...defaultDenEconomyState(0), ...overrides };
  }

  it('unlocks moving-in on the first upgrade away from all-level-1', () => {
    const stats = defaultPersonalStatsState();
    const before = withLevels({ doghouseLevel: 1, bakeryLevel: 1, sniffGardenLevel: 1 });
    const after = withLevels({ doghouseLevel: 2, bakeryLevel: 1, sniffGardenLevel: 1 });

    const result = recordBuildingUpgrade(stats, before, after);
    expect(result.newlyUnlocked).toContain('moving-in');
  });

  it('does not unlock moving-in again on a later upgrade', () => {
    const stats = defaultPersonalStatsState();
    const before = withLevels({ doghouseLevel: 2, bakeryLevel: 1, sniffGardenLevel: 1 });
    const after = withLevels({ doghouseLevel: 3, bakeryLevel: 1, sniffGardenLevel: 1 });

    const result = recordBuildingUpgrade(stats, before, after);
    expect(result.newlyUnlocked).not.toContain('moving-in');
  });

  it('unlocks handy-homebody when any building reaches level 10', () => {
    const stats = defaultPersonalStatsState();
    const before = withLevels({ doghouseLevel: 9, bakeryLevel: 1, sniffGardenLevel: 1 });
    const after = withLevels({ doghouseLevel: 10, bakeryLevel: 1, sniffGardenLevel: 1 });

    const result = recordBuildingUpgrade(stats, before, after);
    expect(result.newlyUnlocked).toContain('handy-homebody');
  });

  it('unlocks cozy-den only once all three buildings reach level 5 simultaneously', () => {
    const stats = defaultPersonalStatsState();
    const before = withLevels({ doghouseLevel: 5, bakeryLevel: 5, sniffGardenLevel: 4 });
    const after = withLevels({ doghouseLevel: 5, bakeryLevel: 5, sniffGardenLevel: 5 });

    const result = recordBuildingUpgrade(stats, before, after);
    expect(result.newlyUnlocked).toContain('cozy-den');
  });

  it('does not unlock cozy-den if not all three buildings meet the bar', () => {
    const stats = defaultPersonalStatsState();
    const before = withLevels({ doghouseLevel: 4, bakeryLevel: 5, sniffGardenLevel: 5 });
    const after = withLevels({ doghouseLevel: 5, bakeryLevel: 5, sniffGardenLevel: 5 });

    const result = recordBuildingUpgrade(stats, before, after);
    expect(result.newlyUnlocked).toContain('cozy-den');

    const notCozy = recordBuildingUpgrade(
      stats,
      withLevels({ doghouseLevel: 4, bakeryLevel: 5, sniffGardenLevel: 4 }),
      withLevels({ doghouseLevel: 4, bakeryLevel: 5, sniffGardenLevel: 5 })
    );
    expect(notCozy.newlyUnlocked).not.toContain('cozy-den');
  });
});

describe('recordWalkClosed — statistics hygiene', () => {
  const start = DISTANCE_RULE_SINCE_MS + 1_000_000;
  const moving = Array.from({ length: 601 }, (_, i) => ({ latitude: 52.5, longitude: 13.4 + i * 0.00004, timestamp: start + i * 2000, accuracy: 5 })); // 20 min, ~1.6 km
  const last = moving[moving.length - 1];
  const bench = Array.from({ length: 12 * 90 }, (_, i) => ({ latitude: last.latitude + Math.sin(i) * 0.00002, longitude: last.longitude + Math.cos(i) * 0.00002, timestamp: last.timestamp + (i + 1) * 5000, accuracy: 10 })); // 90 min on a bench

  it('does not count the idle tail in the lifetime distance or the longest walk', () => {
    const clean = recordWalkClosed(defaultPersonalStatsState(), makeWalk({ startTime: start, locations: moving }), 30).stats;
    const withTail = recordWalkClosed(defaultPersonalStatsState(), makeWalk({ startTime: start, locations: [...moving, ...bench] }), 30).stats;
    expect(withTail.lifetimeDistanceMeters).toBeLessThan(clean.lifetimeDistanceMeters + 5);
    expect(withTail.longestWalkDistanceM).toBeLessThan(clean.longestWalkDistanceM + 5);
  });

  it('an aborted (too short) walk adds its metres but never sets the longest-walk record', () => {
    const aborted = recordWalkClosed(defaultPersonalStatsState(), makeWalk({ startTime: start, locations: moving.slice(0, 30) }), 30).stats; // 1 min
    expect(aborted.longestWalkDistanceM).toBe(0);
    expect(aborted.lifetimeDistanceMeters).toBeGreaterThan(0);
  });
});

import { Walk } from '../../types';
import { defaultDenEconomyState, DenEconomyState } from '../denEconomy';
import { defaultPersonalStatsState, recordBuildingUpgrade, recordTreatsEarned, recordWalkClosed } from '../personalStats';

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
    territory: { coordinates: [[52.5, 13.4]], area: 100 },
    ...overrides,
  };
}

describe('recordWalkClosed', () => {
  it('unlocks first-steps exactly once, on the first walk only', () => {
    let stats = defaultPersonalStatsState();

    const first = recordWalkClosed(stats, makeWalk());
    expect(first.newlyUnlocked).toContain('first-steps');
    stats = first.stats;

    const second = recordWalkClosed(stats, makeWalk({ id: 'walk-2' }));
    expect(second.newlyUnlocked).not.toContain('first-steps');
  });

  it('unlocks paws-on-the-pavement at exactly 10 walks, not before or after', () => {
    let stats = defaultPersonalStatsState();
    let lastResult: ReturnType<typeof recordWalkClosed> | null = null;

    for (let i = 0; i < 10; i++) {
      lastResult = recordWalkClosed(stats, makeWalk({ id: `walk-${i}` }));
      stats = lastResult.stats;
    }

    expect(lastResult!.newlyUnlocked).toContain('paws-on-the-pavement');

    const eleventh = recordWalkClosed(stats, makeWalk({ id: 'walk-11' }));
    expect(eleventh.newlyUnlocked).not.toContain('paws-on-the-pavement');
  });

  it('unlocks ground-claimed the first time a walk territory reaches 50m2', () => {
    let stats = defaultPersonalStatsState();

    const small = recordWalkClosed(stats, makeWalk({ territory: { coordinates: [], area: 10 } }));
    expect(small.newlyUnlocked).not.toContain('ground-claimed');
    stats = small.stats;

    const big = recordWalkClosed(stats, makeWalk({ id: 'walk-2', territory: { coordinates: [], area: 60 } }));
    expect(big.newlyUnlocked).toContain('ground-claimed');
    stats = big.stats;

    const again = recordWalkClosed(stats, makeWalk({ id: 'walk-3', territory: { coordinates: [], area: 60 } }));
    expect(again.newlyUnlocked).not.toContain('ground-claimed');
  });

  it('unlocks long-way-round the first time a single walk covers 3000m', () => {
    const stats = defaultPersonalStatsState();
    const farWalk = makeWalk({
      locations: [
        { latitude: 52.5, longitude: 13.4, timestamp: 0, accuracy: 5 },
        { latitude: 52.527, longitude: 13.4, timestamp: 1000, accuracy: 5 }, // ~3000m north
      ],
    });

    const result = recordWalkClosed(stats, farWalk);
    expect(result.newlyUnlocked).toContain('long-way-round');
  });

  it('tracks lifetime distance and territory area cumulatively', () => {
    let stats = defaultPersonalStatsState();
    stats = recordWalkClosed(stats, makeWalk({ territory: { coordinates: [], area: 100 } })).stats;
    stats = recordWalkClosed(stats, makeWalk({ id: 'walk-2', territory: { coordinates: [], area: 200 } })).stats;

    expect(stats.lifetimeTerritoryAreaM2).toBe(300);
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

import { Walk } from '../../types';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { BALANCE } from '../balanceConfig';
import { awardWalkRewards } from '../walkRewards';

function makeTrackedWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'tracked-1',
    startTime: 1000,
    closed: true,
    startSource: 'button',
    locations: [
      { latitude: 52.5, longitude: 13.4, timestamp: 1000, accuracy: 5 },
      { latitude: 52.5005, longitude: 13.4005, timestamp: 2000, accuracy: 5 },
    ],
    territory: { coordinates: [[52.5, 13.4], [52.5005, 13.4005], [52.501, 13.401]], area: 500 },
    ...overrides,
  };
}

function makeManualWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: 'manual-1',
    startTime: 1000,
    closed: true,
    startSource: 'manual-log',
    locations: [],
    territory: undefined,
    ...overrides,
  };
}

function makeDeps() {
  return {
    denEconomyRepository: createInMemoryDenEconomyRepository(),
    personalStatsRepository: createInMemoryPersonalStatsRepository(),
  };
}

describe('awardWalkRewards', () => {
  it('awards the flat per-walk treats amount for a tracked walk', async () => {
    const deps = makeDeps();
    const walk = makeTrackedWalk();

    const result = await awardWalkRewards(walk, 500, 500, deps);

    expect(result.celebration.treatsEarned).toBe(BALANCE.treatsPerWalk);
    expect(result.denEconomyState.treats).toBe(BALANCE.startingTreats + BALANCE.treatsPerWalk);
  });

  it('awards the identical flat per-walk treats amount for a manually-logged walk', async () => {
    const deps = makeDeps();
    const walk = makeManualWalk();

    const result = await awardWalkRewards(walk, 0, 0, deps);

    expect(result.celebration.treatsEarned).toBe(BALANCE.treatsPerWalk);
    expect(result.denEconomyState.treats).toBe(BALANCE.startingTreats + BALANCE.treatsPerWalk);
  });

  it('awards the same base XP for a manual-log walk (distance/area terms are zero) as the base component of a tracked walk', async () => {
    const trackedDeps = makeDeps();
    const trackedResult = await awardWalkRewards(makeTrackedWalk(), 0, 0, trackedDeps);

    const manualDeps = makeDeps();
    const manualResult = await awardWalkRewards(makeManualWalk(), 0, 0, manualDeps);

    // Both called with distanceMeters=0, areaM2=0 — should earn identical base XP.
    expect(manualResult.denEconomyState.xp).toBe(trackedResult.denEconomyState.xp);
    expect(manualResult.denEconomyState.xp).toBe(BALANCE.xp.perWalkBase);
  });

  it('gives a manual-log walk more XP when a tracked walk has real distance/area', async () => {
    const deps = makeDeps();
    const trackedResult = await awardWalkRewards(makeTrackedWalk(), 500, 1000, deps);

    expect(trackedResult.denEconomyState.xp).toBeGreaterThan(BALANCE.xp.perWalkBase);
  });

  it('sets celebration.hasTerritory from the walk itself, not from the passed-in areaM2', async () => {
    const trackedDeps = makeDeps();
    const trackedResult = await awardWalkRewards(makeTrackedWalk(), 500, 500, trackedDeps);
    expect(trackedResult.celebration.hasTerritory).toBe(true);
    expect(trackedResult.celebration.areaM2).toBe(500);

    const manualDeps = makeDeps();
    const manualResult = await awardWalkRewards(makeManualWalk(), 0, 0, manualDeps);
    expect(manualResult.celebration.hasTerritory).toBe(false);
    expect(manualResult.celebration.areaM2).toBe(0);
  });

  it('records the walk in personal stats identically for both a tracked and a manual-log walk', async () => {
    const trackedDeps = makeDeps();
    await awardWalkRewards(makeTrackedWalk(), 500, 500, trackedDeps);
    const trackedStats = await trackedDeps.personalStatsRepository.getState();
    expect(trackedStats.totalWalksClosed).toBe(1);

    const manualDeps = makeDeps();
    await awardWalkRewards(makeManualWalk(), 0, 0, manualDeps);
    const manualStats = await manualDeps.personalStatsRepository.getState();
    expect(manualStats.totalWalksClosed).toBe(1);
  });

  it('unlocks the first-walk achievement for a manual-log walk exactly as it would for a tracked walk', async () => {
    const deps = makeDeps();
    const result = await awardWalkRewards(makeManualWalk(), 0, 0, deps);

    expect(result.newlyUnlockedAchievements).toContain('first-steps');
    expect(result.celebration.unlockedAchievements).toContain('first-steps');
  });
});

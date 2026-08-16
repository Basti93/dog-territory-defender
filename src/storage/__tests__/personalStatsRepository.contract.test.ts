import { createInMemoryPersonalStatsRepository } from '../inMemoryPersonalStatsRepository';

describe('PersonalStatsRepository contract', () => {
  it('returns the default state on first read', async () => {
    const repo = createInMemoryPersonalStatsRepository();

    const state = await repo.getState();

    expect(state.totalWalksClosed).toBe(0);
    expect(state.totalTreatsEarnedLifetime).toBe(0);
    expect(state.firstWalkAt).toBeNull();
  });

  it('persists saved state across subsequent reads', async () => {
    const repo = createInMemoryPersonalStatsRepository();
    const state = await repo.getState();

    await repo.saveState({ ...state, totalWalksClosed: 5, lifetimeDistanceMeters: 12345 });
    const reread = await repo.getState();

    expect(reread.totalWalksClosed).toBe(5);
    expect(reread.lifetimeDistanceMeters).toBe(12345);
  });

  it('returns no unlocked achievements initially', async () => {
    const repo = createInMemoryPersonalStatsRepository();

    const unlocked = await repo.getUnlockedAchievements();

    expect(unlocked).toEqual([]);
  });

  it('persists unlocked achievements and returns them ordered by unlock time', async () => {
    const repo = createInMemoryPersonalStatsRepository();

    await repo.unlockAchievements(['moving-in'], 200);
    await repo.unlockAchievements(['first-steps'], 100);

    const unlocked = await repo.getUnlockedAchievements();

    expect(unlocked.map((a) => a.id)).toEqual(['first-steps', 'moving-in']);
  });

  it('does not duplicate an achievement unlocked more than once', async () => {
    const repo = createInMemoryPersonalStatsRepository();

    await repo.unlockAchievements(['first-steps'], 100);
    await repo.unlockAchievements(['first-steps'], 200);

    const unlocked = await repo.getUnlockedAchievements();

    expect(unlocked).toHaveLength(1);
    expect(unlocked[0].unlockedAt).toBe(100);
  });
});

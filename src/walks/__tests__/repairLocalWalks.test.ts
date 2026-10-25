import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { eastwardTrail, manualWalk, trackedWalk } from '../../test/postcardFixtures';
import { repairLocalWalks } from '../repairLocalWalks';
import { WALK_STATS_VERSION } from '../walkRepair';

const T0 = new Date(2026, 9, 20, 8, 0).getTime();

describe('repairLocalWalks', () => {
  it('stamps unanalysed walks, cuts an idle tail in the numbers only, marks a tiny walk, and is idempotent', async () => {
    const repo = createInMemoryWalkRepository();
    const moving = eastwardTrail(T0, 20 * 30 + 1);
    const last = moving[moving.length - 1];
    const bench = Array.from({ length: 12 * 60 }, (_, i) => ({ latitude: last.latitude + Math.sin(i) * 0.00002, longitude: last.longitude, timestamp: last.timestamp + (i + 1) * 5000, accuracy: 10 }));
    await repo.saveWalk(trackedWalk('stuck', { startTime: T0, locations: [...moving, ...bench] }));
    await repo.saveWalk(trackedWalk('tiny', { startTime: T0 + 86400000, locations: eastwardTrail(T0 + 86400000, 20) }));
    await repo.saveWalk(manualWalk('manual', T0));
    await repo.markSynced('stuck', 5);

    const report = await repairLocalWalks(repo);
    expect(report).toEqual({ checked: 3, repaired: 3, trimmed: 1, excluded: 1 });

    const stuck = (await repo.getWalk('stuck'))!;
    expect(stuck.locations).toHaveLength(moving.length + bench.length); // the fixes are never edited
    expect(stuck.syncedAt).toBe(5);
    expect(stuck).toMatchObject({ statsVersion: WALK_STATS_VERSION });
    expect(stuck.statsEndTime!).toBeLessThanOrEqual(last.timestamp);
    expect(stuck.statsExcluded).toBeUndefined();
    expect((await repo.getWalk('tiny'))?.statsExcluded).toBe('too_short');
    expect((await repo.getWalk('manual'))?.statsVersion).toBe(WALK_STATS_VERSION);

    expect(await repairLocalWalks(repo)).toEqual({ checked: 3, repaired: 0, trimmed: 0, excluded: 0 });
  });
});

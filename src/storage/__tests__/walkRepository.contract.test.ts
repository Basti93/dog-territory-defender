import { Walk } from '../../types';
import { createInMemoryWalkRepository } from '../inMemoryWalkRepository';

function makeWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: overrides.id ?? 'walk-1',
    startTime: overrides.startTime ?? 1000,
    locations: overrides.locations ?? [{ latitude: 52.5, longitude: 13.4, timestamp: 1000, accuracy: 5 }],
    closed: overrides.closed ?? false,
    startSource: overrides.startSource ?? 'button',
  };
}

describe('WalkRepository contract', () => {
  it('persists a reward-eligible walk and returns it', async () => {
    const repo = createInMemoryWalkRepository();
    const walk = makeWalk({ closed: true });

    await repo.saveWalk(walk);
    const saved = await repo.getWalk(walk.id);

    expect(saved).not.toBeNull();
    expect(saved?.closed).toBe(true);
  });

  it('persists a walk that did not cover enough ground to qualify for a reward, marked as not closed', async () => {
    const repo = createInMemoryWalkRepository();
    const walk = makeWalk({ closed: false });

    await repo.saveWalk(walk);
    const saved = await repo.getWalk(walk.id);

    expect(saved).not.toBeNull();
    expect(saved?.closed).toBe(false);
  });

  it('never saves a cancelled walk (no saveWalk call means nothing persisted)', async () => {
    const repo = createInMemoryWalkRepository();

    const all = await repo.getWalks();

    expect(all).toEqual([]);
  });

  it('returns all saved walks, newest startTime first', async () => {
    const repo = createInMemoryWalkRepository();
    await repo.saveWalk(makeWalk({ id: 'a', startTime: 1000 }));
    await repo.saveWalk(makeWalk({ id: 'b', startTime: 3000 }));
    await repo.saveWalk(makeWalk({ id: 'c', startTime: 2000 }));

    const all = await repo.getWalks();

    expect(all.map((w) => w.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns null for an unknown walk id', async () => {
    const repo = createInMemoryWalkRepository();

    const result = await repo.getWalk('does-not-exist');

    expect(result).toBeNull();
  });

  it('marks newly saved walks as not yet synced', async () => {
    const repo = createInMemoryWalkRepository();
    await repo.saveWalk(makeWalk());

    const saved = await repo.getWalk('walk-1');

    expect(saved?.syncedAt).toBeNull();
  });

  it('deletes a walk', async () => {
    const repo = createInMemoryWalkRepository();
    await repo.saveWalk(makeWalk());

    await repo.deleteWalk('walk-1');
    const result = await repo.getWalk('walk-1');

    expect(result).toBeNull();
  });

  it('round-trips startSource: button for a live-tracked walk', async () => {
    const repo = createInMemoryWalkRepository();
    await repo.saveWalk(makeWalk({ id: 'tracked', startSource: 'button' }));

    const saved = await repo.getWalk('tracked');

    expect(saved?.startSource).toBe('button');
  });

  it('round-trips startSource: manual-log for a manually-logged walk', async () => {
    const repo = createInMemoryWalkRepository();
    await repo.saveWalk(makeWalk({ id: 'manual', startSource: 'manual-log', locations: [], closed: true }));

    const saved = await repo.getWalk('manual');

    expect(saved?.startSource).toBe('manual-log');
    expect(saved?.locations).toEqual([]);
  });

  // docs/decisions/walk-portrait.md — three new optional fields, additive and
  // backward-compatible (design.md Decisions 4/5/6).
  it('round-trips newGroundCellIds, treatsEarned, and refreshedRouteWalkId when a walk is re-saved with them added', async () => {
    const repo = createInMemoryWalkRepository();
    await repo.saveWalk(makeWalk({ id: 'walk-1' }));

    const original = await repo.getWalk('walk-1');
    await repo.saveWalk({
      ...original!,
      newGroundCellIds: ['1,2', '1,3'],
      treatsEarned: 42,
      refreshedRouteWalkId: 'route-9',
    });

    const saved = await repo.getWalk('walk-1');
    expect(saved?.newGroundCellIds).toEqual(['1,2', '1,3']);
    expect(saved?.treatsEarned).toBe(42);
    expect(saved?.refreshedRouteWalkId).toBe('route-9');
  });

  it('a walk saved without the three new fields round-trips with all three undefined, not throwing', async () => {
    const repo = createInMemoryWalkRepository();
    await repo.saveWalk(makeWalk({ id: 'walk-2' }));

    const saved = await repo.getWalk('walk-2');

    expect(saved?.newGroundCellIds).toBeUndefined();
    expect(saved?.treatsEarned).toBeUndefined();
    expect(saved?.refreshedRouteWalkId).toBeUndefined();
  });

  it('replaceAll swaps the whole set of walks', async () => {
    const repo = createInMemoryWalkRepository();
    await repo.saveWalk(makeWalk({ id: 'old' }));
    await repo.replaceAll([makeWalk({ id: 'a', startTime: 1 }), makeWalk({ id: 'b', startTime: 2 })]);
    expect((await repo.getWalks()).map((w) => w.id)).toEqual(['b', 'a']);
    await repo.replaceAll([]);
    expect(await repo.getWalks()).toEqual([]);
  });

  it('countClosedWalks counts only closed walks', async () => {
    const repo = createInMemoryWalkRepository();
    expect(await repo.countClosedWalks()).toBe(0);
    await repo.saveWalk(makeWalk({ id: 'a', closed: true }));
    await repo.saveWalk(makeWalk({ id: 'b', closed: false }));
    await repo.saveWalk(makeWalk({ id: 'c', closed: true, startSource: 'manual-log', locations: [] }));
    expect(await repo.countClosedWalks()).toBe(2);
    await repo.deleteWalk('a');
    expect(await repo.countClosedWalks()).toBe(1);
  });

  it('getLastWalkEnd is the last fix of the newest walk that has fixes (manual logs have none)', async () => {
    const repo = createInMemoryWalkRepository();
    expect(await repo.getLastWalkEnd()).toBeNull();
    const fix = (latitude: number) => ({ latitude, longitude: 13.4, timestamp: 1, accuracy: 5 });
    await repo.saveWalk(makeWalk({ id: 'old', startTime: 1000, locations: [fix(1), fix(2)] }));
    await repo.saveWalk(makeWalk({ id: 'new', startTime: 3000, locations: [fix(3), fix(4)] }));
    await repo.saveWalk(makeWalk({ id: 'manual', startTime: 5000, startSource: 'manual-log', locations: [] }));
    expect(await repo.getLastWalkEnd()).toEqual({ latitude: 4, longitude: 13.4 });
    await repo.deleteWalk('new');
    expect(await repo.getLastWalkEnd()).toEqual({ latitude: 2, longitude: 13.4 });
    await repo.replaceAll([makeWalk({ id: 'only-manual', startSource: 'manual-log', locations: [] })]);
    expect(await repo.getLastWalkEnd()).toBeNull();
  });

  it('getRecentWalks returns only the newest walks, newest first', async () => {
    const repo = createInMemoryWalkRepository();
    for (const [id, startTime] of [['a', 1000], ['c', 3000], ['b', 2000], ['d', 4000]] as const) await repo.saveWalk(makeWalk({ id, startTime }));
    expect((await repo.getRecentWalks(3)).map((w) => w.id)).toEqual(['d', 'c', 'b']);
    expect((await repo.getRecentWalks(10)).map((w) => w.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(await repo.getRecentWalks(0)).toEqual([]);
  });
});

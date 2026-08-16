import { Walk } from '../../types';
import { createInMemoryWalkRepository } from '../inMemoryWalkRepository';

function makeWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: overrides.id ?? 'walk-1',
    startTime: overrides.startTime ?? 1000,
    locations: overrides.locations ?? [{ latitude: 52.5, longitude: 13.4, timestamp: 1000 }],
    closed: overrides.closed ?? false,
    territory: overrides.territory,
  };
}

describe('WalkRepository contract', () => {
  it('persists a closed walk and returns it', async () => {
    const repo = createInMemoryWalkRepository();
    const walk = makeWalk({ closed: true, territory: { coordinates: [[52.5, 13.4]], area: 100 } });

    await repo.saveWalk(walk);
    const saved = await repo.getWalk(walk.id);

    expect(saved).not.toBeNull();
    expect(saved?.closed).toBe(true);
    expect(saved?.territory).toEqual(walk.territory);
  });

  it('persists an open (ended-early) walk marked as not closed', async () => {
    const repo = createInMemoryWalkRepository();
    const walk = makeWalk({ closed: false });

    await repo.saveWalk(walk);
    const saved = await repo.getWalk(walk.id);

    expect(saved).not.toBeNull();
    expect(saved?.closed).toBe(false);
    expect(saved?.territory).toBeUndefined();
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
});

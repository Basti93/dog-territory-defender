import { createInMemoryActiveWalkRepository } from '../inMemoryActiveWalkRepository';
import type { Location } from '../../types';

const META = { id: 'walk-1', startTime: 1000, startSource: 'button' as const };
const fix = (i: number): Location => ({ latitude: 52 + i * 0.0001, longitude: 13, timestamp: 1000 + i * 1000, accuracy: 5 });

describe('ActiveWalkRepository contract (in-memory fake)', () => {
  it('has no walk until one starts', async () => {
    expect(await createInMemoryActiveWalkRepository().load()).toBeNull();
  });

  it('stores the meta and first point, then appended fixes in order', async () => {
    const repo = createInMemoryActiveWalkRepository();
    await repo.start(META, [fix(0)]);
    await repo.appendFixes('walk-1', [fix(1), fix(2)]);
    await repo.appendFixes('walk-1', [fix(3)]);
    const snapshot = await repo.load();
    expect(snapshot?.meta).toEqual(META);
    expect(snapshot?.locations).toEqual([fix(0), fix(1), fix(2), fix(3)]);
  });

  it('skips fixes that are not newer than the newest stored one (replayed batch, second writer)', async () => {
    const repo = createInMemoryActiveWalkRepository();
    await repo.start(META, [fix(0)]);
    await repo.appendFixes('walk-1', [fix(1), fix(2)]);
    await repo.appendFixes('walk-1', [fix(1), fix(2), fix(3)]);
    expect((await repo.load())?.locations).toHaveLength(4);
  });

  it('ignores fixes for a walk that is not the active one', async () => {
    const repo = createInMemoryActiveWalkRepository();
    await repo.appendFixes('walk-1', [fix(1)]); // nothing active
    expect(await repo.load()).toBeNull();
    await repo.start(META, [fix(0)]);
    await repo.appendFixes('other-walk', [fix(1)]);
    expect((await repo.load())?.locations).toHaveLength(1);
  });

  it('starting a new walk replaces the previous one entirely', async () => {
    const repo = createInMemoryActiveWalkRepository();
    await repo.start(META, [fix(0), fix(1)]);
    await repo.start({ ...META, id: 'walk-2' }, [fix(5)]);
    const snapshot = await repo.load();
    expect(snapshot?.meta.id).toBe('walk-2');
    expect(snapshot?.locations).toEqual([fix(5)]);
  });

  it('clear removes the walk, and a late flush cannot bring it back', async () => {
    const repo = createInMemoryActiveWalkRepository();
    await repo.start(META, [fix(0)]);
    await repo.clear();
    await repo.appendFixes('walk-1', [fix(1)]);
    expect(await repo.load()).toBeNull();
  });

  it('hands out copies, not its own state', async () => {
    const repo = createInMemoryActiveWalkRepository();
    await repo.start(META, [fix(0)]);
    (await repo.load())!.locations.push(fix(9));
    expect((await repo.load())?.locations).toHaveLength(1);
  });
});

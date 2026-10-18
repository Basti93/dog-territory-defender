jest.mock('../../utils/log', () => ({ log: jest.fn() }));

import { createActiveWalkRecorder, FLUSH_EVERY_FIXES, FLUSH_EVERY_MS } from '../activeWalkRecorder';
import { createInMemoryActiveWalkRepository } from '../../storage/inMemoryActiveWalkRepository';
import type { Location, Walk } from '../../types';

const T0 = 1_800_000_000_000;
const fix = (i: number): Location => ({ latitude: 52 + i * 0.0001, longitude: 13, timestamp: T0 + i * 1000, accuracy: 5 });
const walk: Walk = { id: 'w1', startTime: T0, locations: [fix(0)], closed: false, startSource: 'button' };

function setup() {
  const clock = { now: T0 };
  const repo = createInMemoryActiveWalkRepository();
  const recorder = createActiveWalkRecorder({ repo, now: () => clock.now });
  return { clock, repo, recorder };
}
/** Lets the recorder's write queue drain (the GPS path never awaits it), then counts what is stored. */
const stored = async (repo: ReturnType<typeof createInMemoryActiveWalkRepository>) => {
  await new Promise((resolve) => setImmediate(resolve));
  return (await repo.load())?.locations.length ?? 0;
};

describe('activeWalkRecorder', () => {
  it('stores the walk and its first point at begin', async () => {
    const { repo, recorder } = setup();
    await recorder.begin(walk);
    expect(await stored(repo)).toBe(1);
  });

  it('batches: nothing is written before the batch size is reached', async () => {
    const { repo, recorder } = setup();
    await recorder.begin(walk);
    for (let i = 1; i < FLUSH_EVERY_FIXES; i++) recorder.addFix(fix(i));
    expect(await stored(repo)).toBe(1);
  });

  it('flushes on its own at the batch size', async () => {
    const { repo, recorder } = setup();
    await recorder.begin(walk);
    for (let i = 1; i <= FLUSH_EVERY_FIXES; i++) recorder.addFix(fix(i));
    expect(await stored(repo)).toBe(1 + FLUSH_EVERY_FIXES); // no explicit flush; the queue drains by itself
  });

  it('flushes on its own after FLUSH_EVERY_MS even with few fixes', async () => {
    const { clock, repo, recorder } = setup();
    await recorder.begin(walk);
    recorder.addFix(fix(1));
    expect(await stored(repo)).toBe(1);
    clock.now += FLUSH_EVERY_MS;
    recorder.addFix(fix(2));
    expect(await stored(repo)).toBe(3);
  });

  it('flush() writes what is buffered (app going to the background)', async () => {
    const { repo, recorder } = setup();
    await recorder.begin(walk);
    recorder.addFix(fix(1));
    recorder.addFix(fix(2));
    await recorder.flush();
    expect(await stored(repo)).toBe(3);
  });

  it('headless: a fresh runtime that never saw begin() adopts the stored walk from the first fix', async () => {
    const { repo, recorder: first } = setup();
    await first.begin(walk); // the UI session started the walk, then the process died
    const relaunched = createActiveWalkRecorder({ repo });
    relaunched.addFix(fix(1));
    relaunched.addFix(fix(2));
    await relaunched.flush();
    const snapshot = await relaunched.load();
    expect(snapshot?.meta.id).toBe('w1');
    expect(snapshot?.locations).toHaveLength(3);
  });

  it('headless with no active walk records nothing', async () => {
    const { repo } = setup();
    const relaunched = createActiveWalkRecorder({ repo });
    relaunched.addFix(fix(1));
    expect(await relaunched.load()).toBeNull();
  });

  it('load() includes fixes buffered by a runtime that has not resolved the walk yet', async () => {
    const { repo, recorder: first } = setup();
    await first.begin(walk);
    const relaunched = createActiveWalkRecorder({ repo });
    relaunched.addFix(fix(1));
    expect((await relaunched.load())?.locations).toHaveLength(2);
  });

  it('end() clears the walk, and fixes after it are ignored', async () => {
    const { repo, recorder } = setup();
    await recorder.begin(walk);
    recorder.addFix(fix(1));
    await recorder.end();
    recorder.addFix(fix(2));
    await recorder.flush();
    expect(await repo.load()).toBeNull();
  });

  it('a storage failure never throws into the GPS path, and the fixes are retried', async () => {
    const { repo, recorder } = setup();
    await recorder.begin(walk);
    const append = jest.spyOn(repo, 'appendFixes').mockRejectedValueOnce(new Error('disk full'));
    recorder.addFix(fix(1));
    await recorder.flush();
    append.mockRestore();
    recorder.addFix(fix(2));
    await recorder.flush();
    expect(await stored(repo)).toBe(3);
  });
});

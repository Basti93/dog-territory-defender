jest.mock('../../utils/log', () => ({ log: jest.fn() }));
jest.mock('../../utils/gps', () => ({ stopWatchingLocation: jest.fn().mockResolvedValue(undefined) }));

import { restoreActiveWalk, RESTORE_LOAD_TIMEOUT_MS, type RestorableWalkSession } from '../useWalkRestore';
import { createActiveWalkRecorder } from '../activeWalkRecorder';
import { createInMemoryActiveWalkRepository } from '../../storage/inMemoryActiveWalkRepository';
import { RESTORE_MAX_AGE_MS } from '../restoreWalk';
import * as gps from '../../utils/gps';
import { log } from '../../utils/log';
import type { Location } from '../../types';

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const fix = (i: number): Location => ({ latitude: 52 + i * 0.00005, longitude: 13, timestamp: T0 + i * 10_000, accuracy: 5 });
const META = { id: 'w1', startTime: T0, startSource: 'button' as const };

async function setup(opts: { fixes: number; saved?: boolean; busy?: boolean }) {
  const repo = createInMemoryActiveWalkRepository();
  const activeWalk = createActiveWalkRecorder({ repo });
  await repo.start(META, Array.from({ length: opts.fixes }, (_, i) => fix(i)));
  const session = {
    isBusy: jest.fn(() => opts.busy ?? false),
    resumeWalk: jest.fn().mockResolvedValue(true),
    finishRestoredWalk: jest.fn().mockResolvedValue(true),
  } satisfies RestorableWalkSession;
  const openMap = jest.fn();
  const run = (nowOffset: number) =>
    restoreActiveWalk({
      activeWalk,
      isWalkSaved: async () => opts.saved ?? false,
      getAutoFinishEnabled: async () => true,
      session,
      openMap,
      now: () => T0 + nowOffset,
    });
  return { repo, session, openMap, run };
}

beforeEach(() => jest.clearAllMocks());

describe('restoreActiveWalk', () => {
  it('fresh walk: resumes it with all its points and opens the live map', async () => {
    const { session, openMap, run } = await setup({ fixes: 30 });
    expect(await run(30 * 10_000 + MIN)).toBe('resumed');
    expect(session.resumeWalk).toHaveBeenCalledTimes(1);
    const [walk] = session.resumeWalk.mock.calls[0];
    expect(walk).toMatchObject({ id: 'w1', startTime: T0, startSource: 'button', closed: false });
    expect(walk.locations).toHaveLength(30);
    expect(openMap).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('WALK_RESTORED', expect.objectContaining({ points: 30, ageMin: 1 }));
  });

  it('stale walk with points: finishes through the normal path, without opening the map', async () => {
    const { session, openMap, run } = await setup({ fixes: 30 });
    expect(await run(RESTORE_MAX_AGE_MS + 30 * 10_000)).toBe('finished');
    expect(session.finishRestoredWalk).toHaveBeenCalledTimes(1);
    expect(session.finishRestoredWalk.mock.calls[0][1]).toBe('auto-still');
    expect(session.resumeWalk).not.toHaveBeenCalled();
    expect(openMap).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('WALK_RESTORE_FINISHED', expect.objectContaining({ points: 30, reason: 'stale' }));
  });

  it('tiny stale walk: discarded quietly, stored copy gone, orphaned location task stopped', async () => {
    const { repo, session, run } = await setup({ fixes: 1 });
    expect(await run(RESTORE_MAX_AGE_MS + MIN)).toBe('discarded');
    expect(await repo.load()).toBeNull();
    expect(session.resumeWalk).not.toHaveBeenCalled();
    expect(session.finishRestoredWalk).not.toHaveBeenCalled();
    expect(gps.stopWatchingLocation).toHaveBeenCalled();
  });

  it('a walk that was already saved is dropped, never restored twice', async () => {
    const { repo, session, run } = await setup({ fixes: 30, saved: true });
    expect(await run(MIN)).toBe('discarded');
    expect(await repo.load()).toBeNull();
    expect(session.resumeWalk).not.toHaveBeenCalled();
    expect(session.finishRestoredWalk).not.toHaveBeenCalled();
  });

  it('no stored walk: nothing happens except stopping a location task that outlived its walk', async () => {
    const { repo, session, run } = await setup({ fixes: 5 });
    await repo.clear();
    expect(await run(MIN)).toBe('none');
    expect(session.resumeWalk).not.toHaveBeenCalled();
    expect(gps.stopWatchingLocation).toHaveBeenCalled();
  });

  it('a session that is already running a walk is left alone (no duplicate walk)', async () => {
    const { session, openMap, run } = await setup({ fixes: 30, busy: true });
    expect(await run(MIN)).toBe('skipped');
    expect(session.resumeWalk).not.toHaveBeenCalled();
    expect(session.finishRestoredWalk).not.toHaveBeenCalled();
    expect(openMap).not.toHaveBeenCalled();
    expect(gps.stopWatchingLocation).not.toHaveBeenCalled();
  });

  it('double launch: the second restore finds the session busy and does not resume again', async () => {
    const { session, run } = await setup({ fixes: 30 });
    expect(await run(MIN)).toBe('resumed');
    session.isBusy.mockReturnValue(true); // the first restore's walk is now live
    expect(await run(MIN)).toBe('skipped');
    expect(session.resumeWalk).toHaveBeenCalledTimes(1);
  });

  it('a session that refuses (raced by a Start Walk tap) does not open the map', async () => {
    const { session, openMap, run } = await setup({ fixes: 30 });
    session.resumeWalk.mockResolvedValue(false);
    expect(await run(MIN)).toBe('skipped');
    expect(openMap).not.toHaveBeenCalled();
  });

  describe('WALK_RESTORE_CHECK: one line per launch, whatever the outcome', () => {
    const checks = () => (log as jest.Mock).mock.calls.filter(([tag]) => tag === 'WALK_RESTORE_CHECK').map(([, data]) => data);

    it('nothing stored', async () => {
      const { repo, run } = await setup({ fixes: 5 });
      await repo.clear();
      await run(MIN);
      expect(checks()).toEqual([expect.objectContaining({ found: false, points: 0, ageMin: null, decision: 'none' })]);
    });

    it('busy session (the line that was missing when a stored walk vanished)', async () => {
      const { run } = await setup({ fixes: 30, busy: true });
      await run(MIN);
      expect(checks()).toEqual([expect.objectContaining({ found: true, points: 30, ageMin: 0, decision: 'busy' })]);
    });

    it('resume, finish and discard', async () => {
      await (await setup({ fixes: 30 })).run(30 * 10_000 + MIN);
      await (await setup({ fixes: 30 })).run(RESTORE_MAX_AGE_MS + 30 * 10_000);
      await (await setup({ fixes: 1 })).run(RESTORE_MAX_AGE_MS + MIN);
      expect(checks().map((c) => c.decision)).toEqual(['resume', 'finish', 'discard']);
      expect(checks()[0]).toEqual(expect.objectContaining({ found: true, points: 30, ageMin: 1, ms: expect.any(Number) }));
    });
  });

  it('a fresh walk whose fixes simply stopped for an hour is resumed, not discarded', async () => {
    const { session, run } = await setup({ fixes: 3 });
    expect(await run(60 * MIN)).toBe('resumed');
    expect(session.resumeWalk).toHaveBeenCalledTimes(1);
  });
});

describe('restoreActiveWalk with a wedged database', () => {
  afterEach(() => jest.useRealTimers());

  it('a stored-walk read that never answers rejects after the timeout instead of hanging the launch', async () => {
    jest.useFakeTimers();
    const session = { isBusy: jest.fn(() => false), resumeWalk: jest.fn(), finishRestoredWalk: jest.fn() } satisfies RestorableWalkSession;
    const result = restoreActiveWalk({
      activeWalk: { load: () => new Promise(() => undefined) } as never,
      isWalkSaved: async () => false,
      getAutoFinishEnabled: async () => true,
      session,
      openMap: jest.fn(),
    });
    const assertion = expect(result).rejects.toThrow(/timed out/);
    await jest.advanceTimersByTimeAsync(RESTORE_LOAD_TIMEOUT_MS + 1);
    await assertion;
    expect(session.resumeWalk).not.toHaveBeenCalled();
  });
});

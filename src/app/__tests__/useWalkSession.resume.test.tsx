import { act, renderHook } from '@testing-library/react-native';
import { useWalkSession } from '../useWalkSession';
import * as gps from '../../utils/gps';
import { Location, Walk } from '../../types';
import { finishTrackedWalk } from '../finishTrackedWalk';
import { startAutoFinish } from '../autoFinish';
import { createActiveWalkRecorder } from '../activeWalkRecorder';
import { createInMemoryActiveWalkRepository } from '../../storage/inMemoryActiveWalkRepository';

jest.mock('../../utils/gps', () => ({
  getInitialLocation: jest.fn(),
  requestLocationPermission: jest.fn(),
  startWatchingLocation: jest.fn(),
  stopWatchingLocation: jest.fn(),
}));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
}));
jest.mock('../finishTrackedWalk', () => ({ finishTrackedWalk: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../feedback/sounds', () => ({ play: jest.fn() }));
jest.mock('../../notifications/walkReminder', () => ({ checkAndScheduleWalkReminder: jest.fn().mockResolvedValue(undefined) }));

const mocked = gps as jest.Mocked<typeof gps>;
const T0 = Date.now() - 5 * 60_000;
// 33 m and 10 s apart (3.3 m/s): a real walking trail, so a few fixes pass walkHasMovement.
const fix = (i: number): Location => ({ latitude: 52 + i * 0.0003, longitude: 13, timestamp: T0 + 10_000 * i, accuracy: 5 });
const restored = (n: number): Walk => ({
  id: 'w1',
  startTime: T0,
  startSource: 'button',
  closed: false,
  locations: Array.from({ length: n }, (_, i) => fix(i)),
});
const repos = {
  homeRangeRepository: { getCells: jest.fn().mockResolvedValue([]) },
  walkRepository: {},
  notificationRepository: {},
} as never;

beforeEach(() => {
  jest.clearAllMocks();
  mocked.stopWatchingLocation.mockResolvedValue(undefined);
});

async function setup() {
  const repo = createInMemoryActiveWalkRepository();
  const activeWalk = createActiveWalkRecorder({ repo });
  const hook = await renderHook(() => useWalkSession({ repos, dogName: 'Rex', onRangeChanged: jest.fn(), onRewards: jest.fn(), activeWalk }));
  return { repo, activeWalk, ...hook };
}
const autoFinishFor = (w: Walk) => startAutoFinish(w.locations[0], w.startTime, true);

describe('useWalkSession restore', () => {
  it('resumeWalk brings back points, start time and tracking, and keeps appending fixes', async () => {
    let emit: (l: Location) => void = () => undefined;
    mocked.startWatchingLocation.mockImplementation(async (cb) => {
      emit = cb;
      return true;
    });
    const { result } = await setup();
    const walk = restored(5);
    let ok = false;
    await act(async () => {
      ok = await result.current.resumeWalk(walk, autoFinishFor(walk));
    });
    expect(ok).toBe(true);
    expect(result.current.isTracking).toBe(true);
    expect(result.current.walk?.id).toBe('w1');
    expect(result.current.walk?.startTime).toBe(T0);
    expect(result.current.walk?.locations).toHaveLength(5);
    expect(mocked.startWatchingLocation).toHaveBeenCalledTimes(1);
    await act(async () => {
      emit(fix(5));
    });
    expect(result.current.walk?.locations).toHaveLength(6);
  });

  it('merges fixes that were stored while the session was still starting', async () => {
    mocked.startWatchingLocation.mockResolvedValue(true);
    const { result, repo } = await setup();
    const walk = restored(3);
    await repo.start({ id: 'w1', startTime: T0, startSource: 'button' }, [fix(0), fix(1), fix(2), fix(3), fix(4)]);
    await act(async () => {
      await result.current.resumeWalk(walk, autoFinishFor(walk));
    });
    expect(result.current.walk?.locations).toHaveLength(5);
  });

  it('refuses to resume while a walk is already running (no duplicate walk on a double launch)', async () => {
    mocked.startWatchingLocation.mockResolvedValue(true);
    const { result } = await setup();
    const walk = restored(3);
    await act(async () => {
      await result.current.resumeWalk(walk, autoFinishFor(walk));
    });
    let second = true;
    await act(async () => {
      second = await result.current.resumeWalk(restored(9), autoFinishFor(walk));
    });
    expect(second).toBe(false);
    expect(mocked.startWatchingLocation).toHaveBeenCalledTimes(1);
    expect(result.current.walk?.locations).toHaveLength(3);
    expect(result.current.isBusy()).toBe(true);
  });

  it('cancelling a resumed walk clears the stored copy', async () => {
    mocked.startWatchingLocation.mockResolvedValue(true);
    const { result, repo } = await setup();
    const walk = restored(3);
    await repo.start({ id: 'w1', startTime: T0, startSource: 'button' }, walk.locations);
    await act(async () => {
      await result.current.resumeWalk(walk, autoFinishFor(walk));
    });
    await act(async () => {
      await result.current.cancelWalk();
    });
    expect(await repo.load()).toBeNull();
    expect(result.current.isBusy()).toBe(false);
  });

  it('a walk cancelled while it is still starting leaves no stored copy behind (no zombie restore)', async () => {
    mocked.getInitialLocation.mockResolvedValue(fix(0));
    mocked.startWatchingLocation.mockResolvedValue(true);
    const repo = createInMemoryActiveWalkRepository();
    const activeWalk = createActiveWalkRecorder({ repo });
    let cancel: () => Promise<void> = async () => undefined;
    // Cancel lands in startWalk's async gap BEFORE the recorder's begin() runs.
    const startRepos = { ...(repos as object), settingsRepository: { getAutoFinishEnabled: async () => { await cancel(); return true; } } } as never;
    const { result } = await renderHook(() => useWalkSession({ repos: startRepos, dogName: 'Rex', onRangeChanged: jest.fn(), onRewards: jest.fn(), activeWalk }));
    cancel = () => result.current.cancelWalk();
    await act(async () => {
      await result.current.startWalk();
    });
    await act(async () => {
      await activeWalk.flush();
    });
    expect(await repo.load()).toBeNull();
    expect(result.current.isBusy()).toBe(false);
  });

  it('finishing a resumed walk goes through finishTrackedWalk once and clears the stored copy', async () => {
    mocked.startWatchingLocation.mockResolvedValue(true);
    const { result, repo } = await setup();
    const walk = restored(4);
    await repo.start({ id: 'w1', startTime: T0, startSource: 'button' }, walk.locations);
    await act(async () => {
      await result.current.resumeWalk(walk, autoFinishFor(walk));
    });
    await act(async () => {
      await result.current.finishWalk();
    });
    expect(finishTrackedWalk).toHaveBeenCalledTimes(1);
    expect((finishTrackedWalk as jest.Mock).mock.calls[0][0].locations).toHaveLength(4);
    expect(await repo.load()).toBeNull();
  });

  it('finishRestoredWalk finishes once with the stored points, then leaves the session free', async () => {
    const { result, repo } = await setup();
    const walk = restored(6);
    await repo.start({ id: 'w1', startTime: T0, startSource: 'button' }, walk.locations);
    let ok = false;
    await act(async () => {
      ok = await result.current.finishRestoredWalk(walk, 'auto-still');
    });
    expect(ok).toBe(true);
    expect(finishTrackedWalk).toHaveBeenCalledTimes(1);
    expect((finishTrackedWalk as jest.Mock).mock.calls[0][0]).toMatchObject({ id: 'w1', endedBy: 'auto-still' });
    expect(mocked.stopWatchingLocation).toHaveBeenCalled();
    expect(await repo.load()).toBeNull();
    expect(result.current.isBusy()).toBe(false);
    expect(result.current.walk).toBeNull();
  });

  it('finishWalk on a resumed walk that never moved discards it: nothing is handed to finishTrackedWalk, the stored copy goes', async () => {
    mocked.startWatchingLocation.mockResolvedValue(true);
    const { result, repo } = await setup();
    const walk = restored(2); // 33 m: under the movement floor
    await repo.start({ id: 'w1', startTime: T0, startSource: 'button' }, walk.locations);
    await act(async () => {
      await result.current.resumeWalk(walk, autoFinishFor(walk));
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.finishWalk();
    });
    expect(outcome).toBe('discarded');
    expect(finishTrackedWalk).not.toHaveBeenCalled();
    expect(await repo.load()).toBeNull();
    expect(result.current.isBusy()).toBe(false);
  });

  it('startWalk stores the new walk, so a closed app can pick it up', async () => {
    mocked.getInitialLocation.mockResolvedValue(fix(0));
    mocked.startWatchingLocation.mockResolvedValue(true);
    const { result, repo } = await setup();
    await act(async () => {
      await result.current.startWalk();
    });
    const stored = await repo.load();
    expect(stored?.meta.id).toBe(result.current.walk?.id);
    expect(stored?.locations).toHaveLength(1);
  });
});

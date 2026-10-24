import { act, renderHook } from '@testing-library/react-native';
import { useWalkSession } from '../useWalkSession';
import * as gps from '../../utils/gps';
import { Location } from '../../types';
import { finishTrackedWalk } from '../finishTrackedWalk';
import { PRESENCE_BEAT_MS, type PresenceSender } from '../../sync/presenceSender';

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
// 33 m and 10 s apart (3.3 m/s): a real walking trail, so three fixes pass walkHasMovement.
const fix = (i: number): Location => ({ latitude: 52 + i * 0.0003, longitude: 13, timestamp: 10_000 * i, accuracy: 5 });

const repos = {
  homeRangeRepository: { getCells: jest.fn().mockResolvedValue([]) },
  walkRepository: {},
  notificationRepository: {},
} as never;

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getInitialLocation.mockResolvedValue(fix(0));
  mocked.stopWatchingLocation.mockResolvedValue(undefined);
});

function setup(presence?: PresenceSender) {
  return renderHook(() => useWalkSession({ repos, dogName: 'Rex', onRangeChanged: jest.fn(), onRewards: jest.fn(), presence }));
}

describe('useWalkSession GPS fixes', () => {
  it('appends every watcher fix after start', async () => {
    let emit: (l: Location) => void = () => undefined;
    mocked.startWatchingLocation.mockImplementation(async (cb) => {
      emit = cb;
      return true;
    });
    const { result } = await setup();
    await act(async () => {
      await result.current.startWalk();
    });
    expect(result.current.isTracking).toBe(true);
    await act(async () => {
      [1, 2, 3].forEach((i) => emit(fix(i)));
    });
    expect(result.current.walk?.locations.length).toBe(4); // initial + 3
  });

  it('surfaces a watcher that failed to start instead of tracking silently', async () => {
    mocked.startWatchingLocation.mockResolvedValue(false);
    const { result } = await setup();
    await act(async () => {
      await result.current.startWalk();
    });
    expect(result.current.error).toBeTruthy();
  });

  it('finishes with every fix, even through a finishWalk captured at start (no stale closure)', async () => {
    let emit: (l: Location) => void = () => undefined;
    mocked.startWatchingLocation.mockImplementation(async (cb) => {
      emit = cb;
      return true;
    });
    const { result } = await setup();
    await act(async () => {
      await result.current.startWalk();
    });
    const staleFinish = result.current.finishWalk;
    await act(async () => {
      [1, 2, 3].forEach((i) => emit(fix(i)));
    });
    await act(async () => {
      await staleFinish();
    });
    const saved = (finishTrackedWalk as jest.Mock).mock.calls[0][0];
    expect(saved.locations.length).toBe(4);
  });

  it('keeps fixes that arrive while the watcher is still starting', async () => {
    mocked.startWatchingLocation.mockImplementation(async (cb) => {
      cb(fix(1)); // fix delivered before startWatchingLocation resolves
      return true;
    });
    const { result } = await setup();
    await act(async () => {
      await result.current.startWalk();
    });
    expect(result.current.walk?.locations.length).toBe(2);
  });

  it('starts the location task before the initial fix resolves (foreground service while the app is in front)', async () => {
    const order: string[] = [];
    mocked.startWatchingLocation.mockImplementation(async () => {
      order.push('task');
      return true;
    });
    mocked.getInitialLocation.mockImplementation(async () => {
      order.push('fix');
      return fix(0);
    });
    const { result } = await setup();
    await act(async () => {
      await result.current.startWalk();
    });
    expect(order).toEqual(['task', 'fix']);
  });

  it('drops buffered fixes older than the initial fix and stops the task when no start position comes', async () => {
    let emit: (l: Location) => void = () => undefined;
    mocked.startWatchingLocation.mockImplementation(async (cb) => {
      emit = cb;
      return true;
    });
    mocked.getInitialLocation.mockImplementation(async () => {
      emit({ ...fix(0), timestamp: -5 }); // older than the start point
      return fix(0);
    });
    const { result } = await setup();
    await act(async () => {
      await result.current.startWalk();
    });
    expect(result.current.walk?.locations.length).toBe(1);

    mocked.getInitialLocation.mockResolvedValue(null);
    mocked.requestLocationPermission.mockResolvedValue(false);
    const second = await setup();
    await act(async () => {
      await second.result.current.startWalk();
    });
    expect(mocked.stopWatchingLocation).toHaveBeenCalled();
    expect(second.result.current.isTracking).toBe(false);
  });
});

describe('useWalkSession start ownership and early fixes', () => {
  it('persists fixes that arrived before the walk row existed, after clearing any old stored walk', async () => {
    const calls: string[] = [];
    const activeWalk = {
      begin: jest.fn(async () => void calls.push('begin')),
      addFix: jest.fn(() => void calls.push('addFix')),
      end: jest.fn(async () => void calls.push('end')),
      load: jest.fn().mockResolvedValue(null),
      flush: jest.fn(),
    };
    mocked.startWatchingLocation.mockImplementation(async (cb) => {
      calls.push('task');
      cb(fix(1));
      return true;
    });
    const hook = await renderHook(() =>
      useWalkSession({ repos, dogName: 'Rex', onRangeChanged: jest.fn(), onRewards: jest.fn(), activeWalk: activeWalk as never })
    );
    await act(async () => {
      await hook.result.current.startWalk();
    });
    expect(calls.indexOf('end')).toBeLessThan(calls.indexOf('task'));
    expect(calls.indexOf('begin')).toBeLessThan(calls.indexOf('addFix'));
    expect(activeWalk.addFix).toHaveBeenCalledWith(fix(1));
  });

  it('a cancelled start does not stop or restart the task a newer start owns', async () => {
    mocked.startWatchingLocation.mockResolvedValue(true);
    let releaseFirst: (l: Location | null) => void = () => undefined;
    mocked.getInitialLocation
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockResolvedValue(fix(0));
    const { result } = await setup();
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.startWalk();
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.cancelWalk();
      await result.current.startWalk();
    });
    const stops = mocked.stopWatchingLocation.mock.calls.length;
    const starts = mocked.startWatchingLocation.mock.calls.length;
    await act(async () => {
      releaseFirst(null); // the old start finds no position; it must not retry or stop the new start's task
      await first;
    });
    expect(mocked.stopWatchingLocation.mock.calls.length).toBe(stops);
    expect(mocked.startWatchingLocation.mock.calls.length).toBe(starts);
    expect(result.current.isTracking).toBe(true);
  });
});

describe('useWalkSession auto-finish', () => {
  it('finishes with endedBy auto-home when the home dwell elapses on a timer tick', async () => {
    jest.useFakeTimers();
    try {
      let emit: (l: Location) => void = () => undefined;
      mocked.startWatchingLocation.mockImplementation(async (cb) => {
        emit = cb;
        return true;
      });
      mocked.getInitialLocation.mockResolvedValue({ latitude: 52, longitude: 13, timestamp: 1, accuracy: 5 });
      const { result } = await setup();
      await act(async () => {
        await result.current.startWalk();
      });
      const far = (t: number): Location => ({ latitude: 52.004, longitude: 13, timestamp: t, accuracy: 5 });
      const home = (t: number): Location => ({ latitude: 52.00005, longitude: 13, timestamp: t, accuracy: 5 });
      await act(async () => {
        jest.advanceTimersByTime(5 * 60 * 1000);
        // A real outbound trail (33 m every 10 s), or the walk would count as "no movement" and be discarded.
        for (let i = 1; i <= 8; i++) emit({ latitude: 52 + i * 0.0003, longitude: 13, timestamp: 1 + i * 10_000, accuracy: 5 });
        emit(far(2));
        jest.advanceTimersByTime(6 * 60 * 1000);
        emit(home(3));
        jest.advanceTimersByTime(4 * 60 * 1000);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(finishTrackedWalk).toHaveBeenCalledTimes(1);
      expect((finishTrackedWalk as jest.Mock).mock.calls[0][0].endedBy).toBe('auto-home');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useWalkSession live presence', () => {
  const fakePresence = () => ({ start: jest.fn(), addFix: jest.fn(), optInChanged: jest.fn(), tick: jest.fn(), end: jest.fn().mockResolvedValue(undefined) }) satisfies PresenceSender;
  const startWith = async (presence: PresenceSender) => {
    let emit: (l: Location) => void = () => undefined;
    mocked.startWatchingLocation.mockImplementation(async (cb) => {
      emit = cb;
      return true;
    });
    const hook = await setup(presence);
    await act(async () => {
      await hook.result.current.startWalk();
    });
    return { hook, emit: (l: Location) => emit(l) };
  };

  it('starts the heartbeats with the walk, ticks on every fix, and closes them on finish', async () => {
    const presence = fakePresence();
    const { hook, emit } = await startWith(presence);
    expect(presence.start).toHaveBeenCalledTimes(1);
    const started = presence.start.mock.calls[0][0];
    expect(started.locations).toHaveLength(1);
    await act(async () => {
      [1, 2].forEach((i) => emit(fix(i)));
    });
    expect(presence.tick).toHaveBeenCalledTimes(2);
    expect(presence.tick.mock.calls[1][0].locations).toHaveLength(3); // the full, current walk (not a stale one)
    await act(async () => {
      await hook.result.current.finishWalk();
    });
    expect(presence.end).toHaveBeenCalledTimes(1);
    expect(presence.end.mock.calls[0][0].id).toBe(started.id);
    expect(presence.end.mock.calls[0][0].locations).toHaveLength(3);
  });

  it('also ticks on a timer, so a phone that stands still keeps its sign up', async () => {
    jest.useFakeTimers();
    try {
      const presence = fakePresence();
      await startWith(presence);
      presence.tick.mockClear();
      await act(async () => {
        jest.advanceTimersByTime(PRESENCE_BEAT_MS * 2 + 10);
      });
      expect(presence.tick).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('closes the heartbeats when the walk is cancelled, and a second cancel (New Walk) closes nothing twice', async () => {
    const presence = fakePresence();
    const { hook } = await startWith(presence);
    await act(async () => {
      await hook.result.current.cancelWalk();
    });
    expect(presence.end).toHaveBeenCalledTimes(1);
  });

  it('closes them even when saving the finished walk fails', async () => {
    const presence = fakePresence();
    const { hook } = await startWith(presence);
    (finishTrackedWalk as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await act(async () => {
      await hook.result.current.finishWalk().catch(() => undefined);
    });
    expect(presence.end).toHaveBeenCalledTimes(1);
  });

  it('works unchanged without a presence sender', async () => {
    let emit: (l: Location) => void = () => undefined;
    mocked.startWatchingLocation.mockImplementation(async (cb) => {
      emit = cb;
      return true;
    });
    const hook = await setup();
    await act(async () => {
      await hook.result.current.startWalk();
    });
    await act(async () => emit(fix(1)));
    expect(hook.result.current.walk?.locations).toHaveLength(2);
  });
});

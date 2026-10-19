// A tracked walk that went nowhere leaves no record: the REAL finishTrackedWalk is wired in here (the other
// useWalkSession tests mock it), so "nothing saved, nothing uploaded, no homecoming" is checked end to end.
import { act, renderHook } from '@testing-library/react-native';
import { useWalkSession } from '../useWalkSession';
import * as gps from '../../utils/gps';
import { Location } from '../../types';
import { createActiveWalkRecorder } from '../activeWalkRecorder';
import { createInMemoryActiveWalkRepository } from '../../storage/inMemoryActiveWalkRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryTerritoryRepository } from '../../storage/inMemoryTerritoryRepository';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { createInMemoryNotificationRepository } from '../../storage/inMemoryNotificationRepository';
import { createInMemorySettingsRepository } from '../../storage/inMemorySettingsRepository';
import type { PresenceSender } from '../../sync/presenceSender';

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
jest.mock('../../feedback/sounds', () => ({ play: jest.fn() }));
jest.mock('../../notifications/walkReminder', () => ({ checkAndScheduleWalkReminder: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/streetLookup', () => ({ resolveTerritoryName: jest.fn().mockResolvedValue('Testgasse') }));
jest.mock('../../utils/logShipper', () => ({ shipLog: jest.fn(), flushLogShipper: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../autoFinishNotify', () => ({ notifyAutoFinishedIfBackgrounded: jest.fn().mockResolvedValue(undefined) }));

const mocked = gps as jest.Mocked<typeof gps>;
const START = Date.now() - 10 * 60_000;
const fixAt = (metres: number, i: number): Location => ({ latitude: 52 + metres / 111320, longitude: 13, timestamp: START + i * 10_000, accuracy: 5 });

async function setup() {
  const repos = {
    walkRepository: createInMemoryWalkRepository(),
    homeRangeRepository: createInMemoryHomeRangeRepository(),
    territoryRepository: createInMemoryTerritoryRepository(),
    denEconomyRepository: createInMemoryDenEconomyRepository(),
    personalStatsRepository: createInMemoryPersonalStatsRepository(),
    notificationRepository: createInMemoryNotificationRepository(),
    settingsRepository: createInMemorySettingsRepository(),
  };
  const sync = { enqueueWalk: jest.fn().mockResolvedValue(undefined) };
  const presence = { start: jest.fn(), addFix: jest.fn(), optInChanged: jest.fn(), tick: jest.fn(), end: jest.fn().mockResolvedValue(undefined) } satisfies PresenceSender;
  const activeWalkRepo = createInMemoryActiveWalkRepository();
  const activeWalk = createActiveWalkRecorder({ repo: activeWalkRepo });
  const onRewards = jest.fn();
  let emit: (l: Location) => void = () => undefined;
  mocked.startWatchingLocation.mockImplementation(async (cb) => {
    emit = cb;
    return true;
  });
  const hook = await renderHook(() =>
    useWalkSession({ repos: repos as never, dogName: 'Rex', onRangeChanged: jest.fn(), onRewards, sync, presence, activeWalk })
  );
  await act(async () => {
    await hook.result.current.startWalk();
  });
  return { ...hook, repos, sync, presence, activeWalkRepo, onRewards, emit: (l: Location) => emit(l) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getInitialLocation.mockResolvedValue(fixAt(0, 0));
  mocked.stopWatchingLocation.mockResolvedValue(undefined);
});

describe('finishing a tracked walk without movement', () => {
  it('saves nothing, uploads nothing, plays no homecoming, and stops everything like a cancel', async () => {
    const { result, repos, sync, presence, activeWalkRepo, onRewards, emit } = await setup();
    await act(async () => {
      emit(fixAt(6, 1)); // a few metres of GPS jitter
      emit(fixAt(9, 2));
    });
    expect(result.current.currentWalkHasMovement()).toBe(false);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.finishWalk();
    });
    expect(outcome).toBe('discarded');
    expect(await repos.walkRepository.getWalks()).toEqual([]);
    expect(await repos.homeRangeRepository.getCells()).toEqual([]);
    expect((await repos.personalStatsRepository.getState()).totalWalksClosed).toBe(0);
    expect(sync.enqueueWalk).not.toHaveBeenCalled();
    expect(onRewards).not.toHaveBeenCalled();
    expect(mocked.stopWatchingLocation).toHaveBeenCalled();
    expect(presence.end).toHaveBeenCalledTimes(1);
    expect(await activeWalkRepo.load()).toBeNull();
    expect(result.current.isTracking).toBe(false);
    expect(result.current.walk).toBeNull();
    expect(result.current.isBusy()).toBe(false);
  });

  it('GPS jitter around one spot (summing to well over 50 m) is discarded too', async () => {
    const { result, repos, sync, emit } = await setup();
    await act(async () => {
      for (let i = 1; i <= 60; i++) {
        const angle = i * 2.4;
        emit({ latitude: 52 + (15 * Math.sin(angle)) / 111320, longitude: 13 + (15 * Math.cos(angle)) / 68500, timestamp: START + i * 10_000, accuracy: 5 });
      }
    });
    expect(result.current.currentWalkHasMovement()).toBe(false);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.finishWalk();
    });
    expect(outcome).toBe('discarded');
    expect(await repos.walkRepository.getWalks()).toEqual([]);
    expect(sync.enqueueWalk).not.toHaveBeenCalled();
  });

  it('a walk that moved is still saved and uploaded (the rule only drops walks that went nowhere)', async () => {
    const { result, repos, sync, emit } = await setup();
    await act(async () => {
      for (let i = 1; i <= 12; i++) emit(fixAt(i * 20, i)); // 240 m
    });
    expect(result.current.currentWalkHasMovement()).toBe(true);
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.finishWalk();
    });
    expect(outcome).toBe('saved');
    expect(await repos.walkRepository.getWalks()).toHaveLength(1);
    expect(sync.enqueueWalk).toHaveBeenCalledTimes(1);
  });

  it('the session is free for a new walk right after a discard', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.finishWalk();
    });
    await act(async () => {
      await result.current.startWalk();
    });
    expect(result.current.isTracking).toBe(true);
  });

  it('cancel keeps rewards, stats and walk count untouched and clears the stored walk', async () => {
    const { result, repos, presence, activeWalkRepo, emit } = await setup();
    await act(async () => {
      for (let i = 1; i <= 12; i++) emit(fixAt(i * 20, i));
    });
    await act(async () => {
      await result.current.cancelWalk();
    });
    expect(await repos.walkRepository.getWalks()).toEqual([]);
    expect((await repos.personalStatsRepository.getState()).totalWalksClosed).toBe(0);
    expect(mocked.stopWatchingLocation).toHaveBeenCalled();
    expect(presence.end).toHaveBeenCalledTimes(1);
    expect(await activeWalkRepo.load()).toBeNull();
    expect(result.current.isTracking).toBe(false);
  });
});

describe('finish in flight', () => {
  it('reports isFinishing while the finish runs and not before or after (a cancel must not race it)', async () => {
    const { result, emit } = await setup();
    await act(async () => {
      for (let i = 1; i <= 12; i++) emit(fixAt(i * 20, i));
    });
    expect(result.current.isFinishing()).toBe(false);
    let release: () => void = () => undefined;
    mocked.stopWatchingLocation.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    let pending: Promise<string> | undefined;
    await act(async () => {
      pending = result.current.finishWalk();
    });
    expect(result.current.isFinishing()).toBe(true);
    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.isFinishing()).toBe(false);
  });
});

describe('the automatic ends apply the same rule', () => {
  it('auto-finish (fixes kept arriving within 25 m for 20 minutes, never moved) discards quietly', async () => {
    jest.useFakeTimers();
    try {
      const { result, repos, sync, onRewards, emit } = await setup();
      for (let minute = 1; minute <= 21; minute++) {
        await act(async () => {
          emit(fixAt(minute % 2 === 0 ? 4 : 2, minute * 6));
          jest.advanceTimersByTime(60 * 1000);
        });
      }
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.isTracking).toBe(false);
      expect(await repos.walkRepository.getWalks()).toEqual([]);
      expect(sync.enqueueWalk).not.toHaveBeenCalled();
      expect(onRewards).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a GPS gap (no fixes at all) never auto-finishes the walk as "still": it runs on and says so', async () => {
    jest.useFakeTimers();
    try {
      const { result, emit } = await setup();
      await act(async () => {
        emit(fixAt(100, 1));
        jest.advanceTimersByTime(45 * 60 * 1000); // silence: frozen app, battery saver
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.isTracking).toBe(true);
      expect(result.current.gpsGapNote).toBe(true);
      // The first fix after the gap is not "still" either: the still clock restarts there.
      await act(async () => {
        emit(fixAt(101, 2));
        jest.advanceTimersByTime(60 * 1000);
      });
      expect(result.current.isTracking).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the cold-start finish path (finishRestoredWalk) discards a walk without movement', async () => {
    const { result, repos, sync } = await (async () => {
      mocked.startWatchingLocation.mockResolvedValue(true);
      const base = await setup();
      await act(async () => {
        await base.result.current.cancelWalk(); // free session, as at a cold start
      });
      return base;
    })();
    const walk = { id: 'old', startTime: START, startSource: 'button' as const, closed: false, locations: [fixAt(0, 0), fixAt(5, 1)] };
    let ok = false;
    await act(async () => {
      ok = await result.current.finishRestoredWalk(walk, 'auto-still');
    });
    expect(ok).toBe(true);
    expect(await repos.walkRepository.getWalks()).toEqual([]);
    expect(sync.enqueueWalk).not.toHaveBeenCalled();
    expect(result.current.isBusy()).toBe(false);
  });
});

import { act, renderHook } from '@testing-library/react-native';
import { useWalkSession } from '../useWalkSession';
import * as gps from '../../utils/gps';
import { Location } from '../../types';
import { finishTrackedWalk } from '../finishTrackedWalk';

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
const fix = (i: number): Location => ({ latitude: 52 + i * 0.0001, longitude: 13, timestamp: 1000 * i, accuracy: 5 });

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

function setup() {
  return renderHook(() => useWalkSession({ repos, dogName: 'Rex', onRangeChanged: jest.fn(), onRewards: jest.fn() }));
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
});

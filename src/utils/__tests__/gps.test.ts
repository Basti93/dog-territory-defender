import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';

import { describeError, getInitialLocation, startWatchingLocation, stopWatchingLocation } from '../gps';
import { scheduleInfoNotification } from '../../notifications/scheduler';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Highest: 5 },
  ActivityType: { Fitness: 3 },
  startLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn().mockResolvedValue(true),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn().mockResolvedValue(false) }));
jest.mock('../../notifications/scheduler', () => ({ scheduleInfoNotification: jest.fn().mockResolvedValue(true) }));
jest.mock('../log', () => ({ log: jest.fn() }));

const location = Location as jest.Mocked<typeof Location>;
const BACKGROUND_ERROR = new Error('Foreground service cannot be started when the application is in the background');

describe('describeError', () => {
  it('never produces [object Object]', () => {
    expect(describeError(new Error('boom'))).toBe('Error: boom');
    expect(describeError({ code: 'E_TASK', message: 'task failed' })).toBe('[E_TASK] task failed');
    expect(describeError({ foo: 1 })).toBe('{"foo":1}');
    expect(describeError('plain')).toBe('plain');
  });
});

describe('a walk started while the app is in the background (Android)', () => {
  let listener: ((state: string) => void) | null = null;
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    (AppState as { currentState: string }).currentState = 'background';
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
      listener = cb;
      return { remove: () => undefined };
    }) as never);
  });
  afterEach(async () => {
    await stopWatchingLocation();
    jest.restoreAllMocks();
  });

  it('keeps the walk, asks calmly to open the app, and starts the task once the app is in front', async () => {
    // Safety net: the app was in front when the call began but is gone when Android answers.
    (AppState as { currentState: string }).currentState = 'active';
    location.startLocationUpdatesAsync.mockImplementationOnce(async () => {
      (AppState as { currentState: string }).currentState = 'background';
      throw BACKGROUND_ERROR;
    });
    expect(await startWatchingLocation(jest.fn())).toBe(true);
    expect(scheduleInfoNotification).toHaveBeenCalledTimes(1);
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);

    location.startLocationUpdatesAsync.mockResolvedValueOnce(undefined);
    (AppState as { currentState: string }).currentState = 'active';
    listener?.('active');
    await new Promise((r) => setTimeout(r, 0));
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(2);
  });

  it('goes straight to the deferred start without calling the doomed foreground-service start', async () => {
    expect(await startWatchingLocation(jest.fn())).toBe(true);
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(scheduleInfoNotification).toHaveBeenCalledTimes(1);

    location.startLocationUpdatesAsync.mockResolvedValueOnce(undefined);
    (AppState as { currentState: string }).currentState = 'active';
    listener?.('active');
    await new Promise((r) => setTimeout(r, 0));
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
  });

  it('resuming with the task still running only re-attaches the callback, also from the background', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(true);
    expect(await startWatchingLocation(jest.fn(), { resume: true })).toBe(true);
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(scheduleInfoNotification).not.toHaveBeenCalled();
  });

  it('resuming in front with the task running restarts it, to bring the foreground service back', async () => {
    (AppState as { currentState: string }).currentState = 'active';
    location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(true);
    location.startLocationUpdatesAsync.mockResolvedValueOnce(undefined);
    expect(await startWatchingLocation(jest.fn(), { resume: true })).toBe(true);
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
  });

  it('resuming from the background with the task running restarts the service once in front, without a note', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(true);
    await startWatchingLocation(jest.fn(), { resume: true });
    location.startLocationUpdatesAsync.mockResolvedValueOnce(undefined);
    (AppState as { currentState: string }).currentState = 'active';
    listener?.('active');
    await new Promise((r) => setTimeout(r, 0));
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    expect(scheduleInfoNotification).not.toHaveBeenCalled();
  });

  it('resuming without a running task in the foreground starts it', async () => {
    (AppState as { currentState: string }).currentState = 'active';
    location.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(false);
    location.startLocationUpdatesAsync.mockResolvedValueOnce(undefined);
    expect(await startWatchingLocation(jest.fn(), { resume: true })).toBe(true);
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
  });

  it('still reports other start failures as failures', async () => {
    (AppState as { currentState: string }).currentState = 'active';
    location.startLocationUpdatesAsync.mockRejectedValueOnce(new Error('permission denied'));
    location.watchPositionAsync.mockRejectedValueOnce(new Error('nope'));
    expect(await startWatchingLocation(jest.fn())).toBe(false);
  });
});

describe('getInitialLocation', () => {
  const position = (ageMs: number) => ({ coords: { latitude: 1, longitude: 2, accuracy: 8 }, timestamp: Date.now() - ageMs });

  it('asks again when the OS hands out a cached position', async () => {
    location.getCurrentPositionAsync.mockResolvedValueOnce(position(120_000) as never).mockResolvedValueOnce(position(500) as never);
    const fix = await getInitialLocation();
    expect(location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
    expect(Date.now() - (fix?.timestamp ?? 0)).toBeLessThan(5_000);
  });
});

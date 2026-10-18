// The location task is where live sharing is fed from: it keeps running with the screen off (iOS "Always" / Android
// foreground service), so beats must be driven from it and not from React.
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  ActivityType: { Fitness: 3 },
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn(async () => true) }));
jest.mock('../log', () => ({ log: jest.fn() }));

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import type { ApiClient } from '../../sync/apiClient';
import type { PresenceUpdateRequest } from '../../sync/apiContract';
import { createPresenceSender } from '../../sync/presenceSender';
import { IDENTITY } from '../../test/syncHelpers';
import { setFixObserver, startWatchingLocation, stopWatchingLocation } from '../gps';

type TaskExecutor = (body: { data: unknown; error: unknown }) => Promise<void>;
const runTask: TaskExecutor = (TaskManager.defineTask as jest.Mock).mock.calls[0][1];

const T0 = 1_800_000_000_000;
const position = (second: number, accuracy = 5) => ({
  coords: { latitude: 52 + second * 0.00005, longitude: 13, accuracy },
  timestamp: T0 + second * 1000,
});
const payload = (...seconds: number[]) => ({ data: { locations: seconds.map((s) => position(s)) }, error: null });
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function setup(enabled = true) {
  const sent: PresenceUpdateRequest[] = [];
  const sender = createPresenceSender({
    getIdentity: async () => IDENTITY,
    isEnabled: async () => enabled,
    isBackground: () => true,
    createClient: () =>
      ({
        sendPresence: async (r: PresenceUpdateRequest) => {
          sent.push(r);
          return { ok: true as const };
        },
      }) as unknown as ApiClient,
  });
  setFixObserver((l) => sender.addFix(l));
  sender.start({ id: 'walk-1', startTime: T0, locations: [{ latitude: 52, longitude: 13, timestamp: T0, accuracy: 5 }] });
  return { sent, sender };
}

describe('location task feeding live sharing', () => {
  beforeEach(async () => {
    jest.useFakeTimers({ now: T0 });
    await startWatchingLocation(() => undefined); // resets gps.ts's duplicate-timestamp memory between tests
  });
  afterEach(async () => {
    setFixObserver(null);
    await stopWatchingLocation();
    jest.useRealTimers();
  });

  it('beats at most every 30 s from task batches alone (no walk session, JS in the background)', async () => {
    const { sent } = setup();
    await settle();
    expect(sent).toHaveLength(1); // the first beat at start

    // A batch of fixes arrives every ~10 s while the screen is off.
    for (const batch of [[10], [20], [29]]) {
      jest.setSystemTime(T0 + batch[0] * 1000);
      await runTask(payload(...batch));
    }
    await settle();
    expect(sent).toHaveLength(1);

    jest.setSystemTime(T0 + 31_000);
    await runTask(payload(30, 31)); // iOS delivers fixes in batches
    await settle();
    expect(sent).toHaveLength(2);
    expect(sent[1].points.map((p) => p.t)).toEqual([10, 20, 29, 30, 31].map((s) => T0 + s * 1000));

    jest.setSystemTime(T0 + 40_000);
    await runTask(payload(40));
    await settle();
    expect(sent).toHaveLength(2); // 9 s after the last beat

    jest.setSystemTime(T0 + 62_000);
    await runTask(payload(62));
    await settle();
    expect(sent).toHaveLength(3);
  });

  it('hands out whole-millisecond timestamps (iOS reports fractions) and drops a fix under 1 ms after the last', async () => {
    const seen: number[] = [];
    await startWatchingLocation((l) => seen.push(l.timestamp));
    const fix = (timestamp: number) => ({ coords: { latitude: 52, longitude: 13, accuracy: 5 }, timestamp });
    await runTask({ data: { locations: [fix(T0 + 0.5527), fix(T0 + 1000.2), fix(T0 + 1000.4), fix(T0 + 2000.5)] }, error: null });
    expect(seen).toEqual([T0 + 1, T0 + 1000, T0 + 2001]); // the third fix rounds to the second's ms: duplicate
  });

  it('sends nothing from the task path while live sharing is off', async () => {
    const { sent } = setup(false);
    await settle();
    jest.setSystemTime(T0 + 45_000);
    await runTask(payload(10, 45));
    await settle();
    expect(sent).toHaveLength(0);
  });

  it('inaccurate fixes never reach the sender', async () => {
    const { sent } = setup();
    await settle();
    jest.setSystemTime(T0 + 31_000);
    await runTask({ data: { locations: [position(31, 80)] }, error: null });
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('a task error is logged and changes nothing', async () => {
    const { sent } = setup();
    await settle();
    await runTask({ data: null, error: new Error('boom') });
    expect(sent).toHaveLength(1);
  });

  it('asks iOS for a walk-grade background session: Fitness, never auto-paused, blue pill on', async () => {
    await startWatchingLocation(() => undefined);
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      'dog-territory-location-task',
      expect.objectContaining({ activityType: 3, pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true, foregroundService: expect.any(Object) })
    );
  });
});

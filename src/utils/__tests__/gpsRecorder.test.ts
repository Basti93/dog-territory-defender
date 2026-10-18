// The headless path: the location task delivers fixes with no UI at all (app swiped away, runtime relaunched by the
// OS). They must still reach the durable walk copy, so the next app launch can resume the walk.
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  ActivityType: { Fitness: 3 },
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn(async () => true) }));
jest.mock('../log', () => ({ log: jest.fn() }));

import * as TaskManager from 'expo-task-manager';

import { createActiveWalkRecorder } from '../../app/activeWalkRecorder';
import { createInMemoryActiveWalkRepository } from '../../storage/inMemoryActiveWalkRepository';
import { setFixRecorder, startWatchingLocation, stopWatchingLocation } from '../gps';

type TaskExecutor = (body: { data: unknown; error: unknown }) => Promise<void>;
const runTask: TaskExecutor = (TaskManager.defineTask as jest.Mock).mock.calls[0][1];

const T0 = 1_800_000_000_000;
const position = (second: number, accuracy = 5) => ({
  coords: { latitude: 52 + second * 0.00005, longitude: 13, accuracy },
  timestamp: T0 + second * 1000,
});
const payload = (...seconds: number[]) => ({ data: { locations: seconds.map((s) => position(s)) }, error: null });

describe('location task feeding the durable walk copy', () => {
  afterEach(async () => {
    setFixRecorder(null);
    await stopWatchingLocation();
  });

  it('records accepted fixes in a runtime that has no walk session (nothing subscribed), badly-accurate ones are dropped', async () => {
    const repo = createInMemoryActiveWalkRepository();
    await repo.start({ id: 'w1', startTime: T0, startSource: 'button' }, [{ latitude: 52, longitude: 13, timestamp: T0, accuracy: 5 }]);
    // A relaunched runtime: a new recorder that never saw begin(), wired the way activeWalkRuntime.ts wires it.
    const recorder = createActiveWalkRecorder({ repo });
    setFixRecorder((l) => recorder.addFix(l));

    await runTask(payload(1, 2, 3));
    await runTask({ data: { locations: [position(4, 80)] }, error: null }); // too inaccurate
    await runTask(payload(5));

    const snapshot = await recorder.load();
    expect(snapshot?.locations.map((l) => l.timestamp)).toEqual([T0, T0 + 1000, T0 + 2000, T0 + 3000, T0 + 5000]);
  });

  it('does not feed the same fix twice when the foreground fallback and the task both deliver it', async () => {
    const repo = createInMemoryActiveWalkRepository();
    await repo.start({ id: 'w1', startTime: T0, startSource: 'button' }, [{ latitude: 52, longitude: 13, timestamp: T0, accuracy: 5 }]);
    const recorder = createActiveWalkRecorder({ repo });
    setFixRecorder((l) => recorder.addFix(l));
    await startWatchingLocation(() => undefined);

    await runTask(payload(1));
    await runTask(payload(1));

    expect((await recorder.load())?.locations).toHaveLength(2);
  });
});

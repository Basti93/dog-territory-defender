jest.mock('../../utils/log', () => ({ log: jest.fn() }));

import { GPS_GAP_MAX_MS } from '../autoFinish';
import { createActiveWalkRecorder } from '../activeWalkRecorder';
import { createInMemoryActiveWalkRepository } from '../../storage/inMemoryActiveWalkRepository';
import { checkStaleWalk, WATCHDOG_GRACE_MS } from '../staleWalkWatchdog';

const T0 = 1_800_000_000_000;
const walk = { id: 'w1', startTime: T0, startSource: 'button' as const, locations: [], closed: false };

async function setup() {
  let clock = T0;
  const recorder = createActiveWalkRecorder({ repo: createInMemoryActiveWalkRepository(), now: () => clock });
  const stopTask = jest.fn().mockResolvedValue(undefined);
  return { recorder, stopTask, advance: (ms: number) => (clock += ms), check: () => checkStaleWalk({ recorder, stopTask, now: () => clock }) };
}

describe('stale walk watchdog', () => {
  it('does nothing while no walk is known', async () => {
    const { check, stopTask, advance } = await setup();
    advance(GPS_GAP_MAX_MS * 2);
    expect(await check()).toBe(false);
    expect(stopTask).not.toHaveBeenCalled();
  });

  it('leaves a walk alone while fixes keep coming or the silence is shorter than the limit', async () => {
    const { recorder, check, stopTask, advance } = await setup();
    await recorder.begin(walk);
    advance(GPS_GAP_MAX_MS);
    expect(await check()).toBe(false);
    recorder.addFix({ latitude: 52, longitude: 13, timestamp: T0, accuracy: 5 });
    advance(GPS_GAP_MAX_MS);
    expect(await check()).toBe(false);
    expect(stopTask).not.toHaveBeenCalled();
  });

  it('stops the location task of a walk that has been silent past the limit plus grace', async () => {
    const { recorder, check, stopTask, advance } = await setup();
    await recorder.begin(walk);
    advance(GPS_GAP_MAX_MS + WATCHDOG_GRACE_MS);
    expect(await check()).toBe(true);
    expect(stopTask).toHaveBeenCalledTimes(1);
  });

  it('forgets the walk once it has ended', async () => {
    const { recorder, check, stopTask, advance } = await setup();
    await recorder.begin(walk);
    await recorder.end();
    advance(GPS_GAP_MAX_MS * 2);
    expect(await check()).toBe(false);
    expect(stopTask).not.toHaveBeenCalled();
  });
});

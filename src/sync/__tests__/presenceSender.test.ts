import type { ApiClient } from '../apiClient';
import { ApiError } from '../apiClient';
import type { PresenceUpdateRequest } from '../apiContract';
import { createPresenceSender, PresenceWalk, thinPoints } from '../presenceSender';
import { IDENTITY } from '../../test/syncHelpers';

const fix = (i: number) => ({ latitude: 52 + i * 0.0001, longitude: 13, timestamp: 1_000_000 + i * 1000, accuracy: 5 });
const walkWith = (n: number, id = 'walk-1'): PresenceWalk => ({ id, startTime: 1_000_000, locations: Array.from({ length: n }, (_, i) => fix(i)) });

function setup(over: { sendPresence?: (r: PresenceUpdateRequest) => Promise<unknown>; identity?: typeof IDENTITY | null; enabled?: { value: boolean } } = {}) {
  const enabled = over.enabled ?? { value: true };
  const clock = { now: 10_000 };
  const sent: PresenceUpdateRequest[] = [];
  const sendPresence = jest.fn(async (r: PresenceUpdateRequest) => {
    if (over.sendPresence) await over.sendPresence(r);
    sent.push(r);
    return { ok: true as const };
  });
  const sleep = jest.fn(async () => undefined);
  const sender = createPresenceSender({
    getIdentity: async () => (over.identity === undefined ? IDENTITY : over.identity),
    isEnabled: async () => enabled.value,
    createClient: () => ({ sendPresence }) as unknown as ApiClient,
    now: () => clock.now,
    sleep,
  });
  const settle = () => new Promise((r) => setImmediate(r));
  return { clock, sent, sendPresence, sender, sleep, settle };
}

describe('presence sender', () => {
  it('sends the first beat at once, with the points so far, then only the new ones every 30 s', async () => {
    const { clock, sent, sender, settle } = setup();
    sender.start(walkWith(3));
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ walkId: 'walk-1', startedAt: 1_000_000 });
    expect(sent[0].points).toHaveLength(3);
    expect(sent[0].points[0]).toEqual({ lat: 52, lon: 13, t: 1_000_000 });
    expect(sent[0].ended).toBeUndefined();

    // fixes arrive every second: ticks inside the 30 s window send nothing
    for (let i = 4; i <= 20; i++) {
      clock.now += 1000;
      sender.tick(walkWith(i));
    }
    await settle();
    expect(sent).toHaveLength(1);

    clock.now += 14_000; // 31 s after the first beat
    sender.tick(walkWith(21));
    await settle();
    expect(sent).toHaveLength(2);
    expect(sent[1].points).toHaveLength(18); // 21 fixes, 3 already sent
    expect(sent[1].points[0].t).toBe(1_000_000 + 3000);
  });

  it('keeps sending (empty) beats while the phone stands still, so the sign stays', async () => {
    const { clock, sent, sender, settle } = setup();
    const w = walkWith(2);
    sender.start(w);
    await settle();
    clock.now += 30_000;
    sender.tick(w);
    await settle();
    expect(sent).toHaveLength(2);
    expect(sent[1].points).toEqual([]);
  });

  it('does not stack beats: a slow server holds the next one back, and nothing queues up', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const { clock, sendPresence, sender, settle } = setup({ sendPresence: () => gate });
    sender.start(walkWith(2));
    clock.now += 40_000;
    sender.tick(walkWith(3));
    await settle();
    expect(sendPresence).toHaveBeenCalledTimes(1);
    release();
    await settle();
  });

  it('a failed beat is not retried and not queued; the next beat carries the same points again', async () => {
    let fail = true;
    const { clock, sent, sendPresence, sender, settle } = setup({
      sendPresence: async () => {
        if (fail) throw new ApiError('network', 'down');
      },
    });
    sender.start(walkWith(3));
    await settle();
    expect(sent).toHaveLength(0);
    expect(sendPresence).toHaveBeenCalledTimes(1);
    fail = false;
    clock.now += 30_000;
    sender.tick(walkWith(5));
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].points).toHaveLength(5);
  });

  it('closes with ended:true and the points the last beat missed', async () => {
    const { clock, sent, sender, settle } = setup();
    sender.start(walkWith(3));
    await settle();
    clock.now += 5000;
    await sender.end(walkWith(8));
    expect(sent).toHaveLength(2);
    expect(sent[1].ended).toBe(true);
    expect(sent[1].points).toHaveLength(5);
    // ending twice, or an unknown walk, sends nothing more
    await sender.end(walkWith(8));
    await sender.end(walkWith(8, 'other'));
    expect(sent).toHaveLength(2);
  });

  it('retries the closing beat once after a pause, and gives up quietly after that', async () => {
    let calls = 0;
    const { sendPresence, sender, sleep, settle } = setup({
      sendPresence: async () => {
        calls++;
        if (calls >= 2) throw new ApiError('timeout', 'slow');
      },
    });
    sender.start(walkWith(2));
    await settle();
    await sender.end(walkWith(4));
    expect(sendPresence).toHaveBeenCalledTimes(3); // first beat, closing beat, one retry
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the phone is not in a household', async () => {
    const { sendPresence, sender, settle } = setup({ identity: null });
    sender.start(walkWith(3));
    sender.tick(walkWith(4));
    await settle();
    await sender.end(walkWith(4));
    expect(sendPresence).not.toHaveBeenCalled();
  });

  it('stops for the rest of the walk once the token is refused', async () => {
    const { clock, sendPresence, sender, settle } = setup({
      sendPresence: async () => {
        throw new ApiError('unauthorized', 'HTTP 401', 401);
      },
    });
    sender.start(walkWith(2));
    await settle();
    clock.now += 60_000;
    sender.tick(walkWith(3));
    await sender.end(walkWith(4));
    expect(sendPresence).toHaveBeenCalledTimes(1);
  });

  it('ignores ticks of a walk it was not started for', async () => {
    const { clock, sendPresence, sender, settle } = setup();
    sender.start(walkWith(2, 'a'));
    await settle();
    clock.now += 60_000;
    sender.tick(walkWith(3, 'b'));
    expect(sendPresence).toHaveBeenCalledTimes(1);
  });

  it('thins a long gap evenly to the request limit and keeps the newest point', () => {
    const points = Array.from({ length: 1000 }, (_, i) => ({ lat: i, lon: 0, t: i }));
    const thin = thinPoints(points, 400);
    expect(thin).toHaveLength(400);
    expect(thin[0]).toEqual(points[0]);
    expect(thin[399]).toEqual(points[999]);
    expect(thinPoints(points.slice(0, 10), 400)).toHaveLength(10);
  });

  describe('opt-in ("Runde live teilen")', () => {
    it('sends nothing at all while it is off: not at start, not on ticks, not at the end', async () => {
      const { clock, sendPresence, sender, settle } = setup({ enabled: { value: false } });
      sender.start(walkWith(3));
      await settle();
      for (let i = 4; i < 10; i++) {
        clock.now += 20_000;
        sender.addFix(fix(i));
        sender.tick(walkWith(i + 1));
      }
      await settle();
      await sender.end(walkWith(12));
      expect(sendPresence).not.toHaveBeenCalled();
    });

    it('an unreadable setting counts as off', async () => {
      const sendPresence = jest.fn(async () => ({ ok: true as const }));
      const sender = createPresenceSender({
        getIdentity: async () => IDENTITY,
        isEnabled: async () => {
          throw new Error('db down');
        },
        createClient: () => ({ sendPresence }) as unknown as ApiClient,
        now: () => 10_000,
      });
      sender.start(walkWith(3));
      await new Promise((r) => setImmediate(r));
      expect(sendPresence).not.toHaveBeenCalled();
    });

    it('saying yes mid-walk starts the thread at once, with everything walked so far', async () => {
      const enabled = { value: false };
      const { clock, sent, sender, settle } = setup({ enabled });
      sender.start(walkWith(3));
      await settle();
      clock.now += 2_000;
      sender.addFix(fix(3));
      await settle();
      expect(sent).toHaveLength(0);
      enabled.value = true;
      sender.optInChanged();
      await settle();
      expect(sent).toHaveLength(1);
      expect(sent[0].points).toHaveLength(4);
      expect(sent[0].ended).toBeUndefined();
    });

    it('turning it off mid-walk closes the sign once and stays quiet for the rest of the walk', async () => {
      const enabled = { value: true };
      const { clock, sent, sender, settle } = setup({ enabled });
      sender.start(walkWith(3));
      await settle();
      enabled.value = false;
      clock.now += 31_000; // past the 30 s beat AND the 5 s answer cache
      sender.addFix(fix(4));
      await settle();
      expect(sent).toHaveLength(2);
      expect(sent[1].ended).toBe(true);
      clock.now += 60_000;
      sender.addFix(fix(5));
      await sender.end(walkWith(6));
      expect(sent).toHaveLength(2);
    });
  });

  describe('the task feeder (addFix) and the foreground feeder (tick) share one cadence', () => {
    it('fixes from the location task alone keep the beats going, without any walk object', async () => {
      const { clock, sent, sender, settle } = setup();
      sender.start(walkWith(1));
      await settle();
      expect(sent).toHaveLength(1);
      for (let i = 1; i <= 29; i++) {
        clock.now += 1_000;
        sender.addFix(fix(i));
      }
      await settle();
      expect(sent).toHaveLength(1); // 29 s in
      clock.now += 1_000;
      sender.addFix(fix(30));
      await settle();
      expect(sent).toHaveLength(2);
      expect(sent[1].points).toHaveLength(30);
    });

    it('the same fix arriving through both feeders is sent once, and a tick right after a task beat does not beat again', async () => {
      const { clock, sent, sendPresence, sender, settle } = setup();
      sender.start(walkWith(1));
      await settle();
      clock.now += 31_000;
      sender.addFix(fix(1));
      sender.tick(walkWith(2)); // the walk session saw fixes 0..1 and brings fix 1 again
      await settle();
      expect(sendPresence).toHaveBeenCalledTimes(2);
      expect(sent[1].points.map((p) => p.t)).toEqual([fix(1).timestamp]);
    });

    it('fixes before start() or after end() are ignored', async () => {
      const { sendPresence, sender, settle } = setup();
      sender.addFix(fix(0));
      sender.start(walkWith(1));
      await settle();
      await sender.end(walkWith(1));
      sender.addFix(fix(5));
      await settle();
      expect(sendPresence).toHaveBeenCalledTimes(2); // first beat + closing beat only
    });
  });
});

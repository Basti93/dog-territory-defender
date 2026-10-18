import type { PartnerWalkAdded } from '../apply';
import { createPartnerHomecomingQueue, PENDING_TTL_MS, SYNC_RETRY_DELAYS_MS } from '../partnerHomecoming';

const walk = (over: Partial<PartnerWalkAdded> = {}): PartnerWalkAdded => ({
  walkId: 'w1',
  playerId: 'p-alex',
  name: 'Alex',
  startTime: 1000,
  treatsEarned: 12,
  newGroundCellCount: 3,
  distanceMeters: 1800,
  ...over,
});

function setup() {
  const clock = { now: 1_000_000 };
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const syncNow = jest.fn(async () => undefined);
  const queue = createPartnerHomecomingQueue({
    syncNow,
    now: () => clock.now,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as { cancelled: boolean }).cancelled = true;
    },
  });
  const fire = (ms: number) => timers.filter((t) => t.ms === ms && !t.cancelled).forEach((t) => t.fn());
  return { clock, queue, syncNow, timers, fire };
}

describe('partner homecoming queue', () => {
  it('needs both signals: her presence ended AND her walk arrived through sync', () => {
    const { queue } = setup();
    queue.noteWalksAdded([walk()]); // walk alone: nothing yet (it may just be old news)
    expect(queue.peek()).toBeNull();
    const other = setup();
    other.queue.noteEnded({ walkId: 'w1', name: 'Alex' }); // end alone: waiting
    expect(other.queue.peek()).toBeNull();
    other.queue.noteWalksAdded([walk()]);
    expect(other.queue.peek()).toEqual({ walkId: 'w1', name: 'Alex', treatsEarned: 12, newGroundCellCount: 3, distanceMeters: 1800, walkTime: 1000 });
  });

  it('works when her walk reaches sync a moment before the presence poll sees the end', () => {
    const { queue } = setup();
    queue.noteWalksAdded([walk()]);
    queue.noteEnded({ walkId: 'w1', name: 'Alex' });
    expect(queue.peek()?.walkId).toBe('w1');
  });

  it('ignores a walk it was not waiting for', () => {
    const { queue } = setup();
    queue.noteEnded({ walkId: 'w1', name: 'Alex' });
    queue.noteWalksAdded([walk({ walkId: 'other' })]);
    expect(queue.peek()).toBeNull();
  });

  it('asks sync for her walk after the end, on a short schedule, and stops asking once it arrived', () => {
    const { queue, syncNow, fire } = setup();
    queue.noteEnded({ walkId: 'w1', name: 'Alex' });
    fire(SYNC_RETRY_DELAYS_MS[0]);
    expect(syncNow).toHaveBeenCalledTimes(1);
    queue.noteWalksAdded([walk()]);
    fire(SYNC_RETRY_DELAYS_MS[1]); // cancelled timers do not fire
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('forgets an end whose walk never shows up, in silence', () => {
    const { queue, clock, syncNow, fire } = setup();
    queue.noteEnded({ walkId: 'w1', name: 'Alex' });
    clock.now += PENDING_TTL_MS + 1;
    fire(SYNC_RETRY_DELAYS_MS[2]);
    expect(syncNow).not.toHaveBeenCalled();
    queue.noteWalksAdded([walk()]);
    expect(queue.peek()).toBeNull();
  });

  it('plays each walk once, in order, one at a time', () => {
    const { queue } = setup();
    const heard = jest.fn();
    queue.subscribe(heard);
    queue.noteEnded({ walkId: 'w1', name: 'Alex' });
    queue.noteEnded({ walkId: 'w2', name: 'Alex' });
    queue.noteWalksAdded([walk(), walk({ walkId: 'w2' })]);
    expect(heard).toHaveBeenCalled();
    expect(queue.peek()?.walkId).toBe('w1');
    queue.shift();
    expect(queue.peek()?.walkId).toBe('w2');
    queue.shift();
    expect(queue.peek()).toBeNull();
    // the same walk again (replayed sync) does not play twice
    queue.noteEnded({ walkId: 'w1', name: 'Alex' });
    queue.noteWalksAdded([walk()]);
    expect(queue.peek()).toBeNull();
  });

  it('dispose cancels every timer', () => {
    const { queue, timers } = setup();
    queue.noteEnded({ walkId: 'w1', name: 'Alex' });
    queue.dispose();
    expect(timers.every((t) => t.cancelled)).toBe(true);
  });
});

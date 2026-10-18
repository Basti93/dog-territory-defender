import type { PartnerWalkAdded } from '../apply';
import { createPartnerHomecomingQueue, LATE_WINDOW_MS, PENDING_TTL_MS, SYNC_RETRY_DELAYS_MS, type ShownWalkStore } from '../partnerHomecoming';

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

describe('late partner homecoming (her walk ended while the app was closed or in the background)', () => {
  const NOW = 1_000_000_000;
  const memoryStore = (initial: string[] = []) => {
    let ids = initial;
    const store: ShownWalkStore = {
      load: async () => ids,
      save: jest.fn(async (next: string[]) => {
        ids = next;
      }),
    };
    return { store, get ids() { return ids; } };
  };
  const make = (initial: string[] = []) => {
    const mem = memoryStore(initial);
    const queue = createPartnerHomecomingQueue({ syncNow: async () => undefined, shown: mem.store, now: () => NOW, setTimer: () => 0, clearTimer: () => undefined });
    return { queue, mem };
  };
  const recent = (over: Partial<PartnerWalkAdded> = {}) => walk({ startTime: NOW - 3_600_000, ...over });

  it('a walk that arrives through sync without any live presence plays once', async () => {
    const { queue } = make();
    await queue.noteLateWalks([recent()]);
    expect(queue.peek()).toMatchObject({ walkId: 'w1', name: 'Alex' });
    queue.shift();
    expect(queue.peek()).toBeNull();
    await queue.noteLateWalks([recent()]); // replayed sync
    expect(queue.peek()).toBeNull();
  });

  it('only within 48 h, and never a manually logged walk', async () => {
    const { queue } = make();
    await queue.noteLateWalks([recent({ walkId: 'old', startTime: NOW - LATE_WINDOW_MS - 1 }), recent({ walkId: 'logged', manual: true })]);
    expect(queue.peek()).toBeNull();
    await queue.noteLateWalks([recent({ walkId: 'edge', startTime: NOW - LATE_WINDOW_MS + 1000 })]);
    expect(queue.peek()?.walkId).toBe('edge');
  });

  it('at most one per app open: the newest of several, then the next foreground allows one more', async () => {
    const { queue } = make();
    await queue.noteLateWalks([recent({ walkId: 'a', startTime: NOW - 7_200_000 }), recent({ walkId: 'b', startTime: NOW - 3_600_000 })]);
    expect(queue.peek()?.walkId).toBe('b');
    queue.shift();
    await queue.noteLateWalks([recent({ walkId: 'c' })]);
    expect(queue.peek()).toBeNull(); // same open
    queue.noteForeground();
    await queue.noteLateWalks([recent({ walkId: 'c' })]);
    expect(queue.peek()?.walkId).toBe('c');
  });

  it('remembers what was shown across app runs (persisted ids), live homecomings included', async () => {
    const { queue, mem } = make();
    queue.noteEnded({ walkId: 'live', name: 'Alex' });
    queue.noteWalksAdded([walk({ walkId: 'live' })]);
    queue.shift();
    await queue.noteLateWalks([recent({ walkId: 'late' })]);
    queue.shift();
    expect(mem.ids).toEqual(['live', 'late']);

    const relaunched = make(mem.ids).queue;
    await relaunched.noteLateWalks([recent({ walkId: 'late' }), recent({ walkId: 'live' })]);
    expect(relaunched.peek()).toBeNull();
  });

  it('keeps only the last 50 shown ids', async () => {
    const { queue, mem } = make(Array.from({ length: 50 }, (_, i) => `old${i}`));
    await queue.noteLateWalks([recent({ walkId: 'fresh' })]);
    queue.shift();
    expect(mem.ids).toHaveLength(50);
    expect(mem.ids[49]).toBe('fresh');
    expect(mem.ids).not.toContain('old0');
  });

  it('does not double up with the live path for the same walk', async () => {
    const { queue } = make();
    queue.noteEnded({ walkId: 'w1', name: 'Alex' });
    queue.noteWalksAdded([recent()]);
    await queue.noteLateWalks([recent()]);
    queue.shift();
    expect(queue.peek()).toBeNull();
    queue.noteEnded({ walkId: 'w1', name: 'Alex' });
    expect(queue.peek()).toBeNull();
  });

  it('plays only when the caller lets it (never over her own walk or celebration): the request waits in the queue', async () => {
    const { queue } = make();
    await queue.noteLateWalks([recent()]);
    // usePartnerHomecoming(queue, canPlay) is the gate (App.tsx: no celebration, no walk in progress); the queue itself keeps the request.
    expect(queue.peek()?.walkId).toBe('w1');
  });
});

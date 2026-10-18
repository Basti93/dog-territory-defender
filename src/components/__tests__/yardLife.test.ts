import {
  ACTIVITY_MS,
  SPOT_IDS,
  WANDER_MAX_MS,
  WANDER_MIN_MS,
  activityOptions,
  clampX,
  createWanderLoop,
  facingFor,
  nextWanderDelayMs,
  pickActivity,
  pickDestination,
  planWalk,
  positionAt,
} from '../den/yardLife';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('wander scheduler', () => {
  it('keeps delays within 15-30 s, including rng extremes', () => {
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) {
      const d = nextWanderDelayMs(rng);
      expect(d).toBeGreaterThanOrEqual(WANDER_MIN_MS);
      expect(d).toBeLessThanOrEqual(WANDER_MAX_MS);
    }
    expect(nextWanderDelayMs(() => 0)).toBe(WANDER_MIN_MS);
    expect(nextWanderDelayMs(() => 1)).toBeLessThanOrEqual(WANDER_MAX_MS);
  });

  it('never picks the spot he is already at, and reaches every other spot', () => {
    const rng = seeded(42);
    const seen = new Set<string>();
    let at: (typeof SPOT_IDS)[number] | null = 'front';
    for (let i = 0; i < 400; i++) {
      const next = pickDestination(rng, at);
      expect(next).not.toBe(at);
      seen.add(next);
      at = next;
    }
    expect(seen.size).toBe(SPOT_IDS.length);
    expect(pickDestination(() => 0.999, null)).toBe('front');
  });

  it('lets him lie down only at the doghouse, and sniff only toward a building', () => {
    for (const spot of SPOT_IDS) {
      const opts = activityOptions(spot);
      expect(opts.includes('sleep')).toBe(spot === 'doghouse');
      expect(opts.includes('sniff')).toBe(spot !== 'front');
    }
    const rng = seeded(3);
    for (let i = 0; i < 300; i++) {
      for (const spot of SPOT_IDS) {
        const act = pickActivity(rng, spot);
        if (act === 'sleep') expect(spot).toBe('doghouse');
      }
    }
    expect(ACTIVITY_MS.sleep).toBe(8000);
    expect(ACTIVITY_MS.sniff).toBe(2500);
  });
});

describe('walking', () => {
  it('uses ~90 px/s and always 3-6 hops that fill the walk', () => {
    expect(planWalk(180).durationMs).toBe(2000);
    for (const d of [5, 40, 120, 200, 280, 500]) {
      const plan = planWalk(d);
      expect(plan.hops).toBeGreaterThanOrEqual(3);
      expect(plan.hops).toBeLessThanOrEqual(6);
      expect(plan.hopMs * plan.hops).toBeCloseTo(plan.durationMs, 5);
    }
  });

  it('clamps onto the grass range and faces the direction of travel', () => {
    const range = { min: 52, max: 308 };
    expect(clampX(-40, range)).toBe(52);
    expect(clampX(999, range)).toBe(308);
    expect(clampX(180, range)).toBe(180);
    expect(facingFor(200, 100)).toBe('left');
    expect(facingFor(100, 200)).toBe('right');
    expect(facingFor(100, 100, 'left')).toBe('left');
  });

  it('interpolates the stopped position of a linear walk', () => {
    expect(positionAt(100, 300, 2000, 0)).toBe(100);
    expect(positionAt(100, 300, 2000, 1000)).toBe(200);
    expect(positionAt(100, 300, 2000, 9999)).toBe(300);
    expect(positionAt(300, 100, 2000, 500)).toBe(250);
  });
});

describe('wander loop pause/resume', () => {
  function harness() {
    jest.useFakeTimers();
    let t = 0;
    const fired: number[] = [];
    const rng = () => 0; // always the minimum wait
    const loop = createWanderLoop({
      rng,
      onFire: () => fired.push(t),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      now: () => t,
    });
    const advance = (ms: number) => {
      t += ms;
      jest.advanceTimersByTime(ms);
    };
    return { loop, fired, advance };
  }
  afterEach(() => jest.useRealTimers());

  it('fires after the delay and then waits to be re-armed', () => {
    const { loop, fired, advance } = harness();
    loop.arm();
    advance(WANDER_MIN_MS - 1);
    expect(fired).toHaveLength(0);
    advance(1);
    expect(fired).toHaveLength(1);
    advance(WANDER_MAX_MS * 2);
    expect(fired).toHaveLength(1); // not re-armed yet
    loop.arm();
    advance(WANDER_MIN_MS);
    expect(fired).toHaveLength(2);
  });

  it('keeps the remaining wait through a pause and resumes it', () => {
    const { loop, fired, advance } = harness();
    loop.arm();
    advance(10000);
    loop.pause();
    advance(60000);
    expect(fired).toHaveLength(0);
    loop.resume();
    advance(WANDER_MIN_MS - 10000 - 1);
    expect(fired).toHaveLength(0);
    advance(1);
    expect(fired).toHaveLength(1);
  });

  it('treats an interrupted behaviour as done: fresh wait after resume, nothing fires while paused', () => {
    const { loop, fired, advance } = harness();
    loop.arm();
    advance(WANDER_MIN_MS);
    expect(fired).toHaveLength(1); // behaviour running
    loop.pause(); // upgrade beat starts, behaviour aborted
    advance(60000);
    expect(fired).toHaveLength(1);
    loop.resume();
    advance(WANDER_MIN_MS - 1);
    expect(fired).toHaveLength(1);
    advance(1);
    expect(fired).toHaveLength(2);
  });

  it('arm while paused waits for resume; hold cancels; stop kills everything', () => {
    const { loop, fired, advance } = harness();
    loop.pause();
    loop.arm();
    advance(60000);
    expect(fired).toHaveLength(0);
    loop.resume();
    advance(WANDER_MIN_MS);
    expect(fired).toHaveLength(1);
    loop.arm();
    loop.hold();
    advance(60000);
    expect(fired).toHaveLength(1);
    loop.arm();
    loop.stop();
    advance(60000);
    expect(fired).toHaveLength(1);
  });
});

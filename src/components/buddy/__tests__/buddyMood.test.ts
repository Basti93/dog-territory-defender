import {
  BUDDY_TRICKS,
  RARE_TRICKS,
  RARE_TRICK_ONE_IN,
  IdleTrick,
  pickIdleTrick,
  nextTrickDelayMs,
  partsForMood,
  pickTrick,
  resolveBuddyMood,
  tapCaption,
} from '../buddyMood';
import { setLocale } from '../../../i18n';

// These tests assert English copy; pin the locale explicitly.
beforeAll(() => setLocale('en'));

const base = { sessionKind: 'fresh-open' as const, greetingFlavor: 'first-open' as const, hour: 12, curious: false };

describe('resolveBuddyMood', () => {
  it('long absence gives an excited greeting and never sleepy, even at night', () => {
    for (const hour of [0, 12, 23]) {
      const r = resolveBuddyMood({ ...base, greetingFlavor: 'long-absence', hour });
      expect(r.playGreeting).toBe(true);
      expect(r.mood).not.toBe('sleepy');
    }
  });

  it('same-day reopen is sleepy without a greeting', () => {
    expect(resolveBuddyMood({ ...base, sessionKind: 'same-day-reopen', greetingFlavor: null })).toEqual({
      mood: 'sleepy',
      playGreeting: false,
    });
  });

  it('hour 22 and 05 are sleepy, 06 and 21 are not', () => {
    expect(resolveBuddyMood({ ...base, hour: 22 }).mood).toBe('sleepy');
    expect(resolveBuddyMood({ ...base, hour: 5 }).mood).toBe('sleepy');
    expect(resolveBuddyMood({ ...base, hour: 6 }).mood).toBe('idle');
    expect(resolveBuddyMood({ ...base, hour: 21 }).mood).toBe('idle');
  });

  it('sleepy beats curious; curious only when hinted', () => {
    expect(resolveBuddyMood({ ...base, hour: 23, curious: true }).mood).toBe('sleepy');
    expect(resolveBuddyMood({ ...base, curious: true }).mood).toBe('curious');
    expect(resolveBuddyMood({ ...base, curious: false }).mood).toBe('idle');
  });
});

describe('tricks', () => {
  it('pickTrick never repeats previous for any rng value', () => {
    for (const prev of [null, ...BUDDY_TRICKS]) {
      for (let i = 0; i <= 100; i++) {
        const t = pickTrick(() => i / 100, prev);
        expect(BUDDY_TRICKS).toContain(t);
        if (prev) expect(t).not.toBe(prev);
      }
    }
  });

  it('pickTrick is deterministic with a seeded rng', () => {
    expect(pickTrick(() => 0, null)).toBe(BUDDY_TRICKS[0]);
    expect(pickTrick(() => 0.99, null)).toBe(BUDDY_TRICKS[2]);
  });

  it('nextTrickDelayMs stays within 12000-25000', () => {
    for (let i = 0; i <= 100; i++) {
      const d = nextTrickDelayMs(() => i / 100);
      expect(d).toBeGreaterThanOrEqual(12000);
      expect(d).toBeLessThanOrEqual(25000);
    }
  });
});

describe('tapCaption', () => {
  it('fills the name and cycles', () => {
    expect(tapCaption(2, 'Rex')).toBe('Rex loves that.');
    expect(tapCaption(4, 'Rex')).toBe("Hi, it's me!");
    expect(tapCaption(2)).toBe('Buddy loves that.');
  });
});

describe('partsForMood', () => {
  const noop = (() => null) as never;
  const withLying = { parts: { poseLying: noop } } as never;
  const without = { parts: {} } as never;

  it('uses the lying sprite only for sleepy on a skin that has one', () => {
    expect(partsForMood('sleepy', withLying)).toBe('lying');
    expect(partsForMood('sleepy', without)).toBe('layered');
  });

  it('keeps every other mood layered', () => {
    for (const m of ['idle', 'happy', 'curious', 'excited'] as const) expect(partsForMood(m, withLying)).toBe('layered');
  });
});

describe('idle trick pool (rare tricks)', () => {
  const sweep = (allowPhase: boolean, previous: IdleTrick | null = null) => {
    const counts = new Map<IdleTrick, number>();
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const trick = pickIdleTrick(() => i / N, previous, allowPhase);
      counts.set(trick, (counts.get(trick) ?? 0) + 1);
    }
    return { counts, N };
  };

  it('has five rare tricks at ~1/6 of the weight in total', () => {
    expect(RARE_TRICKS).toHaveLength(5);
    const { counts, N } = sweep(true);
    const rare = RARE_TRICKS.reduce((sum, r) => sum + (counts.get(r) ?? 0), 0);
    expect(rare / N).toBeCloseTo(1 / RARE_TRICK_ONE_IN, 2);
    for (const r of RARE_TRICKS) expect(counts.get(r)).toBeGreaterThan(0);
    for (const c of BUDDY_TRICKS) expect(counts.get(c)).toBeGreaterThan(0);
  });

  it('leaves phase out where there is no doghouse wall, keeping the rare share at 1/6', () => {
    const { counts, N } = sweep(false);
    expect(counts.get('phase')).toBeUndefined();
    const rare = RARE_TRICKS.reduce((sum, r) => sum + (counts.get(r) ?? 0), 0);
    expect(rare / N).toBeCloseTo(1 / RARE_TRICK_ONE_IN, 2);
  });

  it('never repeats the previous trick, common or rare', () => {
    for (const prev of [null, ...BUDDY_TRICKS, ...RARE_TRICKS] as Array<IdleTrick | null>) {
      for (let i = 0; i <= 200; i++) {
        const trick = pickIdleTrick(() => i / 200, prev, true);
        if (prev) expect(trick).not.toBe(prev);
      }
    }
  });

  it('is deterministic with a seeded rng', () => {
    expect(pickIdleTrick(() => 0, null, true)).toBe(RARE_TRICKS[0]);
    expect(pickIdleTrick(() => 0.5, null, true)).toBe(BUDDY_TRICKS[1]);
  });
});

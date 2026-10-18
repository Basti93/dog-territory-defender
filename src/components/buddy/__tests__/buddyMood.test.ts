import {
  BUDDY_TRICKS,
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

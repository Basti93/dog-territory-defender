import { pickBuddySound } from '../sounds';

describe('pickBuddySound', () => {
  it('never returns the previous sound, whatever the rng says', () => {
    for (const prev of ['buddy-1', 'buddy-2', 'buddy-3'] as const) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
        expect(pickBuddySound(prev, () => r)).not.toBe(prev);
      }
    }
  });

  it('a long random run never repeats and uses all three', () => {
    let prev: ReturnType<typeof pickBuddySound> | null = null;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const next = pickBuddySound(prev);
      expect(next).not.toBe(prev);
      seen.add(next);
      prev = next;
    }
    expect(seen.size).toBe(3);
  });
});

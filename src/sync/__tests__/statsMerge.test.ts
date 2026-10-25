import { readFileSync } from 'fs';
import { join } from 'path';

import { mergeAchievements, mergeStatValues, mergeStats, type StatsDoc } from '../statsMerge';

type S = { walks: number; meters: number; firstWalkAt: number | null };
const doc = (stats: S, achievements: Array<[string, number]> = []): StatsDoc<S> => ({ stats, achievements: achievements.map(([id, unlockedAt]) => ({ id, unlockedAt })) });

const A = doc({ walks: 5, meters: 100, firstWalkAt: 900 }, [['first-steps', 900], ['moving-in', 50]]);
const B = doc({ walks: 3, meters: 400, firstWalkAt: 300 }, [['first-steps', 300], ['future-badge', 700]]);
const C = doc({ walks: 9, meters: 10, firstWalkAt: null }, [['cozy-den', 10]]);

describe('mergeStats', () => {
  it('takes the max of numbers, the earliest firstWalkAt and the earliest date per achievement id', () => {
    expect(mergeStats(A, B)).toEqual(
      doc({ walks: 5, meters: 400, firstWalkAt: 300 }, [['first-steps', 300], ['moving-in', 50], ['future-badge', 700]].sort((x, y) => (x[1] as number) - (y[1] as number)) as Array<[string, number]>)
    );
  });

  it('ignores a null firstWalkAt on either side', () => {
    expect(mergeStats(A, C).stats.firstWalkAt).toBe(900);
    expect(mergeStats(C, A).stats.firstWalkAt).toBe(900);
    expect(mergeStats(C, C).stats.firstWalkAt).toBeNull();
  });

  it('is independent of argument order and grouping', () => {
    expect(mergeStats(A, B)).toEqual(mergeStats(B, A));
    expect(mergeStats(mergeStats(A, B), C)).toEqual(mergeStats(A, mergeStats(B, C)));
    expect(mergeStats(mergeStats(A, B), C)).toEqual(mergeStats(mergeStats(C, A), B));
  });

  it('is idempotent', () => {
    const once = mergeStats(A, B);
    expect(mergeStats(once, once)).toEqual(once);
    expect(mergeStats(once, A)).toEqual(once);
    expect(mergeStats(once, B)).toEqual(once);
  });

  it('never lowers a value or loses an id, whatever the other side holds', () => {
    for (const [x, y] of [[A, B], [B, A], [A, C], [C, B]] as const) {
      const m = mergeStats(x, y);
      expect(m.stats.walks).toBeGreaterThanOrEqual(x.stats.walks);
      expect(m.stats.meters).toBeGreaterThanOrEqual(x.stats.meters);
      if (x.stats.firstWalkAt !== null) expect(m.stats.firstWalkAt!).toBeLessThanOrEqual(x.stats.firstWalkAt);
      for (const a of x.achievements) expect(m.achievements.find((i) => i.id === a.id)!.unlockedAt).toBeLessThanOrEqual(a.unlockedAt);
    }
  });

  it('keeps keys only one side knows (a newer app) and does not mutate its inputs', () => {
    const snapshot = JSON.stringify([A, B]);
    const newer = { stats: { ...B.stats, bonusStat: 7 } as S & { bonusStat: number }, achievements: [] };
    const merged = mergeStats(A as StatsDoc<S & { bonusStat: number }>, newer);
    expect(merged.stats.bonusStat).toBe(7);
    mergeStats(A, B);
    expect(JSON.stringify([A, B])).toBe(snapshot);
  });

  it('ignores non-finite numbers instead of poisoning the result', () => {
    expect(mergeStatValues({ walks: 2, meters: 5, firstWalkAt: null }, { walks: Number.NaN, meters: Infinity, firstWalkAt: null })).toEqual({ walks: 2, meters: 5, firstWalkAt: null });
  });
});

describe('statsBasis (a correction may lower the distance figures)', () => {
  type SB = { walks: number; lifetimeDistanceMeters: number; longestWalkDistanceM: number; firstWalkAt: number | null; statsBasis: number };
  const old: SB = { walks: 15, lifetimeDistanceMeters: 34000, longestWalkDistanceM: 9000, firstWalkAt: 900, statsBasis: 0 };
  const corrected: SB = { walks: 15, lifetimeDistanceMeters: 32000, longestWalkDistanceM: 5000, firstWalkAt: 900, statsBasis: 1 };

  it('lets the higher basis win the distance figures, in either argument order, and stays idempotent', () => {
    expect(mergeStatValues(old, corrected)).toEqual(corrected);
    expect(mergeStatValues(corrected, old)).toEqual(corrected);
    expect(mergeStatValues(corrected, corrected)).toEqual(corrected);
    expect(mergeStatValues(mergeStatValues(old, corrected), old)).toEqual(corrected);
  });

  it('never loses a walk counted on the device that is behind on the basis', () => {
    const offline: SB = { ...old, walks: 16, firstWalkAt: 500 };
    expect(mergeStatValues(offline, corrected)).toEqual({ ...corrected, walks: 16, firstWalkAt: 500 });
    expect(mergeStatValues(corrected, offline)).toEqual(mergeStatValues(offline, corrected));
  });

  it('treats a missing basis (an app from before) as 0 and keeps the max rules at equal basis', () => {
    const noBasis = { walks: 3, lifetimeDistanceMeters: 100, longestWalkDistanceM: 50, firstWalkAt: null } as SB;
    expect(mergeStatValues(noBasis, corrected)).toEqual(corrected);
    expect(mergeStatValues({ ...old, lifetimeDistanceMeters: 50 }, { ...old, lifetimeDistanceMeters: 70 }).lifetimeDistanceMeters).toBe(70);
    expect(mergeStatValues({ ...corrected, lifetimeDistanceMeters: 50 }, { ...corrected, lifetimeDistanceMeters: 70 }).lifetimeDistanceMeters).toBe(70);
  });

  it('is associative across three docs with different bases', () => {
    const mid: SB = { walks: 9, lifetimeDistanceMeters: 40000, longestWalkDistanceM: 100, firstWalkAt: 100, statsBasis: 0 };
    expect(mergeStatValues(mergeStatValues(old, mid), corrected)).toEqual(mergeStatValues(old, mergeStatValues(mid, corrected)));
  });
});

describe('mergeAchievements', () => {
  it('sorts by date then id so equal inputs always give equal output', () => {
    expect(mergeAchievements([{ id: 'b', unlockedAt: 1 }, { id: 'a', unlockedAt: 1 }], [])).toEqual([{ id: 'a', unlockedAt: 1 }, { id: 'b', unlockedAt: 1 }]);
  });
});

describe('purity (the server imports this file)', () => {
  it('has no imports at all: no i18n, storage, React Native or personalStats', () => {
    const source = readFileSync(join(__dirname, '..', 'statsMerge.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});

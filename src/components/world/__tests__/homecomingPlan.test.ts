import { setLocale } from '../../../i18n';
import type { WalkRewardsCelebration } from '../../../economy/walkRewards';
import { ACHIEVEMENTS, AchievementId } from '../../../economy/personalStats';
import { NEW_GROUND_MIN_CELLS } from '../../../utils/grid';
import { HomecomingWalk, homecomingBadgeArrivals, homecomingVariant, partnerHomecomingWalk, pickClosingLine, pickOneNumber, planBeats, planExtras, resetClosingLineMemory } from '../homecomingPlan';

const rewards = (over: Partial<WalkRewardsCelebration> = {}): WalkRewardsCelebration => ({
  cellsPainted: 40,
  hasTerritory: true,
  treatsEarned: 20,
  tease: null,
  unlockedAchievements: [],
  leveledUpTo: null,
  oldTreatsPerWalk: null,
  newTreatsPerWalk: null,
  cliffhangerTitle: null,
  newGroundCellCount: 0,
  bloomMultiplier: 1,
  ...over,
});

const walk = (over: Partial<HomecomingWalk> = {}): HomecomingWalk => ({
  walkId: 'w1',
  rewards: rewards(),
  newTerritoryName: null,
  mergedTerritoryNames: null,
  territoryName: null,
  distanceMeters: 2400,
  walkTime: new Date(2026, 9, 13, 19, 0).getTime(), // a Tuesday evening
  manual: false,
  ...over,
});

const BADGE = Object.keys(ACHIEVEMENTS)[0] as AchievementId;

beforeEach(() => {
  setLocale('en');
  resetClosingLineMemory();
});

describe('planBeats / planExtras', () => {
  it('runs patch, bowl, rest when there is nothing extra', () => {
    expect(planBeats(false, planExtras(rewards()))).toEqual(['patch', 'bowl', 'rest']);
  });

  it('adds the extras beat only when something happened', () => {
    const extras = planExtras(rewards({ unlockedAchievements: [BADGE] }));
    expect(extras).toEqual(['badge']);
    expect(planBeats(false, extras)).toEqual(['patch', 'bowl', 'extras', 'rest']);
  });

  it('a new territory comes after a new corner and before badges; the income tick is the softest and counts as one of the two', () => {
    expect(planExtras(rewards({ unlockedAchievements: [BADGE] }), false, true)).toEqual(['territory', 'badge']);
    expect(planExtras(rewards(), true, true, true)).toEqual(['corner', 'territory']);
    expect(planExtras(rewards({ unlockedAchievements: [BADGE] }), false, false, true)).toEqual(['badge', 'income']);
    expect(planExtras(rewards(), false, false, true)).toEqual(['income']);
  });

  it('shows at most two extras, badge before milestone before pennant', () => {
    const extras = planExtras(
      rewards({
        unlockedAchievements: [BADGE],
        leveledUpTo: 3,
        oldTreatsPerWalk: 10,
        newTreatsPerWalk: 12,
        tease: { building: 'bakery', cost: 5, affordable: true } as never,
      })
    );
    expect(extras).toEqual(['badge', 'milestone']);
  });

  it('a new corner is an extra of its own, first in line, and counts as one of the two', () => {
    expect(planExtras(rewards(), true)).toEqual(['corner']);
    expect(planBeats(false, planExtras(rewards(), true))).toEqual(['patch', 'bowl', 'extras', 'rest']);
    expect(planExtras(rewards({ unlockedAchievements: [BADGE] }), true)).toEqual(['corner', 'badge']);
    // The cap of two holds with a corner: the level-up and the pennant wait in the yard.
    const everything = rewards({
      unlockedAchievements: [BADGE],
      leveledUpTo: 3,
      oldTreatsPerWalk: 10,
      newTreatsPerWalk: 12,
      tease: { building: 'bakery', cost: 5, affordable: true } as never,
    });
    expect(planExtras(everything, true)).toEqual(['corner', 'badge']);
    expect(planExtras(everything, false)).toEqual(['badge', 'milestone']);
  });

  it('a pennant needs an affordable tease', () => {
    expect(planExtras(rewards({ tease: { building: 'bakery', cost: 5, affordable: false } as never }))).toEqual([]);
    expect(planExtras(rewards({ tease: { building: 'bakery', cost: 5, affordable: true } as never }))).toEqual(['pennant']);
  });

  it('a manual log is the short two-beat version', () => {
    expect(planBeats(true, [])).toEqual(['bowl', 'rest']);
  });
});

describe('homecomingBadgeArrivals', () => {
  const NEW: AchievementId[] = ['first-steps', 'round-the-block', 'first-bakery-batch'];

  it('lets at most two new badges arrive in beat 3; the rest wait on the fence', () => {
    expect(homecomingBadgeArrivals(walk({ rewards: rewards({ unlockedAchievements: NEW }) }))).toEqual(['first-steps', 'round-the-block']);
  });

  it('brings nothing for a manual log or a partner return (they have no beat 3)', () => {
    expect(homecomingBadgeArrivals(walk({ manual: true, rewards: rewards({ unlockedAchievements: NEW }) }))).toEqual([]);
    expect(homecomingBadgeArrivals(walk({ partnerName: 'Alex', rewards: rewards({ unlockedAchievements: NEW }) }))).toEqual([]);
    expect(homecomingBadgeArrivals(walk())).toEqual([]);
  });
});

describe('pickOneNumber', () => {
  const bigGround = { newGroundCellCount: NEW_GROUND_MIN_CELLS + 20, bloomMultiplier: 2 };

  it('a newborn territory beats everything', () => {
    const n = pickOneNumber(walk({ newTerritoryName: 'Riverside', rewards: rewards(bigGround) }));
    expect(n.kind).toBe('territory');
    expect(n.big).toBe('New territory!');
  });

  it('new streets beat fresh ground', () => {
    const n = pickOneNumber(walk({ rewards: rewards(bigGround) }));
    expect(n.kind).toBe('streets');
    expect(n.big.startsWith('+')).toBe(true);
  });

  it('fresh ground shows the area in m2', () => {
    const n = pickOneNumber(walk({ rewards: rewards({ bloomMultiplier: 2 }) }));
    expect(n.kind).toBe('area');
    expect(n.big).toContain('m²');
  });

  it('falls back to the distance, then to treats', () => {
    expect(pickOneNumber(walk()).kind).toBe('distance');
    expect(pickOneNumber(walk()).big).toContain('2.4');
    expect(pickOneNumber(walk({ distanceMeters: null })).kind).toBe('treats');
  });
});

describe('homecomingVariant', () => {
  it('is the same fixed choreography for the first nine homecomings', () => {
    for (let c = 0; c < 10; c++) expect(homecomingVariant(c)).toEqual(homecomingVariant(1));
    expect(homecomingVariant(1).buddyEntry).toBe('gate');
  });

  it('alternates Buddy entry and sign tilt from the tenth on', () => {
    expect(homecomingVariant(10)).toEqual({ buddyEntry: 'left', signRotation: 3 });
    expect(homecomingVariant(11)).toEqual({ buddyEntry: 'bowl', signRotation: -3 });
    expect(homecomingVariant(12).buddyEntry).toBe('left');
  });
});

describe('pickClosingLine', () => {
  it('names the place and the day when it knows them', () => {
    // Lines vary per walk id; at least one of many ids must use each fact, and none leaves a raw placeholder.
    const lines = Array.from({ length: 40 }, (_, i) => {
      resetClosingLineMemory();
      return pickClosingLine(walk({ walkId: `walk-${i}`, newTerritoryName: 'Winter Street' }), 'Rex');
    });
    expect(lines.some((l) => l.includes('Winter Street'))).toBe(true);
    expect(lines.some((l) => l.includes('Tuesday evening'))).toBe(true);
    expect(lines.every((l) => !/[{}]/.test(l))).toBe(true);
  });

  it('never uses a place line without a place', () => {
    for (let i = 0; i < 40; i++) {
      resetClosingLineMemory();
      const line = pickClosingLine(walk({ walkId: `x${i}`, manual: true }), 'Rex');
      expect(line).not.toMatch(/\s{2}|\{|\}/);
    }
  });

  it('is never the same line twice in a row, even for the same walk id', () => {
    let previous = '';
    for (let i = 0; i < 60; i++) {
      const line = pickClosingLine(walk({ walkId: i % 3 === 0 ? 'same' : `id-${i}`, territoryName: 'Park' }), 'Rex');
      expect(line).not.toBe(previous);
      previous = line;
    }
  });

  it('has de and en copy for the new pool', () => {
    for (const locale of ['en', 'de'] as const) {
      setLocale(locale);
      resetClosingLineMemory();
      expect(pickClosingLine(walk({ walkId: 'a', territoryName: 'Park' }), 'Rex')).not.toContain('homecoming.line');
    }
  });
});

describe('variant Partner (Alex und Buddy sind zurück)', () => {
  const summary = { walkId: 'wp', name: 'Alex', treatsEarned: 14, newGroundCellCount: 0, distanceMeters: 2100, walkTime: 1000 };

  it('is beat 1 (patch), beat 2 (bowl) and the closing line; never extras, even when the walk had something to show', () => {
    expect(planBeats(false, ['badge', 'milestone'], true)).toEqual(['patch', 'bowl', 'rest']);
    const w = partnerHomecomingWalk(summary);
    expect(planExtras(w.rewards)).toEqual([]);
    expect(w.partnerName).toBe('Alex');
    expect(w.manual).toBe(false);
  });

  it('carries only what the shared bowl and the star need: treats, new ground, distance', () => {
    const w = partnerHomecomingWalk({ ...summary, newGroundCellCount: NEW_GROUND_MIN_CELLS });
    expect(w.rewards.treatsEarned).toBe(14);
    expect(w.rewards.unlockedAchievements).toEqual([]);
    expect(w.rewards.leveledUpTo).toBeNull();
    expect(w.rewards.tease).toBeNull();
    expect(pickOneNumber(w).kind).toBe('streets');
    expect(pickOneNumber(partnerHomecomingWalk(summary)).kind).toBe('distance');
  });

  it('speaks one fixed line in both languages and leaves the no-repeat memory of the own lines alone', () => {
    const w = partnerHomecomingWalk(summary);
    expect(pickClosingLine(w, 'Buddy')).toBe('Alex and Buddy are back.');
    setLocale('de');
    expect(pickClosingLine(w, 'Buddy')).toBe('Alex und Buddy sind zurück.');
    expect(pickClosingLine(w, 'Buddy')).toBe('Alex und Buddy sind zurück.'); // twice in a row is fine for this one
    setLocale('en');
    const own = pickClosingLine(walk({ walkId: 'a' }), 'Rex');
    resetClosingLineMemory();
    pickClosingLine(w, 'Buddy');
    expect(pickClosingLine(walk({ walkId: 'a' }), 'Rex')).toBe(own);
  });
});

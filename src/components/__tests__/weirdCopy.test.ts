import { setLocale, t } from '../../i18n';
import { HomecomingWalk, pickClosingLine, resetClosingLineMemory } from '../world/homecomingPlan';
import { WEIRD_ONE_IN, pickWeirdKey, seedHash, weirdLevelUpLine, weirdUpgradeLine } from '../weirdCopy';

beforeAll(() => setLocale('en'));

const homecomingWalk = (walkId: string): HomecomingWalk => ({
  walkId,
  rewards: {
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
  },
  newTerritoryName: null,
  mergedTerritoryNames: null,
  territoryName: null,
  distanceMeters: 1200,
  walkTime: Date.parse('2026-10-13T18:00:00'),
  manual: false,
});

describe('weird copy pickers', () => {
  it('pickWeirdKey fires for exactly 1 hash in WEIRD_ONE_IN', () => {
    const keys = ['a', 'b'];
    let hits = 0;
    for (let h = 0; h < 400; h++) if (pickWeirdKey(h, keys) !== null) hits++;
    expect(hits).toBe(400 / WEIRD_ONE_IN);
    expect(pickWeirdKey(0, keys)).toBe('a');
    expect(pickWeirdKey(4, keys)).toBe('b');
    expect(pickWeirdKey(1, keys)).toBeNull();
    expect(pickWeirdKey(0, [])).toBeNull();
  });

  it('the homecoming closing line is a weird headline for exactly the seeds pickWeirdKey picks, with {dog} filled in', () => {
    const weirdTexts = [t('weird.headline.floating', { dog: 'Rex' }), t('weird.headline.moon')];
    let weird = 0;
    for (let i = 0; i < 400; i++) {
      const walkId = `walk-${i}`;
      resetClosingLineMemory();
      const line = pickClosingLine(homecomingWalk(walkId), 'Rex');
      expect(line).not.toMatch(/[{}]/);
      const isWeirdSeed = seedHash(walkId) % WEIRD_ONE_IN === 0;
      expect(weirdTexts.includes(line)).toBe(isWeirdSeed);
      if (isWeirdSeed) weird++;
    }
    expect(weird / 400).toBeGreaterThan(0.15);
    expect(weird / 400).toBeLessThan(0.35);
  });

  it('level-up and upgrade lines are rare, seeded, and come from the weird pools', () => {
    const lines = Array.from({ length: 200 }, (_, i) => weirdLevelUpLine(`w${i}`)).filter(Boolean);
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.length).toBeLessThan(80);
    expect(new Set(lines)).toEqual(new Set([t('weird.levelUp.comet')]));
    const ups = Array.from({ length: 100 }, (_, i) => weirdUpgradeLine('sniffGarden', 20 + i)).filter(Boolean);
    expect(ups.length).toBeGreaterThan(10);
    expect(new Set(ups)).toEqual(new Set([t('weird.upgrade.garden')]));
  });
});

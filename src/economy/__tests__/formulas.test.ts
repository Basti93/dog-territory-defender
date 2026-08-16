import { BALANCE } from '../balanceConfig';
import {
  upgradeCost,
  storageCap,
  passiveTreatsPerHour,
  softCapBonusPercent,
  xpAwardForWalk,
  xpForNextLevel,
  cumulativeXpForLevel,
  levelForXp,
} from '../formulas';

describe('upgradeCost', () => {
  it('matches costBase * costMult^(level-1) for each building', () => {
    for (const building of ['doghouse', 'bakery', 'sniffGarden'] as const) {
      const { costBase, costMult } = BALANCE.buildings[building];
      for (const level of [1, 2, 5, 10]) {
        expect(upgradeCost(building, level)).toBe(Math.floor(costBase * Math.pow(costMult, level - 1)));
      }
    }
  });

  it('increases with level', () => {
    for (let level = 1; level < 20; level++) {
      expect(upgradeCost('bakery', level + 1)).toBeGreaterThan(upgradeCost('bakery', level));
    }
  });
});

describe('storageCap', () => {
  it('scales linearly with Doghouse level', () => {
    expect(storageCap(0)).toBe(100);
    expect(storageCap(1)).toBe(200);
    expect(storageCap(5)).toBe(600);
  });
});

describe('passiveTreatsPerHour', () => {
  it('scales linearly with Bakery level', () => {
    expect(passiveTreatsPerHour(0)).toBe(0);
    expect(passiveTreatsPerHour(1)).toBe(1);
    expect(passiveTreatsPerHour(12)).toBe(12);
  });
});

describe('softCapBonusPercent', () => {
  it('is monotonically increasing', () => {
    let prev = softCapBonusPercent(0);
    for (let level = 1; level <= 100; level++) {
      const next = softCapBonusPercent(level);
      expect(next).toBeGreaterThan(prev);
      prev = next;
    }
  });

  it('never exceeds maxBonusPercent', () => {
    for (const level of [1, 10, 50, 100, 1000]) {
      expect(softCapBonusPercent(level)).toBeLessThanOrEqual(BALANCE.softCap.maxBonusPercent);
    }
  });

  it('stays strictly below the cap at realistic levels', () => {
    for (const level of [1, 10, 50, 100]) {
      expect(softCapBonusPercent(level)).toBeLessThan(BALANCE.softCap.maxBonusPercent);
    }
  });

  it('is within a few percent of the cap by level 50', () => {
    const atFifty = softCapBonusPercent(50);
    expect(atFifty).toBeGreaterThan(BALANCE.softCap.maxBonusPercent * 0.8);
  });
});

describe('xpAwardForWalk', () => {
  it('matches the flat base plus distance and area terms for a typical walk', () => {
    const xp = xpAwardForWalk(1500, 8000);
    const expected = BALANCE.xp.perWalkBase + BALANCE.xp.perKm * 1.5 + BALANCE.xp.per1000m2 * 8;
    expect(xp).toBeCloseTo(expected, 5);
  });

  it('caps the area contribution so an oversized polygon does not inflate XP further', () => {
    const atCap = xpAwardForWalk(1000, BALANCE.xp.areaCapM2);
    const wayOverCap = xpAwardForWalk(1000, BALANCE.xp.areaCapM2 * 10);
    expect(wayOverCap).toBe(atCap);
  });

  it('a huge or GPS-glitched polygon yields the same XP as the cap value', () => {
    const capped = xpAwardForWalk(500, 5_000_000);
    const atCap = xpAwardForWalk(500, BALANCE.xp.areaCapM2);
    expect(capped).toBe(atCap);
  });
});

describe('levelForXp / cumulativeXpForLevel', () => {
  it('round-trips at the worked example levels from design.md', () => {
    for (const level of [5, 10, 20, 30]) {
      const cumulative = cumulativeXpForLevel(level);
      expect(levelForXp(cumulative)).toBe(level);
      expect(levelForXp(cumulative - 1)).toBeLessThan(level);
    }
  });

  it('level 1 requires 0 cumulative XP', () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(levelForXp(0)).toBe(1);
  });

  it('xpForNextLevel grows with level', () => {
    for (let level = 1; level < 30; level++) {
      expect(xpForNextLevel(level + 1)).toBeGreaterThan(xpForNextLevel(level));
    }
  });

  it('never exceeds maxLevel regardless of how much XP is passed in', () => {
    expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(BALANCE.leveling.maxLevel);
  });
});

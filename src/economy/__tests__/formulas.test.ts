import { BALANCE } from '../balanceConfig';
import { upgradeCost, storageCap, passiveTreatsPerHour, softCapBonusPercent } from '../formulas';

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

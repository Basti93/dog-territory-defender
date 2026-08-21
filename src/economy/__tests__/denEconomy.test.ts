import { BALANCE } from '../balanceConfig';
import { buddyPayout, buddyTreatsPerWalk, upgradeCost, storageCap, cumulativeXpForLevel } from '../formulas';
import {
  applyPassiveAccrual,
  awardWalkTreats,
  awardWalkXp,
  defaultDenEconomyState,
  dogDisplayName,
  getUpgradeTease,
  reconcileBuddyLevelCatchUp,
  upgradeBuilding,
} from '../denEconomy';

const NOW = 1_700_000_000_000;
const HOUR = 1000 * 60 * 60;

describe('defaultDenEconomyState', () => {
  it('starts with the configured starting treats and all buildings at level 1', () => {
    const state = defaultDenEconomyState(NOW);
    expect(state.treats).toBe(BALANCE.startingTreats);
    expect(state.doghouseLevel).toBe(1);
    expect(state.bakeryLevel).toBe(1);
    expect(state.sniffGardenLevel).toBe(1);
    expect(state.lastTickAt).toBe(NOW);
    expect(state.dogName).toBeNull();
    expect(state.cliffhangerShownForLevel).toBeNull();
  });
});

describe('dogDisplayName', () => {
  it('returns the trimmed name when set', () => {
    expect(dogDisplayName('  Buddy  ')).toBe('Buddy');
  });

  it('falls back to "Your dog" (capitalized) or "your pup" (mid-sentence) when unset (tasks.md task 1.3)', () => {
    expect(dogDisplayName(null)).toBe('Your dog');
    expect(dogDisplayName(null, false)).toBe('your pup');
    expect(dogDisplayName('', false)).toBe('your pup');
  });
});

describe('applyPassiveAccrual', () => {
  it('adds the correct amount for elapsed time', () => {
    const state = defaultDenEconomyState(NOW);
    const after = applyPassiveAccrual(state, NOW + 3 * HOUR);
    // bakeryLevel 1, buddyLevel 1 -> 1 treat/hour, 3 hours elapsed
    expect(after.treats).toBe(state.treats + 3);
    expect(after.lastTickAt).toBe(NOW + 3 * HOUR);
  });

  it('caps accrual at the storage capacity', () => {
    const cap = storageCap(1, 1, 1, 1);
    const state = { ...defaultDenEconomyState(NOW), treats: cap - 0.5, bakeryLevel: 1 };
    const after = applyPassiveAccrual(state, NOW + 10 * HOUR);
    expect(after.treats).toBe(cap);
  });
});

describe('awardWalkTreats', () => {
  it('adds buddyTreatsPerWalk at the state\'s level/sniffGardenLevel and returns the awarded amount', () => {
    const state = defaultDenEconomyState(NOW);
    const { state: after, treatsAwarded } = awardWalkTreats(state);

    expect(treatsAwarded).toBe(buddyTreatsPerWalk(state.level, state.sniffGardenLevel));
    expect(after.treats).toBe(state.treats + treatsAwarded);
  });

  it('scales with Buddy\'s level, not a flat constant', () => {
    const lowLevel = { ...defaultDenEconomyState(NOW), level: 1 };
    const highLevel = { ...defaultDenEconomyState(NOW), level: 30 };

    expect(awardWalkTreats(highLevel).treatsAwarded).toBeGreaterThan(awardWalkTreats(lowLevel).treatsAwarded);
  });

  it('caps at storage capacity', () => {
    const cap = storageCap(1, 1, 1, 1);
    const state = { ...defaultDenEconomyState(NOW), treats: cap - 10 };
    const { state: after } = awardWalkTreats(state);
    expect(after.treats).toBe(cap);
  });
});

describe('upgradeBuilding', () => {
  it('deducts the correct cost and increments the level', () => {
    const cost = upgradeCost('bakery', 2);
    const state = { ...defaultDenEconomyState(NOW), treats: cost + 5 };
    const result = upgradeBuilding(state, 'bakery');

    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.bakeryLevel).toBe(2);
      expect(result.treats).toBe(5);
    }
  });

  it('returns insufficient-treats and changes nothing when too poor', () => {
    const cost = upgradeCost('bakery', 2);
    const state = { ...defaultDenEconomyState(NOW), treats: cost - 1 };
    const result = upgradeBuilding(state, 'bakery');

    expect(result).toEqual({ error: 'insufficient-treats' });
  });

  it('returns max-level and changes nothing at the level cap', () => {
    const state = { ...defaultDenEconomyState(NOW), bakeryLevel: BALANCE.maxBuildingLevel, treats: 1_000_000 };
    const result = upgradeBuilding(state, 'bakery');

    expect(result).toEqual({ error: 'max-level' });
  });
});

describe('awardWalkXp', () => {
  it('accumulates xp across multiple walks without leveling up on a short walk', () => {
    const state = defaultDenEconomyState(NOW);
    const { state: after, leveledUp } = awardWalkXp(state, 500, 1000);

    expect(after.xp).toBeGreaterThan(0);
    expect(after.level).toBe(1);
    expect(leveledUp).toBe(false);
    expect(after.treats).toBe(state.treats);
  });

  // No more flat treatsPerLevelUp bonus (design.md's "Drop treatsPerLevelUp"
  // decision) — a level-up pays out permanently as a rate via
  // awardWalkTreats instead, so awardWalkXp never touches treats.
  it('levels up exactly once and does not itself change treats — the rate change is consumed by awardWalkTreats on a later walk', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(2) - 5, level: 1 };
    const { state: after, leveledUp } = awardWalkXp(state, 100, 0);

    expect(leveledUp).toBe(true);
    expect(after.level).toBe(2);
    expect(after.treats).toBe(state.treats);
  });

  it('the next walk after a level-up earns treats at the new, higher rate (tasks.md task 10.2)', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(2) - 5, level: 1 };
    const { state: leveledState } = awardWalkXp(state, 100, 0);

    const nextWalkTreats = awardWalkTreats(leveledState).treatsAwarded;
    expect(nextWalkTreats).toBe(buddyTreatsPerWalk(2, leveledState.sniffGardenLevel));
    expect(nextWalkTreats).toBeGreaterThan(buddyPayout(1));
  });

  it('does not level up when xp stays below the next threshold', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(2) - 1000, level: 1 };
    const { leveledUp } = awardWalkXp(state, 1, 1);

    expect(leveledUp).toBe(false);
  });

  it('does not change xp/level as a side effect of upgradeBuilding or applyPassiveAccrual', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: 500, level: 3 };

    const upgraded = upgradeBuilding({ ...state, treats: 1_000_000 }, 'bakery');
    if (!('error' in upgraded)) {
      expect(upgraded.xp).toBe(500);
      expect(upgraded.level).toBe(3);
    }

    const accrued = applyPassiveAccrual(state, NOW + HOUR);
    expect(accrued.xp).toBe(500);
    expect(accrued.level).toBe(3);
  });
});

describe('reconcileBuddyLevelCatchUp', () => {
  it('is a no-op when the stored level already matches (or exceeds, impossible in practice) what the current curve justifies', () => {
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(5), level: 5 };
    const { state: after, caughtUpToLevel } = reconcileBuddyLevelCatchUp(state);

    expect(caughtUpToLevel).toBeNull();
    expect(after).toBe(state);
  });

  it('jumps the stored level up and reports the distinct catch-up moment when the current curve justifies a higher level than what is stored', () => {
    // Simulates a save whose level was cached under the old (steeper) xpGrowth
    // curve — its xp now justifies a higher level under the current curve.
    const state = { ...defaultDenEconomyState(NOW), xp: cumulativeXpForLevel(10), level: 5 };
    const { state: after, caughtUpToLevel } = reconcileBuddyLevelCatchUp(state);

    expect(caughtUpToLevel).toBe(10);
    expect(after.level).toBe(10);
    expect(after.xp).toBe(state.xp);
  });
});

describe('getUpgradeTease', () => {
  it('picks the cheapest affordable upgrade', () => {
    // level 1->2 costs: doghouse 60, sniffGarden 72, bakery 96
    const state = { ...defaultDenEconomyState(NOW), treats: 80 };
    const tease = getUpgradeTease(state);

    expect(tease).toEqual({ building: 'doghouse', cost: 60, affordable: true });
  });

  it('falls back to the cheapest overall when nothing is affordable', () => {
    const state = { ...defaultDenEconomyState(NOW), treats: 10 };
    const tease = getUpgradeTease(state);

    expect(tease).toEqual({ building: 'doghouse', cost: 60, affordable: false });
  });

  it('returns null when every building is at max level', () => {
    const state = {
      ...defaultDenEconomyState(NOW),
      doghouseLevel: BALANCE.maxBuildingLevel,
      bakeryLevel: BALANCE.maxBuildingLevel,
      sniffGardenLevel: BALANCE.maxBuildingLevel,
      treats: 1_000_000,
    };

    expect(getUpgradeTease(state)).toBeNull();
  });
});

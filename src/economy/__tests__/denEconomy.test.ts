import { BALANCE } from '../balanceConfig';
import { upgradeCost, storageCap } from '../formulas';
import {
  applyPassiveAccrual,
  awardWalkTreats,
  defaultDenEconomyState,
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
  });
});

describe('applyPassiveAccrual', () => {
  it('adds the correct amount for elapsed time', () => {
    const state = defaultDenEconomyState(NOW);
    const after = applyPassiveAccrual(state, NOW + 3 * HOUR);
    // bakeryLevel 1 -> 1 treat/hour, 3 hours elapsed
    expect(after.treats).toBe(state.treats + 3);
    expect(after.lastTickAt).toBe(NOW + 3 * HOUR);
  });

  it('caps accrual at the storage capacity', () => {
    const state = { ...defaultDenEconomyState(NOW), treats: storageCap(1) - 0.5, bakeryLevel: 1 };
    const after = applyPassiveAccrual(state, NOW + 10 * HOUR);
    expect(after.treats).toBe(storageCap(1));
  });
});

describe('awardWalkTreats', () => {
  it('adds treatsPerWalk', () => {
    const state = defaultDenEconomyState(NOW);
    const after = awardWalkTreats(state);
    expect(after.treats).toBe(state.treats + BALANCE.treatsPerWalk);
  });

  it('caps at storage capacity', () => {
    const state = { ...defaultDenEconomyState(NOW), treats: storageCap(1) - 10 };
    const after = awardWalkTreats(state);
    expect(after.treats).toBe(storageCap(1));
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

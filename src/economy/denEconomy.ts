import { BALANCE, BuildingKey } from './balanceConfig';
import { passiveTreatsPerHour, storageCap, upgradeCost } from './formulas';

export interface DenEconomyState {
  treats: number;
  doghouseLevel: number;
  bakeryLevel: number;
  sniffGardenLevel: number;
  lastTickAt: number;
}

export type UpgradeError = 'insufficient-treats' | 'max-level';

export function defaultDenEconomyState(now: number): DenEconomyState {
  return {
    treats: BALANCE.startingTreats,
    doghouseLevel: 1,
    bakeryLevel: 1,
    sniffGardenLevel: 1,
    lastTickAt: now,
  };
}

export function applyPassiveAccrual(state: DenEconomyState, now: number): DenEconomyState {
  const elapsedHours = Math.max(0, (now - state.lastTickAt) / (1000 * 60 * 60));
  const cap = storageCap(state.doghouseLevel);
  const earned = elapsedHours * passiveTreatsPerHour(state.bakeryLevel);

  return {
    ...state,
    treats: Math.min(cap, state.treats + earned),
    lastTickAt: now,
  };
}

export function awardWalkTreats(state: DenEconomyState): DenEconomyState {
  const cap = storageCap(state.doghouseLevel);
  return {
    ...state,
    treats: Math.min(cap, state.treats + BALANCE.treatsPerWalk),
  };
}

function levelKey(building: BuildingKey): 'doghouseLevel' | 'bakeryLevel' | 'sniffGardenLevel' {
  return `${building}Level` as const;
}

export function upgradeBuilding(
  state: DenEconomyState,
  building: BuildingKey
): DenEconomyState | { error: UpgradeError } {
  const key = levelKey(building);
  const currentLevel = state[key];

  if (currentLevel >= BALANCE.maxBuildingLevel) {
    return { error: 'max-level' };
  }

  const cost = upgradeCost(building, currentLevel + 1);
  if (state.treats < cost) {
    return { error: 'insufficient-treats' };
  }

  return {
    ...state,
    treats: state.treats - cost,
    [key]: currentLevel + 1,
  };
}

import { BALANCE, BuildingKey } from './balanceConfig';
import { passiveTreatsPerHour, storageCap, upgradeCost, xpAwardForWalk, levelForXp } from './formulas';

export interface DenEconomyState {
  treats: number;
  doghouseLevel: number;
  bakeryLevel: number;
  sniffGardenLevel: number;
  lastTickAt: number;
  xp: number;
  level: number;
}

export type UpgradeError = 'insufficient-treats' | 'max-level';

export function defaultDenEconomyState(now: number): DenEconomyState {
  return {
    treats: BALANCE.startingTreats,
    doghouseLevel: 1,
    bakeryLevel: 1,
    sniffGardenLevel: 1,
    lastTickAt: now,
    xp: 0,
    level: 1,
  };
}

export interface AwardWalkXpResult {
  state: DenEconomyState;
  leveledUp: boolean;
}

export function awardWalkXp(state: DenEconomyState, distanceMeters: number, areaM2: number): AwardWalkXpResult {
  const xpGained = xpAwardForWalk(distanceMeters, areaM2);
  const nextXp = state.xp + xpGained;
  const nextLevel = levelForXp(nextXp);
  const leveledUp = nextLevel > state.level;

  const cap = storageCap(state.doghouseLevel);
  const treatsBonus = leveledUp ? BALANCE.leveling.treatsPerLevelUp : 0;

  return {
    state: {
      ...state,
      xp: nextXp,
      level: nextLevel,
      treats: Math.min(cap, state.treats + treatsBonus),
    },
    leveledUp,
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

export function getBuildingLevel(state: DenEconomyState, building: BuildingKey): number {
  return state[levelKey(building)];
}

export interface UpgradeTease {
  building: BuildingKey;
  cost: number;
  affordable: boolean;
}

export function getUpgradeTease(state: DenEconomyState): UpgradeTease | null {
  const buildingKeys = Object.keys(BALANCE.buildings) as BuildingKey[];
  const upgradable = buildingKeys
    .filter((building) => getBuildingLevel(state, building) < BALANCE.maxBuildingLevel)
    .map((building) => ({
      building,
      cost: upgradeCost(building, getBuildingLevel(state, building) + 1),
    }));

  if (upgradable.length === 0) {
    return null;
  }

  const affordableNow = upgradable.filter((x) => state.treats >= x.cost);
  const pool = affordableNow.length > 0 ? affordableNow : upgradable;
  const cheapest = pool.slice().sort((a, b) => a.cost - b.cost)[0];

  return { building: cheapest.building, cost: cheapest.cost, affordable: state.treats >= cheapest.cost };
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

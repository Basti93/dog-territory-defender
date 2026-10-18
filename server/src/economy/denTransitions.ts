// Server-side Den state transitions. The app's denEconomy.ts / walkRewards.ts cannot be imported
// here (they pull in i18n and storage), so this file re-expresses their transitions on top of the
// SHARED pure formulas (@game/economy/formulas, balanceConfig, territoryEconomy). test/parity.test.ts
// pins every function here against the app's own implementation; if you change a rule in the app,
// that test fails until this file follows.
import { BALANCE, type BuildingKey } from '@game/economy/balanceConfig';
import {
  buddyTreatsPerWalk,
  levelForXp,
  passiveTreatsPerHour,
  storageCap,
  upgradeCost,
  xpAwardForWalk,
} from '@game/economy/formulas';
import { territoryMass, territoryRate, TERRITORY_INCOME_DISPLAY_FLOOR } from '@game/economy/territoryEconomy';
import type { ApiDenState } from '@game/sync/apiContract';

export type DenState = Omit<ApiDenState, 'rev'>;

export function initialDenState(now: number): DenState {
  return {
    treats: BALANCE.startingTreats,
    doghouseLevel: 1,
    bakeryLevel: 1,
    sniffGardenLevel: 1,
    lastTickAt: now,
    xp: 0,
    level: 1,
    territoryIncomeRevealed: false,
  };
}

/** Same values as walkRewards.ts DAILY_REWARD_MULTIPLIERS (private there; pinned by the parity test). */
const DAILY_REWARD_MULTIPLIERS = [1, 1, 1, 0.5, 0.25, 0.1] as const;

export function dailyRewardMultiplier(walkOrderToday: number): number {
  const index = Math.min(walkOrderToday - 1, DAILY_REWARD_MULTIPLIERS.length - 1);
  return DAILY_REWARD_MULTIPLIERS[Math.max(0, index)];
}

export function applyPassiveAccrual(
  state: DenState,
  now: number,
  worldMass: { cellCount: number; visitsSum: number }
): DenState {
  const elapsedHours = Math.max(0, (now - state.lastTickAt) / (1000 * 60 * 60));
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);
  const rate = territoryRate(territoryMass(worldMass.cellCount, worldMass.visitsSum), state.level);
  const earned = elapsedHours * (passiveTreatsPerHour(state.bakeryLevel, state.level) + rate);
  return {
    ...state,
    treats: Math.min(cap, state.treats + earned),
    lastTickAt: now,
    territoryIncomeRevealed: state.territoryIncomeRevealed || rate >= TERRITORY_INCOME_DISPLAY_FLOOR,
  };
}

export function awardWalkTreats(
  state: DenState,
  multiplier: number,
  bloomMultiplier: number
): { state: DenState; treatsAwarded: number } {
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);
  const fullPayout = buddyTreatsPerWalk(state.level, state.sniffGardenLevel);
  const treatsAwarded = Math.round(fullPayout * multiplier * bloomMultiplier);
  return { state: { ...state, treats: Math.min(cap, state.treats + treatsAwarded) }, treatsAwarded };
}

export function awardWalkXp(
  state: DenState,
  distanceMeters: number,
  cellsPainted: number,
  baseXpMultiplier: number
): { state: DenState; xpGained: number; leveledUp: boolean } {
  const xpGained = xpAwardForWalk(distanceMeters, cellsPainted, baseXpMultiplier);
  const nextXp = state.xp + xpGained;
  const nextLevel = levelForXp(nextXp);
  return { state: { ...state, xp: nextXp, level: nextLevel }, xpGained, leveledUp: nextLevel > state.level };
}

export type UpgradeError = 'insufficient-treats' | 'max-level';

export function upgradeBuilding(state: DenState, building: BuildingKey): DenState | { error: UpgradeError } {
  const key = `${building}Level` as 'doghouseLevel' | 'bakeryLevel' | 'sniffGardenLevel';
  const currentLevel = state[key];
  if (currentLevel >= BALANCE.maxBuildingLevel) return { error: 'max-level' };
  const cost = upgradeCost(building, currentLevel + 1);
  if (state.treats < cost) return { error: 'insufficient-treats' };
  return { ...state, treats: state.treats - cost, [key]: currentLevel + 1 };
}

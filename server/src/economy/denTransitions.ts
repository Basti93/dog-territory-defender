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

export type DenState = Omit<ApiDenState, 'rev' | 'pile' | 'tapDayKey' | 'tapCount'> & { pile: number; tapDayKey: string | null; tapCount: number };

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
    pile: 0,
    tapDayKey: null,
    tapCount: 0,
  };
}

/** Same as BUDDY_TAPS_PER_DAY / BUDDY_TAP_MAX_TREATS in the app's denEconomy.ts (pinned by the parity test). */
export const BUDDY_TAPS_PER_DAY = 30;
export const BUDDY_TAP_MAX_TREATS = 3;

const cap = (state: DenState): number => storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);

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
  const rate = territoryRate(territoryMass(worldMass.cellCount, worldMass.visitsSum), state.level);
  const earned = elapsedHours * (passiveTreatsPerHour(state.bakeryLevel, state.level) + rate);
  return {
    ...state,
    pile: Math.min(state.pile + earned, Math.max(0, cap(state) - state.treats)),
    lastTickAt: now,
    territoryIncomeRevealed: state.territoryIncomeRevealed || rate >= TERRITORY_INCOME_DISPLAY_FLOOR,
  };
}

/** Highest bank a gift sprinkle may reach: bank + pile stay within the storage cap. */
export function giftRoom(state: DenState): number {
  return cap(state) - state.pile;
}

export function harvestPile(state: DenState): DenState {
  if (state.pile <= 0) return state;
  return { ...state, treats: state.treats + state.pile, pile: 0 };
}

/** `den.harvest {at}`: settle the pile up to `at` (clamped by the caller to [lastTickAt, now]), bank it, keep `at` as watermark. */
export function harvestAt(state: DenState, at: number, worldMass: { cellCount: number; visitsSum: number }): DenState {
  return harvestPile(applyPassiveAccrual(state, at, worldMass));
}

/**
 * `den.buddyTaps {taps, treats}`: the batch of taps a phone already credited locally, trimmed to what the household
 * day still allows. A tap only counts when it paid at least one treat, so a full bank uses up nothing.
 */
export function applyBuddyTaps(state: DenState, todayKey: string, taps: number, treats: number): DenState {
  const used = state.tapDayKey === todayKey ? state.tapCount : 0;
  const allowedTaps = Math.min(taps, BUDDY_TAPS_PER_DAY - used);
  const room = Math.max(0, Math.floor(cap(state) - state.treats - state.pile));
  const credited = Math.max(0, Math.min(treats, BUDDY_TAP_MAX_TREATS * allowedTaps, room));
  const usedTaps = Math.min(allowedTaps, credited);
  if (usedTaps <= 0) return state;
  return { ...state, treats: state.treats + credited, tapDayKey: todayKey, tapCount: used + usedTaps };
}

export function awardWalkTreats(
  state: DenState,
  multiplier: number,
  bloomMultiplier: number
): { state: DenState; treatsAwarded: number } {
  const banked = harvestPile(state);
  const fullPayout = buddyTreatsPerWalk(state.level, state.sniffGardenLevel);
  const treatsAwarded = Math.round(fullPayout * multiplier * bloomMultiplier);
  return { state: { ...banked, treats: Math.min(cap(banked), banked.treats + treatsAwarded) }, treatsAwarded };
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
  const banked = harvestPile(state);
  const cost = upgradeCost(building, currentLevel + 1);
  if (banked.treats < cost) return { error: 'insufficient-treats' };
  return { ...banked, treats: banked.treats - cost, [key]: currentLevel + 1 };
}

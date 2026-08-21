import { BALANCE, BuildingKey } from './balanceConfig';
import { buddyTreatsPerWalk, passiveTreatsPerHour, storageCap, upgradeCost, xpAwardForWalk, levelForXp } from './formulas';

export interface DenEconomyState {
  treats: number;
  doghouseLevel: number;
  bakeryLevel: number;
  sniffGardenLevel: number;
  lastTickAt: number;
  xp: number;
  level: number;
  /** Player-chosen dog name, set once via the first-launch naming prompt. Null until set — every display location falls back to a generic "Your dog"/"your pup" phrasing (see App.tsx's dogNameOrFallback). */
  dogName: string | null;
  /** The next-level target the one-away cliffhanger ("One more walk and he's a...") has already been shown for, so it fires at most once per approaching milestone level. Null until the first cliffhanger fires. See economy/walkRewards.ts. */
  cliffhangerShownForLevel: number | null;
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
    dogName: null,
    cliffhangerShownForLevel: null,
  };
}

/**
 * Task 1.3 fallback: every Level display location reads a generic "Your
 * dog"/"your pup" phrasing until the player names their dog via the
 * first-launch naming prompt, rather than blocking or showing
 * "null"/"undefined". `capitalized` picks the sentence-start form ("Your
 * dog") vs. the mid-sentence form ("your pup") — callers choose based on
 * where the name lands in the surrounding copy.
 */
export function dogDisplayName(dogName: string | null, capitalized: boolean = true): string {
  const trimmed = dogName?.trim();
  if (trimmed) {
    return trimmed;
  }
  return capitalized ? 'Your dog' : 'your pup';
}

export interface AwardWalkXpResult {
  state: DenEconomyState;
  leveledUp: boolean;
}

/**
 * baseXpMultiplier is the per-day diminishing-returns multiplier — see
 * economy/walkRewards.ts. It scales only the flat XP base, not the
 * distance/area terms.
 *
 * No longer touches treats: a level-up used to credit a flat one-time bonus
 * (BALANCE.leveling.treatsPerLevelUp), but per
 * openspec/changes/virtual-dog-companion/design.md's "Drop
 * treatsPerLevelUp" decision, leveling up now pays out permanently as a
 * rate (buddyPayout, consumed by awardWalkTreats below) instead of a
 * one-off flat amount — one event, one reward.
 */
export function awardWalkXp(
  state: DenEconomyState,
  distanceMeters: number,
  areaM2: number,
  baseXpMultiplier: number = 1
): AwardWalkXpResult {
  const xpGained = xpAwardForWalk(distanceMeters, areaM2, baseXpMultiplier);
  const nextXp = state.xp + xpGained;
  const nextLevel = levelForXp(nextXp);
  const leveledUp = nextLevel > state.level;

  return {
    state: { ...state, xp: nextXp, level: nextLevel },
    leveledUp,
  };
}

export function applyPassiveAccrual(state: DenEconomyState, now: number): DenEconomyState {
  const elapsedHours = Math.max(0, (now - state.lastTickAt) / (1000 * 60 * 60));
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);
  const earned = elapsedHours * passiveTreatsPerHour(state.bakeryLevel, state.level);

  return {
    ...state,
    treats: Math.min(cap, state.treats + earned),
    lastTickAt: now,
  };
}

export interface AwardWalkTreatsResult {
  state: DenEconomyState;
  /** The actual amount credited this walk (post-multiplier, pre-cap). The single source of truth for the celebration/logging/stats figure — see walkRewards.ts's use of this instead of recomputing the treats formula itself (tasks.md task 3.4). */
  treatsAwarded: number;
}

/**
 * multiplier is the per-day diminishing-returns multiplier — see
 * economy/walkRewards.ts. Uses state.level (Buddy's level *before* this
 * walk's own awardWalkXp call, since walkRewards.ts always awards treats
 * before XP) and state.sniffGardenLevel via buddyTreatsPerWalk, so a
 * level-up earned on this very walk changes the rate starting next walk,
 * not retroactively — see tasks.md task 10.2.
 */
export function awardWalkTreats(state: DenEconomyState, multiplier: number = 1): AwardWalkTreatsResult {
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);
  const fullPayout = buddyTreatsPerWalk(state.level, state.sniffGardenLevel);
  const treatsAwarded = Math.round(fullPayout * multiplier);
  return {
    state: { ...state, treats: Math.min(cap, state.treats + treatsAwarded) },
    treatsAwarded,
  };
}

export interface CatchUpReconciliation {
  state: DenEconomyState;
  /** Non-null only when levelForXp(state.xp) under the current xpGrowth curve is higher than the stored level — a free jump no walk earned, per design.md's "Buddy caught up" decision. Callers MUST surface this as a distinct moment, never apply it silently. */
  caughtUpToLevel: number | null;
}

/**
 * Reconciles a stored `level` against what the *current* xpGrowth curve
 * justifies for the player's existing lifetime xp. Needed because `level`
 * is cached at award-time (set inside awardWalkXp), not recomputed on every
 * read — so retuning BALANCE.leveling.xpGrowth (1.13 -> 1.10, see
 * design.md's "xpGrowth should come down to 1.10" decision) leaves an
 * existing save's stored level lagging behind what its xp now justifies
 * until this runs once. Call once per app load (tasks.md task 7.2); the
 * caller must surface `caughtUpToLevel` as a distinct "Buddy caught up —
 * Level N" moment when non-null, then persist the corrected state — never a
 * silent score change.
 */
export function reconcileBuddyLevelCatchUp(state: DenEconomyState): CatchUpReconciliation {
  const correctedLevel = levelForXp(state.xp);
  if (correctedLevel <= state.level) {
    return { state, caughtUpToLevel: null };
  }
  return {
    state: { ...state, level: correctedLevel },
    caughtUpToLevel: correctedLevel,
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

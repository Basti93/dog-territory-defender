import { BALANCE, BuildingKey } from './balanceConfig';
import { buddyTreatsPerWalk, passiveTreatsPerHour, storageCap, upgradeCost, xpAwardForWalk, levelForXp } from './formulas';
import { territoryMass, territoryRate as computeTerritoryRate, TERRITORY_INCOME_DISPLAY_FLOOR } from './territoryEconomy';
import { calendarDayKey } from '../utils/manualWalkLog';
import { t } from '../i18n';

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
  /** One-time guard for the Home Range migration backfill (docs/decisions/2026-08-21-home-range.md's "Technical Split Addendum" migration section) — every previously saved tracked walk is replayed into the Home Range grid exactly once, on first load after this feature ships. False until that replay has run. See storage/homeRangeMigration.ts. */
  homeRangeBackfillComplete: boolean;
  /** Local calendar-day key (see utils/manualWalkLog.ts's calendarDayKey) of the most recent manual log, paired with manualLogCountToday — enforces walk-lifecycle's "at most 2 manual logs per calendar day" cap (docs/decisions/2026-08-21-home-range.md Decision 4). Null until the first manual log ever logged. See evaluateManualLogQuota below. */
  manualLogDayKey: string | null;
  /** How many manual logs have been recorded on manualLogDayKey. Meaningless (stale) once the current calendar day no longer matches manualLogDayKey — evaluateManualLogQuota always re-derives the real count-for-today from this pair, never reads it in isolation. */
  manualLogCountToday: number;
  /** Local calendar-day key of the most recent manual-log route refresh — enforces "at most 1 route refresh per calendar day" (design.md Decision 4). Null until the first refresh ever performed. */
  routeRefreshDayKey: string | null;
  /** One-time guard for the Territory migration backfill (docs/decisions/territories.md Decision 9) — every already-painted Home Range cell is partitioned into Territories exactly once, on first load after this feature ships. False until that replay has run. See storage/territoryMigration.ts. Must only ever be set true after homeRangeBackfillComplete is also true (there must be a populated Range to cluster). */
  territoriesBackfillComplete: boolean;
  /**
   * Guarded one-time reveal flag for the Territory passive-income line
   * (docs/decisions/territories.md Decision 6's display-gating
   * rule) — flips to true the first time `territoryRate` crosses 1
   * treat/hour, checked at read time, never re-evaluated backward (safe
   * because worldMass is monotonically non-decreasing forever — see
   * design.md's monotonicity argument). Once true, the income line renders
   * permanently on the Doorstep and Den screens.
   */
  territoryIncomeRevealed: boolean;
  /**
   * Treats the Bakery/territories have baked but the player has not harvested yet (the heap at the bowl). Never expires.
   * `treats` is the bank; the invariant is treats + pile <= storage cap. lastTickAt = "pile settled up to here".
   */
  pile: number;
  /** Household-local day key of the latest rewarded Buddy tap and how many were rewarded on it. Re-derived against today's key, never read alone (like manualLogDayKey). Server-owned: the household shares one counter. */
  tapDayKey: string | null;
  tapCount: number;
}

/** Rewarded Buddy taps per household day (docs/specs/den-economy.md "Buddy tap bonus"). */
export const BUDDY_TAPS_PER_DAY = 30;
/** One rewarded tap gives 1..3 treats. */
export const BUDDY_TAP_MAX_TREATS = 3;

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
    homeRangeBackfillComplete: false,
    manualLogDayKey: null,
    manualLogCountToday: 0,
    routeRefreshDayKey: null,
    territoriesBackfillComplete: false,
    territoryIncomeRevealed: false,
    pile: 0,
    tapDayKey: null,
    tapCount: 0,
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
  return t(capitalized ? 'dog.fallback.capitalized' : 'dog.fallback.lowercase');
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
 * docs/decisions/2026-08-21-virtual-dog-companion.md's "Drop
 * treatsPerLevelUp" decision, leveling up now pays out permanently as a
 * rate (buddyPayout, consumed by awardWalkTreats below) instead of a
 * one-off flat amount — one event, one reward.
 */
export function awardWalkXp(
  state: DenEconomyState,
  distanceMeters: number,
  cellsPainted: number,
  baseXpMultiplier: number = 1
): AwardWalkXpResult {
  const xpGained = xpAwardForWalk(distanceMeters, cellsPainted, baseXpMultiplier);
  const nextXp = state.xp + xpGained;
  const nextLevel = levelForXp(nextXp);
  const leveledUp = nextLevel > state.level;

  return {
    state: { ...state, xp: nextXp, level: nextLevel },
    leveledUp,
  };
}

/**
 * `worldMass` — the single global, ungrouped `HomeRangeRepository.getWorldMass()`
 * aggregate (docs/decisions/territories.md Decision 6's
 * split-invariance guardrail). Defaults to 0 (no territory-income
 * contribution) so every existing caller that hasn't been updated to fetch
 * it yet keeps working unchanged — 0 mass correctly yields a 0 territoryRate.
 * `territoryIncomeRevealed` flips permanently true the moment the combined
 * territoryRate first crosses TERRITORY_INCOME_DISPLAY_FLOOR — never
 * re-evaluated backward (see DenEconomyState.territoryIncomeRevealed's own
 * doc comment for why that's safe).
 */
export function applyPassiveAccrual(
  state: DenEconomyState,
  now: number,
  worldMass: { cellCount: number; visitsSum: number } = { cellCount: 0, visitsSum: 0 }
): DenEconomyState {
  const elapsedHours = Math.max(0, (now - state.lastTickAt) / (1000 * 60 * 60));
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);
  const territoryRateValue = computeTerritoryRate(territoryMass(worldMass.cellCount, worldMass.visitsSum), state.level);
  const earned = elapsedHours * (passiveTreatsPerHour(state.bakeryLevel, state.level) + territoryRateValue);

  // Same earned amount and cap as before, but it lands in the pile; bank + pile never exceed the cap.
  return {
    ...state,
    pile: Math.min(state.pile + earned, Math.max(0, cap - state.treats)),
    lastTickAt: now,
    territoryIncomeRevealed: state.territoryIncomeRevealed || territoryRateValue >= TERRITORY_INCOME_DISPLAY_FLOOR,
  };
}

/** Moves the whole pile into the bank. Total (bank + pile) is unchanged, so the cap invariant holds. */
export function harvestPile(state: DenEconomyState): DenEconomyState {
  if (state.pile <= 0) return state;
  return { ...state, treats: state.treats + state.pile, pile: 0 };
}

export interface BuddyTapResult {
  state: DenEconomyState;
  /** Treats credited (0 = capped day or full bank: Buddy still reacts, the tap was not used up). */
  credited: number;
}

/**
 * One tap on Buddy. `roll` is the 1..3 treats the caller rolled. Gives nothing (and uses up no tap) when today's
 * 30 are spent or bank + pile has no room. Server twin: applyBuddyTaps in server/src/economy/denTransitions.ts.
 */
export function applyBuddyTap(state: DenEconomyState, todayKey: string, roll: number): BuddyTapResult {
  const used = state.tapDayKey === todayKey ? state.tapCount : 0;
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);
  const gain = Math.min(Math.max(1, Math.floor(roll)), BUDDY_TAP_MAX_TREATS, Math.floor(cap - state.treats - state.pile));
  if (used >= BUDDY_TAPS_PER_DAY || gain < 1) return { state, credited: 0 };
  return { state: { ...state, treats: state.treats + gain, tapDayKey: todayKey, tapCount: used + 1 }, credited: gain };
}

export interface AwardWalkTreatsResult {
  state: DenEconomyState;
  /** The actual amount credited this walk (post-multiplier, pre-cap). The single source of truth for the celebration/logging/stats figure — see walkRewards.ts's use of this instead of recomputing the treats formula itself (tasks.md task 3.4). */
  treatsAwarded: number;
}

/**
 * multiplier is the per-day diminishing-returns multiplier — see
 * economy/walkRewards.ts. bloomMultiplier is the Home Range's Fresh Ground
 * payout (docs/decisions/2026-08-21-home-range.md Decision 3) — a second,
 * independent multiplicative factor, never XP (see formulas.ts's
 * bloomMultiplier doc comment). Both factors are applied together in a
 * single Math.round, not compounded through two separate roundings (see
 * docs/decisions/2026-08-21-home-range-rewards.md task 5.1). Uses state.level
 * (Buddy's level *before* this walk's own awardWalkXp call, since
 * walkRewards.ts always awards treats before XP) and state.sniffGardenLevel
 * via buddyTreatsPerWalk, so a level-up earned on this very walk changes the
 * rate starting next walk, not retroactively — see tasks.md task 10.2.
 */
export function awardWalkTreats(
  state: DenEconomyState,
  multiplier: number = 1,
  bloomMultiplier: number = 1
): AwardWalkTreatsResult {
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);
  const fullPayout = buddyTreatsPerWalk(state.level, state.sniffGardenLevel);
  const treatsAwarded = Math.round(fullPayout * multiplier * bloomMultiplier);
  // The walk ends by emptying the pile into the bank first; the reward is then clamped to the cap as it always was.
  const banked = harvestPile(state);
  return {
    state: { ...banked, treats: Math.min(cap, banked.treats + treatsAwarded) },
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

  // Upgrading banks the pile first, so a waiting pile counts as affordable.
  const available = state.treats + state.pile;
  const affordableNow = upgradable.filter((x) => available >= x.cost);
  const pool = affordableNow.length > 0 ? affordableNow : upgradable;
  const cheapest = pool.slice().sort((a, b) => a.cost - b.cost)[0];

  return { building: cheapest.building, cost: cheapest.cost, affordable: available >= cheapest.cost };
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

  // The pile counts: it is banked first, so the player never sees "not enough" while cookies wait.
  const banked = harvestPile(state);
  const cost = upgradeCost(building, currentLevel + 1);
  if (banked.treats < cost) {
    return { error: 'insufficient-treats' };
  }

  return {
    ...banked,
    treats: banked.treats - cost,
    [key]: currentLevel + 1,
  };
}

export interface ManualLogEligibility {
  /** False once manualLogCountToday (for today's calendar day) has already reached BALANCE.freshGround.maxManualLogsPerDay — walk-lifecycle's "a third manual log in one calendar day is rejected" rule. */
  allowed: boolean;
  /** True only when the caller wants a route refresh, this log itself is allowed, AND no route refresh has already been used today. When false, a requested route refresh is silently skipped — the log itself still proceeds if `allowed` is true (walk-lifecycle: "the second manual log SHALL still be accepted and rewarded, but SHALL NOT offer or apply a route refresh"). */
  canRefreshRoute: boolean;
}

/**
 * Pure eligibility check for "Log a walk we missed" — docs/decisions/
 * home-range/design.md Decision 4's exact caps: at most
 * BALANCE.freshGround.maxManualLogsPerDay manual logs per local calendar
 * day, of which at most BALANCE.freshGround.maxRouteRefreshesPerDay may
 * carry a route refresh. `now` determines "today" — deliberately the
 * moment the log is being created, not the walk's own (possibly
 * yesterday-dated) startTime, since the cap exists to bound how often the
 * feature itself can be used in one real sitting.
 */
export function evaluateManualLogQuota(
  state: DenEconomyState,
  now: number,
  wantsRouteRefresh: boolean
): ManualLogEligibility {
  const todayKey = calendarDayKey(now);
  const countToday = state.manualLogDayKey === todayKey ? state.manualLogCountToday : 0;
  const allowed = countToday < BALANCE.freshGround.maxManualLogsPerDay;
  const refreshAlreadyUsedToday = state.routeRefreshDayKey === todayKey;
  const canRefreshRoute = allowed && wantsRouteRefresh && !refreshAlreadyUsedToday;

  return { allowed, canRefreshRoute };
}

/**
 * Records that a manual log (and, optionally, a route refresh) just
 * happened, bumping the same day-scoped counters evaluateManualLogQuota
 * reads. Callers MUST persist the returned state before awarding this
 * walk's treats/XP (economy/walkRewards.ts's awardWalkRewards reads/writes
 * DenEconomyState too, and spreads unrelated fields through unchanged, so
 * sequencing this save first is what keeps the bookkeeping from being lost).
 */
export function recordManualLogUsage(state: DenEconomyState, now: number, usedRouteRefresh: boolean): DenEconomyState {
  const todayKey = calendarDayKey(now);
  const countToday = state.manualLogDayKey === todayKey ? state.manualLogCountToday : 0;

  return {
    ...state,
    manualLogDayKey: todayKey,
    manualLogCountToday: countToday + 1,
    routeRefreshDayKey: usedRouteRefresh ? todayKey : state.routeRefreshDayKey,
  };
}

/** Whether "Log a walk we missed" should even offer the route-refresh picker right now — used by the UI to decide whether to show the option at all, distinct from evaluateManualLogQuota's per-submission check (which also runs defense-in-depth at submit time). */
export function canOfferRouteRefreshToday(state: DenEconomyState, now: number): boolean {
  return evaluateManualLogQuota(state, now, true).canRefreshRoute;
}

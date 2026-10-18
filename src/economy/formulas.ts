import { BALANCE, BuildingKey } from './balanceConfig';
import { CELL_M, CellId, MIN_CELLS_FOR_REWARD, wildness } from '../utils/grid';

const BUILDING_KEYS: BuildingKey[] = ['doghouse', 'bakery', 'sniffGarden'];

export function upgradeCost(building: BuildingKey, level: number): number {
  const { costBase, costMult } = BALANCE.buildings[building];
  return Math.floor(costBase * Math.pow(costMult, level - 1));
}

/**
 * Buddy's per-walk treats payout, before the Sniff Garden bonus and before
 * the per-day diminishing-returns multiplier (economy/walkRewards.ts) are
 * applied. `buddyPayout(1) === 50`, exactly today's flat treatsPerWalk, so a
 * Level-1 player's experience is unchanged. Grows by a constant relative
 * 5.5% per level, forever — see
 * docs/decisions/2026-08-21-virtual-dog-companion.md's "buddyPayout(L)"
 * decision for why this is income (uncapped) rather than a capped power
 * bonus, and the anti-snowball spec delta for the invariant this must never
 * violate: no capped bonus percentage anywhere may ever read Buddy's Level.
 */
export function buddyPayout(level: number): number {
  const { buddyPayoutBase, buddyPayoutGrowth } = BALANCE.leveling;
  return Math.round(buddyPayoutBase * Math.pow(buddyPayoutGrowth, level - 1));
}

/**
 * The Sniff Garden's real mechanical effect: a percentage bonus applied to
 * a walk's treats payout, soft-capped at BALANCE.sniffGarden.maxBonusPercent
 * (8pp of the anti-snowball power budget). Reuses the curveRate=25 shape
 * already coded in softCapBonusPercent below, renormalized so building
 * level `BALANCE.maxBuildingLevel` (100) lands on exactly the 8pp budget —
 * see design.md's "sniffGardenPct" decision for the worked values.
 */
export function sniffGardenPct(sniffGardenLevel: number): number {
  const { maxBonusPercent, curveRate } = BALANCE.sniffGarden;
  const normalizer = 1 - Math.exp(-BALANCE.maxBuildingLevel / curveRate);
  return (maxBonusPercent * (1 - Math.exp(-sniffGardenLevel / curveRate))) / normalizer;
}

/**
 * The single source of truth for a walk's full treats payout, before the
 * per-day diminishing-returns multiplier (economy/walkRewards.ts) is
 * applied. Buddy's Level sets the base income rate; the Sniff Garden adds a
 * percentage on top of it. Consumed by both the UI (the "Buddy brings home
 * N treats a walk" readouts) and the actual award path
 * (denEconomy.ts's awardWalkTreats) so the displayed and credited figures
 * can never drift apart — see design.md's "displayed number is the walk's
 * full treat payout" decision and tasks.md task 3.3/3.4.
 */
export function buddyTreatsPerWalk(buddyLevel: number, sniffGardenLevel: number): number {
  const base = buddyPayout(buddyLevel);
  const bonusPercent = sniffGardenPct(sniffGardenLevel);
  return Math.round(base * (1 + bonusPercent / 100));
}

/**
 * The cheapest upgrade cost across all buildings that haven't hit
 * maxBuildingLevel yet — the "never-softlock" floor storageCap below is
 * measured against. Returns 0 once every building is maxed (nothing left to
 * protect against).
 */
function cheapestAvailableUpgradeCost(doghouseLevel: number, bakeryLevel: number, sniffGardenLevel: number): number {
  const levelByBuilding: Record<BuildingKey, number> = {
    doghouse: doghouseLevel,
    bakery: bakeryLevel,
    sniffGarden: sniffGardenLevel,
  };
  const costs = BUILDING_KEYS.filter((building) => levelByBuilding[building] < BALANCE.maxBuildingLevel).map(
    (building) => upgradeCost(building, levelByBuilding[building] + 1)
  );
  return costs.length > 0 ? Math.min(...costs) : 0;
}

/**
 * Doghouse storage capacity. Two terms, the larger wins:
 *  - an income-based term that scales with Buddy's payout rate and the
 *    Doghouse's own cost-growth rate, so capacity keeps pace with how much
 *    a walk actually earns instead of stalling as income grows;
 *  - a "never permanently softlocks" floor: 1.25x the cheapest currently
 *    affordable upgrade across all three buildings, so a player can always
 *    eventually save enough for *something*.
 * At buddyLevel=1, doghouseLevel=1 this is exactly 200 (== today's shipped
 * 100 + 100*1) and at doghouseLevel=2 exactly 300 — bit-identical to what
 * shipped before this change. See design.md's "storageCap" decision
 * (documents the flat-formula softlock this replaces) and tasks.md task 8.
 */
export function storageCap(
  doghouseLevel: number,
  buddyLevel: number,
  bakeryLevel: number,
  sniffGardenLevel: number
): number {
  const incomeBasedCap =
    buddyPayout(buddyLevel) * 4 * Math.pow(BALANCE.buildings.doghouse.costMult, doghouseLevel - 1);
  const neverSoftlockFloor = 1.25 * cheapestAvailableUpgradeCost(doghouseLevel, bakeryLevel, sniffGardenLevel);
  return Math.round(Math.max(incomeBasedCap, neverSoftlockFloor));
}

/**
 * Passive treats/hour from the Bakery, denominated in the same "walks" unit
 * as buddyPayout so the Bakery doesn't go stale relative to Buddy's rising
 * payout curve (bit-identical to today at buddyLevel=1: bakeryLevel * 1).
 * See design.md's "passiveTreatsPerHour" decision.
 */
export function passiveTreatsPerHour(bakeryLevel: number, buddyLevel: number): number {
  const { buddyPayoutBase } = BALANCE.leveling;
  return bakeryLevel * BALANCE.passive.treatsPerHourPerBakeryLevel * (buddyPayout(buddyLevel) / buddyPayoutBase);
}

/**
 * Display-only soft-cap curve. Nothing mechanically consumes this anymore —
 * the Sniff Garden's real effect is sniffGardenPct above (see design.md's
 * Sniff Garden reframe decision and tasks.md task 6.3). Kept as a dead
 * export in case a future display wants a bare 0-50% curve; must never be
 * wired back into anything that scales real treats/XP/collectibles.
 */
export function softCapBonusPercent(level: number): number {
  const { maxBonusPercent, curveRate } = BALANCE.softCap;
  return maxBonusPercent * (1 - Math.exp(-level / curveRate));
}

/**
 * baseMultiplier scales only the flat perWalkBase term (used by the per-day
 * diminishing-returns multiplier in economy/walkRewards.ts) — the
 * distance/area terms are never discounted, so a genuinely long walk always
 * earns its full distance/area XP regardless of how many walks happened
 * earlier that day.
 *
 * The area term reads `cellsPainted` (the walk's real Home Range footprint,
 * see utils/grid.ts's paintedCells) rather than a shoelace polygon's
 * enclosed area — see docs/decisions/2026-08-21-home-range.md's "Consequence
 * that must be resolved" section. `cellsPainted * CELL_M * CELL_M` is the
 * walk's true painted ground in m², a more honest "ground covered" measure
 * than a polygon that claimed block interiors the dog never entered. The
 * areaCapM2 cap is unchanged in magnitude but now binds at 50 painted cells
 * (~450m walked) — see BALANCE.xp.areaCapM2's doc comment.
 */
export function xpAwardForWalk(distanceMeters: number, cellsPainted: number, baseMultiplier: number = 1): number {
  const { perWalkBase, perKm, per1000m2, areaCapM2 } = BALANCE.xp;
  const distanceKm = distanceMeters / 1000;
  const paintedAreaM2 = cellsPainted * CELL_M * CELL_M;
  const cappedAreaM2 = Math.min(paintedAreaM2, areaCapM2);
  return perWalkBase * baseMultiplier + perKm * distanceKm + per1000m2 * (cappedAreaM2 / 1000);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fresh Ground payout multiplier — treats only, never XP (see
 * denEconomy.ts's awardWalkTreats and docs/decisions/2026-08-21-home-range.md
 * Decision 3). `B` is the mean wildness over the walk's own painted cells;
 * a painted cell that wasn't already in the pre-walk Range counts as
 * wildness 1.0 — "new ground is weighted 1.0, the same as a three-week-old
 * patch, not more" (design.md's own framing, not a bigger bonus for
 * discovery — the celebration beat is discovery's payoff, not this number).
 *
 * `rangeLastRefreshed` MUST be the Range snapshotted *before* this walk's
 * own paint lands (the same snapshot New Ground detection uses at the
 * App.tsx call site) — passing the post-paint Range would make every one of
 * this walk's own cells read as "just refreshed" and silently zero out the
 * whole mechanic on every walk.
 *
 * Suppressed to exactly 1 below MIN_CELLS_FOR_REWARD painted cells (the
 * same qualifying-walk floor `walk-lifecycle` gates base rewards on), so a
 * short GPS stub on brand-new ground can't collect the ×1.60 ceiling.
 */
export function bloomMultiplier(
  paintedCellIds: ReadonlySet<CellId>,
  rangeLastRefreshed: ReadonlyMap<CellId, number>,
  now: number
): number {
  if (paintedCellIds.size < MIN_CELLS_FOR_REWARD) {
    return 1;
  }

  let totalWildness = 0;
  for (const id of paintedCellIds) {
    const lastRefreshed = rangeLastRefreshed.get(id);
    totalWildness += lastRefreshed === undefined ? 1 : wildness(lastRefreshed, now);
  }
  const meanWildness = totalWildness / paintedCellIds.size;
  return 1 + BALANCE.freshGround.k * meanWildness;
}

/**
 * The fixed Fresh Ground multiplier a manual-log route refresh always
 * earns, regardless of which previously-tracked route is picked or how
 * wild it actually was — the exploit-closing rule from
 * docs/decisions/2026-08-21-home-range.md Decision 4 ("Can route-picking be
 * farmed?"). A manual log has no GPS evidence of what was actually walked,
 * so it can never be allowed to *choose* a better multiplier the way a real
 * walk's own bloomMultiplier can.
 *
 * Deliberately NOT `bloomMultiplier` called on the picked route's real cell
 * set — this is the one exact value an honest tracked walk of a routine
 * loop (refreshed the day before) would have earned. Because `wildness(d)`
 * only depends on elapsed days, this is a true constant (≈ ×1.112 at
 * K = 0.6, design.md's worked table), not a function of `now`.
 */
export function manualLogBloomMultiplier(): number {
  return 1 + BALANCE.freshGround.k * wildness(0, ONE_DAY_MS);
}

export function xpForNextLevel(level: number): number {
  const { xpBase, xpGrowth } = BALANCE.leveling;
  return Math.floor(xpBase * Math.pow(xpGrowth, level - 1));
}

export function cumulativeXpForLevel(level: number): number {
  const { xpBase, xpGrowth } = BALANCE.leveling;
  return Math.floor((xpBase / (xpGrowth - 1)) * (Math.pow(xpGrowth, level - 1) - 1));
}

export function levelForXp(xp: number): number {
  const { maxLevel } = BALANCE.leveling;
  let level = 1;
  while (level < maxLevel && cumulativeXpForLevel(level + 1) <= xp) {
    level++;
  }
  return level;
}

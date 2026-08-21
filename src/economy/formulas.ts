import { BALANCE, BuildingKey } from './balanceConfig';

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
 * openspec/changes/virtual-dog-companion/design.md's "buddyPayout(L)"
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
 */
export function xpAwardForWalk(distanceMeters: number, areaM2: number, baseMultiplier: number = 1): number {
  const { perWalkBase, perKm, per1000m2, areaCapM2 } = BALANCE.xp;
  const distanceKm = distanceMeters / 1000;
  const cappedAreaM2 = Math.min(areaM2, areaCapM2);
  return perWalkBase * baseMultiplier + perKm * distanceKm + per1000m2 * (cappedAreaM2 / 1000);
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

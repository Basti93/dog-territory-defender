import { BALANCE, BuildingKey } from './balanceConfig';

export function upgradeCost(building: BuildingKey, level: number): number {
  const { costBase, costMult } = BALANCE.buildings[building];
  return Math.floor(costBase * Math.pow(costMult, level - 1));
}

export function storageCap(doghouseLevel: number): number {
  return BALANCE.storage.base + doghouseLevel * BALANCE.storage.perDoghouseLevel;
}

export function passiveTreatsPerHour(bakeryLevel: number): number {
  return bakeryLevel * BALANCE.passive.treatsPerHourPerBakeryLevel;
}

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

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

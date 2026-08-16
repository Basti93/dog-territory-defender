export type BuildingKey = 'doghouse' | 'bakery' | 'sniffGarden';

export const BALANCE = {
  treatsPerWalk: 50,
  startingTreats: 50,
  storage: {
    base: 100,
    perDoghouseLevel: 100,
  },
  passive: {
    treatsPerHourPerBakeryLevel: 1,
  },
  buildings: {
    doghouse: { costBase: 40, costMult: 1.5 },
    bakery: { costBase: 60, costMult: 1.6 },
    sniffGarden: { costBase: 50, costMult: 1.45 },
  } satisfies Record<BuildingKey, { costBase: number; costMult: number }>,
  softCap: {
    level: 50,
    maxBonusPercent: 50,
    curveRate: 25,
  },
  maxBuildingLevel: 100,
  xp: {
    perWalkBase: 20,
    perKm: 15,
    per1000m2: 5,
    areaCapM2: 20000,
  },
  leveling: {
    xpBase: 100,
    xpGrowth: 1.13,
    maxLevel: 100,
    treatsPerLevelUp: 25,
  },
} as const;

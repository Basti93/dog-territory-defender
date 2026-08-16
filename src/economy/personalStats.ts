import { Walk } from '../types';
import { cumulativeDistance } from '../utils/geometry';
import { DenEconomyState } from './denEconomy';

export interface PersonalStatsState {
  totalWalksClosed: number;
  lifetimeDistanceMeters: number;
  lifetimeTerritoryAreaM2: number;
  biggestTerritoryAreaM2: number;
  longestWalkDistanceM: number;
  totalTreatsEarnedLifetime: number;
  firstWalkAt: number | null;
}

export function defaultPersonalStatsState(): PersonalStatsState {
  return {
    totalWalksClosed: 0,
    lifetimeDistanceMeters: 0,
    lifetimeTerritoryAreaM2: 0,
    biggestTerritoryAreaM2: 0,
    longestWalkDistanceM: 0,
    totalTreatsEarnedLifetime: 0,
    firstWalkAt: null,
  };
}

export type AchievementId =
  | 'first-steps'
  | 'paws-on-the-pavement'
  | 'familiar-trails'
  | 'neighborhood-legend'
  | 'hundred-walks'
  | 'ground-claimed'
  | 'round-the-block'
  | 'cross-town-trotter'
  | 'century-trail'
  | 'long-way-round'
  | 'big-backyard'
  | 'whole-city-block'
  | 'first-bakery-batch'
  | 'treat-jar-overflowing'
  | 'treats-for-days'
  | 'moving-in'
  | 'handy-homebody'
  | 'cozy-den';

export interface AchievementDefinition {
  id: AchievementId;
  name: string;
  copyTitle: string;
  copyBody: string;
}

export const ACHIEVEMENTS: Record<AchievementId, AchievementDefinition> = {
  'first-steps': {
    id: 'first-steps',
    name: 'First Steps',
    copyTitle: 'First Steps 🐾',
    copyBody: 'You and your dog just closed your very first loop. Every territory starts with one walk together.',
  },
  'paws-on-the-pavement': {
    id: 'paws-on-the-pavement',
    name: 'Paws on the Pavement',
    copyTitle: 'Paws on the Pavement',
    copyBody: "Ten walks in. Your dog's found a rhythm, and so have you.",
  },
  'familiar-trails': {
    id: 'familiar-trails',
    name: 'Familiar Trails',
    copyTitle: 'Familiar Trails',
    copyBody: 'Twenty-five walks. These streets are starting to feel like home.',
  },
  'neighborhood-legend': {
    id: 'neighborhood-legend',
    name: 'Neighborhood Legend',
    copyTitle: 'Neighborhood Legend',
    copyBody: "Fifty walks together. Every dog on the block knows your dog's name by now.",
  },
  'hundred-walks': {
    id: 'hundred-walks',
    name: '100 Walks, One Very Good Dog',
    copyTitle: '100 Walks, One Very Good Dog',
    copyBody: "A hundred walks, rain or shine. That's a lot of very good boy (or girl).",
  },
  'ground-claimed': {
    id: 'ground-claimed',
    name: 'Ground Claimed',
    copyTitle: 'Ground Claimed 🌱',
    copyBody: "That loop wasn't just a walk — it's officially yours now.",
  },
  'round-the-block': {
    id: 'round-the-block',
    name: 'Round the Block',
    copyTitle: 'Round the Block',
    copyBody: "5 km down. Your dog's paws have earned a rest (eventually).",
  },
  'cross-town-trotter': {
    id: 'cross-town-trotter',
    name: 'Cross-Town Trotter',
    copyTitle: 'Cross-Town Trotter',
    copyBody: '25 km of sniffing, trotting, and territory-claiming.',
  },
  'century-trail': {
    id: 'century-trail',
    name: 'Century Trail',
    copyTitle: 'Century Trail',
    copyBody: "100 km walked together. That's further than most people drive in a week.",
  },
  'long-way-round': {
    id: 'long-way-round',
    name: 'Long Way Round',
    copyTitle: 'Long Way Round',
    copyBody: "Now that's a walk. 3 km in one loop — someone had a lot to sniff.",
  },
  'big-backyard': {
    id: 'big-backyard',
    name: 'Big Backyard',
    copyTitle: 'Big Backyard',
    copyBody: "1,000 m² claimed in a single walk. That's a proper yard.",
  },
  'whole-city-block': {
    id: 'whole-city-block',
    name: 'Whole City Block',
    copyTitle: 'Whole City Block',
    copyBody: '5,000 m² in one loop. Your dog claimed a whole block today.',
  },
  'first-bakery-batch': {
    id: 'first-bakery-batch',
    name: 'First Bakery Batch',
    copyTitle: 'First Bakery Batch 🦴',
    copyBody: "Your first 100 treats earned. The Treat Bakery's just getting started.",
  },
  'treat-jar-overflowing': {
    id: 'treat-jar-overflowing',
    name: 'Treat Jar Overflowing',
    copyTitle: 'Treat Jar Overflowing',
    copyBody: '1,000 treats earned lifetime. Good thing the Doghouse has storage.',
  },
  'treats-for-days': {
    id: 'treats-for-days',
    name: 'Treats for Days',
    copyTitle: 'Treats for Days',
    copyBody: '10,000 treats earned. Your dog has never eaten better.',
  },
  'moving-in': {
    id: 'moving-in',
    name: 'Moving In',
    copyTitle: 'Moving In',
    copyBody: "Your first Den upgrade. The yard's starting to take shape.",
  },
  'handy-homebody': {
    id: 'handy-homebody',
    name: 'Handy Homebody',
    copyTitle: 'Handy Homebody',
    copyBody: "One building all the way to level 10. You've put real care into this Den.",
  },
  'cozy-den': {
    id: 'cozy-den',
    name: 'Cozy Den',
    copyTitle: 'Cozy Den',
    copyBody: 'Doghouse, Bakery, and Sniff Garden all at level 5. This yard feels like home.',
  },
};

interface RecordResult {
  stats: PersonalStatsState;
  newlyUnlocked: AchievementId[];
}

function crossed(before: number, after: number, threshold: number): boolean {
  return before < threshold && after >= threshold;
}

const WALK_COUNT_ACHIEVEMENTS: Array<{ id: AchievementId; threshold: number }> = [
  { id: 'first-steps', threshold: 1 },
  { id: 'paws-on-the-pavement', threshold: 10 },
  { id: 'familiar-trails', threshold: 25 },
  { id: 'neighborhood-legend', threshold: 50 },
  { id: 'hundred-walks', threshold: 100 },
];

const LIFETIME_DISTANCE_ACHIEVEMENTS: Array<{ id: AchievementId; threshold: number }> = [
  { id: 'round-the-block', threshold: 5000 },
  { id: 'cross-town-trotter', threshold: 25000 },
  { id: 'century-trail', threshold: 100000 },
];

const LONGEST_WALK_ACHIEVEMENTS: Array<{ id: AchievementId; threshold: number }> = [
  { id: 'long-way-round', threshold: 3000 },
];

const BIGGEST_TERRITORY_ACHIEVEMENTS: Array<{ id: AchievementId; threshold: number }> = [
  { id: 'ground-claimed', threshold: 50 },
  { id: 'big-backyard', threshold: 1000 },
  { id: 'whole-city-block', threshold: 5000 },
];

const TREATS_ACHIEVEMENTS: Array<{ id: AchievementId; threshold: number }> = [
  { id: 'first-bakery-batch', threshold: 100 },
  { id: 'treat-jar-overflowing', threshold: 1000 },
  { id: 'treats-for-days', threshold: 10000 },
];

interface ThresholdAchievement {
  id: AchievementId;
  threshold: number;
  statKey: keyof PersonalStatsState;
  noun: string;
}

const ALL_THRESHOLD_ACHIEVEMENTS: ThresholdAchievement[] = [
  ...WALK_COUNT_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'totalWalksClosed' as const, noun: 'walks' })),
  ...LIFETIME_DISTANCE_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'lifetimeDistanceMeters' as const, noun: 'm walked' })),
  ...LONGEST_WALK_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'longestWalkDistanceM' as const, noun: 'm in one walk' })),
  ...BIGGEST_TERRITORY_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'biggestTerritoryAreaM2' as const, noun: 'm² in one walk' })),
  ...TREATS_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'totalTreatsEarnedLifetime' as const, noun: 'treats earned' })),
];

export interface AchievementProgress {
  current: number;
  target: number;
  hint: string;
}

export function getAchievementProgress(
  id: AchievementId,
  stats: PersonalStatsState,
  denState: DenEconomyState
): AchievementProgress {
  const threshold = ALL_THRESHOLD_ACHIEVEMENTS.find((a) => a.id === id);
  if (threshold) {
    const current = Math.floor(stats[threshold.statKey] as number);
    return {
      current,
      target: threshold.threshold,
      hint: `${threshold.threshold} ${threshold.noun} — you're at ${current}`,
    };
  }

  if (id === 'moving-in') {
    const sum = denState.doghouseLevel + denState.bakeryLevel + denState.sniffGardenLevel;
    return { current: Math.min(sum, 4), target: 4, hint: 'Upgrade any building once to unlock' };
  }

  if (id === 'handy-homebody') {
    const max = Math.max(denState.doghouseLevel, denState.bakeryLevel, denState.sniffGardenLevel);
    return { current: max, target: 10, hint: `Level 10 on any building — you're at ${max}` };
  }

  // 'cozy-den'
  const atFive = [denState.doghouseLevel, denState.bakeryLevel, denState.sniffGardenLevel].filter(
    (level) => level >= 5
  ).length;
  return { current: atFive, target: 3, hint: `All 3 buildings at level 5 — you're at ${atFive}/3` };
}

export function recordWalkClosed(stats: PersonalStatsState, walk: Walk): RecordResult {
  const distanceMeters = cumulativeDistance(walk.locations);
  const areaM2 = walk.territory?.area ?? 0;

  const beforeWalks = stats.totalWalksClosed;
  const beforeDistance = stats.lifetimeDistanceMeters;
  const beforeLongest = stats.longestWalkDistanceM;
  const beforeBiggest = stats.biggestTerritoryAreaM2;

  const next: PersonalStatsState = {
    ...stats,
    totalWalksClosed: stats.totalWalksClosed + 1,
    lifetimeDistanceMeters: stats.lifetimeDistanceMeters + distanceMeters,
    lifetimeTerritoryAreaM2: stats.lifetimeTerritoryAreaM2 + areaM2,
    biggestTerritoryAreaM2: Math.max(stats.biggestTerritoryAreaM2, areaM2),
    longestWalkDistanceM: Math.max(stats.longestWalkDistanceM, distanceMeters),
    firstWalkAt: stats.firstWalkAt ?? walk.startTime,
  };

  const newlyUnlocked: AchievementId[] = [
    ...WALK_COUNT_ACHIEVEMENTS.filter((a) => crossed(beforeWalks, next.totalWalksClosed, a.threshold)).map((a) => a.id),
    ...LIFETIME_DISTANCE_ACHIEVEMENTS.filter((a) => crossed(beforeDistance, next.lifetimeDistanceMeters, a.threshold)).map(
      (a) => a.id
    ),
    ...LONGEST_WALK_ACHIEVEMENTS.filter((a) => crossed(beforeLongest, next.longestWalkDistanceM, a.threshold)).map(
      (a) => a.id
    ),
    ...BIGGEST_TERRITORY_ACHIEVEMENTS.filter((a) => crossed(beforeBiggest, next.biggestTerritoryAreaM2, a.threshold)).map(
      (a) => a.id
    ),
  ];

  return { stats: next, newlyUnlocked };
}

export function recordTreatsEarned(stats: PersonalStatsState, amount: number): RecordResult {
  if (amount <= 0) {
    return { stats, newlyUnlocked: [] };
  }

  const before = stats.totalTreatsEarnedLifetime;
  const next: PersonalStatsState = {
    ...stats,
    totalTreatsEarnedLifetime: stats.totalTreatsEarnedLifetime + amount,
  };

  const newlyUnlocked = TREATS_ACHIEVEMENTS.filter((a) =>
    crossed(before, next.totalTreatsEarnedLifetime, a.threshold)
  ).map((a) => a.id);

  return { stats: next, newlyUnlocked };
}

export function recordBuildingUpgrade(
  stats: PersonalStatsState,
  before: DenEconomyState,
  after: DenEconomyState
): RecordResult {
  const newlyUnlocked: AchievementId[] = [];

  const beforeSum = before.doghouseLevel + before.bakeryLevel + before.sniffGardenLevel;
  const afterSum = after.doghouseLevel + after.bakeryLevel + after.sniffGardenLevel;
  if (beforeSum <= 3 && afterSum > 3) {
    newlyUnlocked.push('moving-in');
  }

  const beforeMax = Math.max(before.doghouseLevel, before.bakeryLevel, before.sniffGardenLevel);
  const afterMax = Math.max(after.doghouseLevel, after.bakeryLevel, after.sniffGardenLevel);
  if (beforeMax < 10 && afterMax >= 10) {
    newlyUnlocked.push('handy-homebody');
  }

  const wasCozy = before.doghouseLevel >= 5 && before.bakeryLevel >= 5 && before.sniffGardenLevel >= 5;
  const isCozy = after.doghouseLevel >= 5 && after.bakeryLevel >= 5 && after.sniffGardenLevel >= 5;
  if (!wasCozy && isCozy) {
    newlyUnlocked.push('cozy-den');
  }

  return { stats, newlyUnlocked };
}

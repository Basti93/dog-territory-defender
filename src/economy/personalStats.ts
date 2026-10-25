import { Walk } from '../types';
import { analyseWalk } from '../walks/walkRepair';
import { CELL_M } from '../utils/grid';
import { DenEconomyState } from './denEconomy';
import { t } from '../i18n';

export interface PersonalStatsState {
  totalWalksClosed: number;
  lifetimeDistanceMeters: number;
  lifetimeTerritoryAreaM2: number;
  biggestTerritoryAreaM2: number;
  longestWalkDistanceM: number;
  totalTreatsEarnedLifetime: number;
  firstWalkAt: number | null;
  /**
   * Which walk-statistics rule set the figures above were last corrected for (walkRepair.ts WALK_STATS_VERSION; 0 = never).
   * A higher basis wins the sync merge wholesale (statsMerge.ts), which is the only way a correction can lower a figure.
   */
  statsBasis: number;
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
    statsBasis: 0,
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

const ACHIEVEMENT_IDS: AchievementId[] = [
  'first-steps',
  'paws-on-the-pavement',
  'familiar-trails',
  'neighborhood-legend',
  'hundred-walks',
  'ground-claimed',
  'round-the-block',
  'cross-town-trotter',
  'century-trail',
  'long-way-round',
  'big-backyard',
  'whole-city-block',
  'first-bakery-batch',
  'treat-jar-overflowing',
  'treats-for-days',
  'moving-in',
  'handy-homebody',
  'cozy-den',
];

// Copy lives in src/i18n (keys `achievement.<id>.name|title|body`). The
// getters resolve at read time so a language switch applies immediately.
function defineAchievement(id: AchievementId): AchievementDefinition {
  return {
    id,
    get name() {
      return t(`achievement.${id}.name`);
    },
    get copyTitle() {
      return t(`achievement.${id}.title`);
    },
    get copyBody() {
      return t(`achievement.${id}.body`);
    },
  };
}

export const ACHIEVEMENTS = Object.fromEntries(
  ACHIEVEMENT_IDS.map((id) => [id, defineAchievement(id)])
) as Record<AchievementId, AchievementDefinition>;

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
}

const ALL_THRESHOLD_ACHIEVEMENTS: ThresholdAchievement[] = [
  ...WALK_COUNT_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'totalWalksClosed' as const })),
  ...LIFETIME_DISTANCE_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'lifetimeDistanceMeters' as const })),
  ...LONGEST_WALK_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'longestWalkDistanceM' as const })),
  ...BIGGEST_TERRITORY_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'biggestTerritoryAreaM2' as const })),
  ...TREATS_ACHIEVEMENTS.map((a) => ({ ...a, statKey: 'totalTreatsEarnedLifetime' as const })),
];

/**
 * Progress of a lifetime-stat threshold badge (walks, distance, treats, territory) as plain numbers, or null for Den-building
 * badges. It has no copy and needs no Den state.
 */
export function thresholdAchievementProgress(id: AchievementId, stats: PersonalStatsState): { current: number; target: number } | null {
  const threshold = ALL_THRESHOLD_ACHIEVEMENTS.find((a) => a.id === id);
  if (!threshold) return null;
  return { current: Math.floor(stats[threshold.statKey] as number), target: threshold.threshold };
}

/**
 * `cellsPainted` is this walk's real Home Range footprint (see
 * utils/grid.ts's paintedCells), 0 for a manual log — replaces the deleted
 * `walk.territory?.area` polygon reading. See
 * docs/decisions/2026-08-21-home-range.md's "Consequence that must be
 * resolved" section (written about the XP formula, applied here for the
 * same reason: there is no polygon area left to read).
 *
 * NOTE (flagged, not resolved here): BIGGEST_TERRITORY_ACHIEVEMENTS'
 * thresholds (50/1000/5000 m²) were tuned against the old polygon's
 * continuous area. A cell's real footprint is 400 m² and the reward-eligible
 * floor is 25 cells (10,000 m²), so every one of these thresholds is now
 * cleared by any single qualifying walk — they've stopped meaning "your
 * biggest walk" and become "did you have one real walk." This is a genuine
 * balance consequence the introducing change's design.md never addressed
 * (it only worked the XP formula's replacement, not personal-stats'); it
 * needs its own numeric-threshold decision, not a silent implementer fix.
 */
export function recordWalkClosed(stats: PersonalStatsState, walk: Walk, cellsPainted: number): RecordResult {
  // Statistics distance: an idle tail (phone left on the bench) is not walked ground, and a walk that is not meaningful
  // (aborted, stuck, glitchy) never sets the longest-walk record. Rewards are untouched (paid from the full route).
  const walkStats = analyseWalk(walk);
  const distanceMeters = walkStats.distanceMeters ?? 0;
  const areaM2 = cellsPainted * CELL_M * CELL_M;

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
    longestWalkDistanceM: walkStats.excluded ? stats.longestWalkDistanceM : Math.max(stats.longestWalkDistanceM, distanceMeters),
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

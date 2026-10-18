import { BALANCE } from '../../economy/balanceConfig';
import type { WalkRewardsCelebration } from '../../economy/walkRewards';
import { formatNumber, t, tPlural } from '../../i18n';
import { CELL_M, NEW_GROUND_MIN_CELLS, streetsKnown } from '../../utils/grid';
import { dayAndTimeOfDayPhrase } from '../../utils/manualWalkLog';
import { WEIRD_HEADLINE_KEYS, pickWeirdKey, seedHash } from '../weirdCopy';
import { displayTerritoryName } from '../../utils/territoryDisplayName';
import type { AchievementId } from '../../economy/personalStats';
import { planBadgeArrivals } from './fencePlan';

// Pure planning for the Heimkehr (konzept section 6): which beats run, what the one big number is,
// how the choreography varies, and which closing sentence is spoken. No React in here.

export type BeatId = 'patch' | 'bowl' | 'extras' | 'rest';
export type ExtraKind = 'corner' | 'badge' | 'milestone' | 'pennant';

/** The slice of a finished walk the homecoming needs. */
export interface HomecomingWalk {
  walkId: string;
  rewards: WalkRewardsCelebration;
  newTerritoryName: string | null;
  mergedTerritoryNames: [string, string] | null;
  /** Territory the walk was credited to, if known. */
  territoryName: string | null;
  distanceMeters: number | null;
  /** ms epoch of the walk, for the weekday / time-of-day phrase. */
  walkTime: number;
  manual: boolean;
  /** Set for the mini homecoming of a household partner's walk ("Alex und Buddy sind zurück"). */
  partnerName?: string;
  /** "Unsere Ecken": this walk completed a corner. `name` is the auto-name the sign shows ("Ecke Lindenstraße"). Beat 3 asks for a real one, once. */
  corner?: { id: string; name: string };
}

/** What a partner's walk (seen through sync) gives the mini homecoming. Treats are already in the shared bowl. */
export interface PartnerWalkSummary {
  walkId: string;
  name: string;
  treatsEarned: number;
  newGroundCellCount: number;
  distanceMeters: number;
  walkTime: number;
}

/** Variant "Partner": a household partner's walk as a HomecomingWalk. No achievements, no level-up, no upgrade tease: those are hers to keep. */
export function partnerHomecomingWalk(p: PartnerWalkSummary): HomecomingWalk {
  return {
    walkId: p.walkId,
    rewards: {
      cellsPainted: 0,
      hasTerritory: true,
      treatsEarned: p.treatsEarned,
      tease: null,
      unlockedAchievements: [],
      leveledUpTo: null,
      oldTreatsPerWalk: null,
      newTreatsPerWalk: null,
      cliffhangerTitle: null,
      newGroundCellCount: p.newGroundCellCount,
      bloomMultiplier: 1,
    },
    newTerritoryName: null,
    mergedTerritoryNames: null,
    territoryName: null,
    distanceMeters: p.distanceMeters,
    walkTime: p.walkTime,
    manual: false,
    partnerName: p.name,
  };
}

/**
 * Optional beat-3 things, in priority order, at most two ("the rest waits in the yard"). A new corner comes first: it is
 * the one thing that is asked once and never again, and it counts as one extra like any other (badges, level, pennant).
 */
export function planExtras(rewards: WalkRewardsCelebration, hasNewCorner = false): ExtraKind[] {
  const all: ExtraKind[] = [];
  if (hasNewCorner) all.push('corner');
  if (planBadgeArrivals(rewards.unlockedAchievements).length > 0) all.push('badge');
  if (rewards.leveledUpTo !== null) all.push('milestone');
  if (rewards.tease?.affordable) all.push('pennant');
  return all.slice(0, 2);
}

/**
 * The new badges beat 3 shows (at most two; fence badges swing onto their pegs). Manual logs and partner returns have no
 * beat 3, so nothing arrives there and their badges simply hang on the fence afterwards.
 */
export function homecomingBadgeArrivals(walk: HomecomingWalk): AchievementId[] {
  if (walk.manual || walk.partnerName) return [];
  return planBadgeArrivals(walk.rewards.unlockedAchievements);
}

/** Full: patch, bowl, extras (only if any), rest. Manual log: bowl, rest. Partner: patch, bowl, then the closing line (no extras). */
export function planBeats(manual: boolean, extras: readonly ExtraKind[], partner = false): BeatId[] {
  if (partner) return ['patch', 'bowl', 'rest'];
  if (manual) return ['bowl', 'rest'];
  return extras.length > 0 ? ['patch', 'bowl', 'extras', 'rest'] : ['patch', 'bowl', 'rest'];
}

export interface OneNumber {
  kind: 'territory' | 'streets' | 'area' | 'distance' | 'treats';
  /** The big text on the sign. */
  big: string;
  caption: string | null;
}

/** THE number of this walk: new territory > new streets > fresh-ground area > distance (> treats as a last resort). */
export function pickOneNumber(walk: HomecomingWalk): OneNumber {
  const { rewards } = walk;
  if (walk.newTerritoryName) {
    return { kind: 'territory', big: t('homecoming.number.territory', { name: walk.newTerritoryName }), caption: null };
  }
  if (rewards.newGroundCellCount >= NEW_GROUND_MIN_CELLS) {
    const streets = streetsKnown(rewards.newGroundCellCount);
    return {
      kind: 'streets',
      big: tPlural('homecoming.number.streets', streets),
      caption: tPlural('homecoming.number.streets.caption', streets),
    };
  }
  const area = Math.round(rewards.cellsPainted * CELL_M * CELL_M);
  if (rewards.hasTerritory && rewards.bloomMultiplier >= BALANCE.freshGround.displayThresholdMultiplier && area > 0) {
    return { kind: 'area', big: t('homecoming.number.area', { area: formatNumber(area) }), caption: t('homecoming.number.area.caption') };
  }
  if (walk.distanceMeters && walk.distanceMeters > 0) {
    const km = formatNumber(walk.distanceMeters / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return { kind: 'distance', big: t('homecoming.number.distance', { km }), caption: t('homecoming.number.distance.caption') };
  }
  return {
    kind: 'treats',
    big: t('homecoming.number.treats', { count: formatNumber(rewards.treatsEarned) }),
    caption: t('homecoming.number.treats.caption'),
  };
}

export interface HomecomingVariant {
  /** Where Buddy is when the treats roll: at the gate (default), running in from the left, or already waiting at the bowl. */
  buddyEntry: 'gate' | 'left' | 'bowl';
  /** Tilt of the big sign in degrees. */
  signRotation: number;
}

export const VARIANT_FROM_COUNT = 10;

/** The first nine homecomings are identical; from the tenth on the choreography alternates. `count` = walks closed including this one. */
export function homecomingVariant(count: number): HomecomingVariant {
  if (count < VARIANT_FROM_COUNT) return { buddyEntry: 'gate', signRotation: -3 };
  const even = count % 2 === 0;
  return { buddyEntry: even ? 'left' : 'bowl', signRotation: even ? 3 : -3 };
}

// ---- closing line ----

const PLACE_LINES = [1, 2, 3, 4, 5].map((n) => `homecoming.line.place.${n}`);
const WHEN_LINES = [1, 2, 3, 4, 5].map((n) => `homecoming.line.when.${n}`);
const HEADLINES = [1, 2, 3].map((n) => `celebration.headline.${n}`);

let lastClosingKey: string | null = null;

/** Test hook. */
export function resetClosingLineMemory(): void {
  lastClosingKey = null;
}

function placeOf(walk: HomecomingWalk): string | null {
  const stored = walk.newTerritoryName ?? walk.mergedTerritoryNames?.[0] ?? walk.territoryName ?? null;
  return stored === null ? null : displayTerritoryName(stored);
}

/**
 * The closing sentence, seeded by walk id (stable for that walk) but never the same key twice in a row:
 * the last key is remembered in memory and skipped. Place lines need a territory name; the old celebration
 * headlines and the rare weird headlines are part of the pool for real (non-manual) walks.
 */
export function pickClosingLine(walk: HomecomingWalk, dog: string): string {
  // The partner's return has one fixed sentence; it does not touch the no-repeat memory of the player's own lines.
  if (walk.partnerName) return t('homecoming.partner.back', { name: walk.partnerName, dog });
  const place = placeOf(walk);
  const hash = seedHash(walk.walkId);
  const pool: string[] = [...WHEN_LINES];
  if (place) pool.push(...PLACE_LINES);
  if (!walk.manual) pool.push(...HEADLINES);
  const weird = walk.manual ? null : pickWeirdKey(hash, WEIRD_HEADLINE_KEYS);
  if (weird) pool.push(weird);
  let index = hash % pool.length;
  // A weird line is the rare treat: when the seed says weird, take it (unless it was just spoken).
  if (weird) index = pool.length - 1;
  if (pool[index] === lastClosingKey) index = (index + 1) % pool.length;
  const key = pool[index];
  lastClosingKey = key;
  const when = dayAndTimeOfDayPhrase(walk.walkTime);
  return t(key, { dog, name: dog, place: place ?? '', when });
}

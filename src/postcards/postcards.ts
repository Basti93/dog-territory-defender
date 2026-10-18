import { LONG_WALK_KM } from '../components/den/wildExtras';
import { formatDate, formatDistanceKm, t, tPlural } from '../i18n';
import type { Cell } from '../storage/HomeRangeRepository';
import type { StoredWalk } from '../storage/WalkRepository';
import type { Territory } from '../storage/TerritoryRepository';
import { walkDistanceMeters, walkHasMovement } from '../utils/geometry';
import { cornerDisplayName } from '../utils/cornerName';
import { cornersTouchedBy, resolveCorners } from '../utils/cornerDetection';
import { NEW_GROUND_MIN_CELLS, cellKey, paintedCells, streetsKnown } from '../utils/grid';
import type { StoredCorner } from '../storage/CornerRepository';
import { displayTerritoryName } from '../utils/territoryDisplayName';

// Postcards on the bench (redesign step 5). Nothing is stored: every finished walk that went somewhere IS a postcard,
// derived here from the walk record plus the territory list. Pure; React and repositories live in usePostcards.ts.

export type Daypart = 'morning' | 'forenoon' | 'midday' | 'afternoon' | 'evening' | 'night';

/** Morgen 5-9, Vormittag 9-11, Mittag 11-14, Nachmittag 14-18, Abend 18-22, Nacht 22-5 (local hour). */
export function daypartForHour(hour: number): Daypart {
  if (hour < 5) return 'night';
  if (hour < 9) return 'morning';
  if (hour < 11) return 'forenoon';
  if (hour < 14) return 'midday';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

/** "Dienstagnachmittag" / "Tuesday afternoon". */
export function daypartPhrase(timestamp: number): string {
  const date = new Date(timestamp);
  const weekday = formatDate(date, { weekday: 'long' });
  return t(`postcard.when.${daypartForHour(date.getHours())}`, { weekday });
}

/** A territory born while the walk was running (or just after its last fix, while it was being finished). */
export const NEW_TERRITORY_SLACK_MS = 30 * 60 * 1000;

/** What was special about a walk; the Buddy line and Buddy's favourite are picked from this. */
export interface PostcardFacts {
  /** The walk found New Ground (the same bar as the homecoming's "new streets" number). */
  firstPlace: boolean;
  /** A territory was created during this walk. */
  newTerritory: boolean;
  longWalk: boolean;
  daypart: Daypart;
}

export interface PostcardEntry {
  /** The walk id: one card per walk. */
  id: string;
  walk: StoredWalk;
  /** 'tracked' = two-sided (trail front, handwriting back). 'handwritten' = a manual log, the writing side only. */
  kind: 'tracked' | 'handwritten';
  startTime: number;
  /** 0 for a handwritten card. */
  distanceMeters: number;
  /** 0 = the line is left out. */
  newStreets: number;
  facts: PostcardFacts;
}

function lastFixTime(walk: StoredWalk): number {
  return walk.locations.length > 0 ? walk.locations[walk.locations.length - 1].timestamp : walk.startTime;
}

/** One walk's postcard, or null when the walk painted nothing (no movement) and therefore gets none. */
export function postcardForWalk(walk: StoredWalk, territories: readonly Territory[]): PostcardEntry | null {
  const daypart = daypartForHour(new Date(walk.startTime).getHours());
  if (walk.startSource === 'manual-log') {
    return {
      id: walk.id,
      walk,
      kind: 'handwritten',
      startTime: walk.startTime,
      distanceMeters: 0,
      newStreets: 0,
      facts: { firstPlace: false, newTerritory: false, longWalk: false, daypart },
    };
  }
  if (!walkHasMovement(walk)) return null;
  const distanceMeters = walkDistanceMeters(walk);
  const newGroundCount = walk.newGroundCellIds?.length ?? 0;
  const firstPlace = newGroundCount >= NEW_GROUND_MIN_CELLS;
  const windowEnd = lastFixTime(walk) + NEW_TERRITORY_SLACK_MS;
  const newTerritory = territories.some((x) => x.createdAt >= walk.startTime && x.createdAt <= windowEnd);
  return {
    id: walk.id,
    walk,
    kind: 'tracked',
    startTime: walk.startTime,
    distanceMeters,
    newStreets: firstPlace ? streetsKnown(newGroundCount) : 0,
    facts: { firstPlace, newTerritory, longWalk: distanceMeters >= LONG_WALK_KM * 1000, daypart },
  };
}

/** Every postcard, newest first. Walks that went nowhere are left out. */
export function buildPostcards(walks: readonly StoredWalk[], territories: readonly Territory[]): PostcardEntry[] {
  const entries: PostcardEntry[] = [];
  for (const walk of walks) {
    const entry = postcardForWalk(walk, territories);
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => b.startTime - a.startTime || (a.id < b.id ? -1 : 1));
}

/** The cards fanned on the bench: the newest ones, newest first. */
export const BENCH_CARD_COUNT = 3;
/** The bench reads this many of the newest walks (not all of them): walks without movement are not stored any more, so 12 comfortably holds 3 cards. */
export const BENCH_WALK_WINDOW = 12;
export function benchCards(cards: readonly PostcardEntry[]): PostcardEntry[] {
  return cards.slice(0, BENCH_CARD_COUNT);
}

/**
 * Buddy's favourite: ONE card (null when there is no tracked card), picked without asking: a first-time place first,
 * then a new territory, then the longest walk. Within the first two the newest wins, so the paw stamp keeps up with
 * the latest discovery. Expects `cards` newest first (buildPostcards' order).
 */
export function pickFavouriteId(cards: readonly PostcardEntry[]): string | null {
  const tracked = cards.filter((c) => c.kind === 'tracked');
  const firstPlace = tracked.find((c) => c.facts.firstPlace);
  if (firstPlace) return firstPlace.id;
  const newTerritory = tracked.find((c) => c.facts.newTerritory);
  if (newTerritory) return newTerritory.id;
  let longest: PostcardEntry | null = null;
  for (const c of tracked) {
    if (!longest || c.distanceMeters > longest.distanceMeters) longest = c;
  }
  return longest ? longest.id : null;
}

// ---- Buddy's line ----

const LINE_POOL_SIZES = { firstPlace: 3, newTerritory: 3, long: 3, morning: 2, evening: 2, night: 2, plain: 4, manual: 3 } as const;
type LinePool = keyof typeof LINE_POOL_SIZES;

function hashOf(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

/**
 * The i18n key of Buddy's handwritten line. Seeded by the walk id, so a card always says the same thing.
 * A handwritten card gets its own pool. A new territory is rare and always wins; otherwise one of the special things
 * (first-time place, long walk, morning/evening/night) is chosen by the seed, and an ordinary walk draws from the fallback pool.
 * Rain is not offered: the app has no weather data.
 */
export function pickBuddyLineKey(entry: { id: string; kind: PostcardEntry['kind']; facts: PostcardFacts }): string {
  const hash = hashOf(entry.id);
  const pick = (pool: LinePool, offset = 0) => `postcard.line.${pool}.${((Math.floor(hash / 7) + offset) % LINE_POOL_SIZES[pool]) + 1}`;
  if (entry.kind === 'handwritten') return pick('manual');
  const { facts } = entry;
  if (facts.newTerritory) return pick('newTerritory');
  const specials: LinePool[] = [];
  if (facts.firstPlace) specials.push('firstPlace');
  if (facts.longWalk) specials.push('long');
  if (facts.daypart === 'morning' || facts.daypart === 'forenoon') specials.push('morning');
  else if (facts.daypart === 'evening') specials.push('evening');
  else if (facts.daypart === 'night') specials.push('night');
  if (specials.length === 0) return pick('plain');
  return pick(specials[hash % specials.length]);
}

/** "one new street" / "three new streets" (written out up to twelve, digits beyond); null for 0. */
export function newStreetsPhrase(count: number): string | null {
  if (count <= 0) return null;
  const spelled = count >= 2 && count <= 12 ? t(`postcard.number.${count}`) : String(count);
  return tPlural('postcard.streets', count, { count: spelled });
}

/** The words on the back of a card. A handwritten card has the weekday only (its time of day is the time it was logged, not walked) and no distance. */
export interface PostcardWords {
  when: string;
  distance: string | null;
  streets: string | null;
  buddyLine: string;
  signature: string;
  /** The corner's name when the walk touched a named corner, else the territory name, else the fallback ("Unser Viertel"); a handwritten card says it was added later. */
  postmark: string;
}

export function postcardWords(entry: PostcardEntry, opts: { dog: string; territoryName: string | null; cornerName?: string | null }): PostcardWords {
  const handwritten = entry.kind === 'handwritten';
  return {
    when: handwritten ? formatDate(entry.startTime, { weekday: 'long' }) : daypartPhrase(entry.startTime),
    distance: handwritten ? null : formatDistanceKm(entry.distanceMeters / 1000, 1),
    streets: newStreetsPhrase(entry.newStreets),
    buddyLine: t(pickBuddyLineKey(entry)),
    signature: t('postcard.signature', { dog: opts.dog }),
    postmark: handwritten ? t('postcard.postmark.manual') : opts.cornerName ?? opts.territoryName ?? t('postcard.postmark.fallback'),
  };
}

/**
 * The territory a tracked walk belongs to, for the postmark: the one most of the walk's painted cells sit in
 * (cells carry their territory, so no per-walk storage is needed). Null when none of them has a known territory.
 */
export function territoryNameForWalk(walk: StoredWalk, cells: readonly Cell[], territories: readonly Territory[]): string | null {
  const territoryByCell = new Map<string, string>();
  for (const c of cells) if (c.territoryId) territoryByCell.set(cellKey(c.ix, c.iy), c.territoryId);
  const counts = new Map<string, number>();
  for (const id of paintedCells(walk.locations)) {
    const territoryId = territoryByCell.get(id);
    if (territoryId) counts.set(territoryId, (counts.get(territoryId) ?? 0) + 1);
  }
  let bestId: string | null = null;
  let best = 0;
  for (const [id, n] of counts) {
    if (n > best) {
      best = n;
      bestId = id;
    }
  }
  const territory = bestId ? territories.find((x) => x.id === bestId) : undefined;
  return territory ? displayTerritoryName(territory.name) : null;
}

/**
 * The postmark of a tracked walk that ran through a corner of "Unsere Ecken": that corner's name (the household's, else
 * "Ecke {street}"). A corner with neither is skipped, so the neutral "Unsere Ecke" never replaces a real territory name.
 * When the walk touched several, the one it spent the most path in wins. Null when it touched none.
 */
export function cornerNameForWalk(walk: Pick<StoredWalk, 'locations'>, corners: readonly StoredCorner[]): string | null {
  const shown = resolveCorners(corners);
  const byId = new Map(shown.map((c) => [c.id, c]));
  for (const id of cornersTouchedBy(walk, shown)) {
    const corner = byId.get(id);
    if (corner && (corner.name || corner.street)) return cornerDisplayName(corner);
  }
  return null;
}

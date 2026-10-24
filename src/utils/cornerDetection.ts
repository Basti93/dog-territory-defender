// "Unsere Ecken": finding the places the household keeps coming back to. Pure: no I/O, no i18n, no React.
// A corner is a 3x3-cell block (60 m) that tracked walks passed through on at least CORNER_CONFIG.minDays different
// local days (and the household has not got a new corner in the last minDaysBetweenNewCorners days). The id is the block's centre cell ("ix,iy"), so two phones that hold the same walks agree on it without
// talking to each other. Detection replays the walks oldest first, so the result never depends on arrival order.

import { CORNER_CONFIG } from '../economy/corners';
import { CORNER_ID_PATTERN } from '../sync/apiContract';
import type { Location } from '../types';
import { getDistance } from './geometry';
import { CellId, cellCentre, cellKey, parseCellKey, walkedCells } from './grid';
import { calendarDayGap, calendarDayKey } from './calendarDay';

export type CornerId = CellId;

/** The slice of a walk detection reads. */
export interface CornerWalk {
  id: string;
  startTime: number;
  startSource: 'button' | 'manual-log';
  locations: readonly Location[];
}

/** A corner as detection hands it out: where it is, and which walk made it a corner. */
export interface DetectedCorner {
  id: CornerId;
  ix: number;
  iy: number;
  /** startTime of the walk that made it a corner (deterministic, the same on every phone). */
  createdAt: number;
  walkId: string;
}

interface LatLon {
  lat: number;
  lon: number;
}

const centreOf = (ix: number, iy: number): LatLon => {
  const [lat, lon] = cellCentre(ix, iy);
  return { lat, lon };
};

const distanceM = (a: LatLon, b: LatLon) => getDistance(a.lat, a.lon, b.lat, b.lon);

function isTracked(walk: CornerWalk): boolean {
  return walk.startSource !== 'manual-log' && walk.locations.length >= 2;
}

function byTimeThenId(a: CornerWalk, b: CornerWalk): number {
  return a.startTime - b.startTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Where home is: the first tracked walk's start, replaced by the median start of the first `homeAnchorWalks` once there
 * are `homeAnchorMinWalks` (the same rule the server uses for the neighbours' home block). Null without a tracked walk.
 */
export function homeAnchor(walks: readonly CornerWalk[]): LatLon | null {
  const starts = walks
    .filter((w) => w.startSource === 'button' && w.locations.length > 0)
    .sort(byTimeThenId)
    .slice(0, CORNER_CONFIG.homeAnchorWalks)
    .map((w) => ({ lat: w.locations[0].latitude, lon: w.locations[0].longitude }));
  if (starts.length === 0) return null;
  if (starts.length < CORNER_CONFIG.homeAnchorMinWalks) return starts[0];
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return { lat: median(starts.map((s) => s.lat)), lon: median(starts.map((s) => s.lon)) };
}

/** Every block centre whose 3x3 block holds at least one of these cells. */
function touchedCentres(cells: ReadonlySet<CellId>): Set<CellId> {
  const r = CORNER_CONFIG.blockRadiusCells;
  const centres = new Set<CellId>();
  for (const id of cells) {
    const { ix, iy } = parseCellKey(id);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) centres.add(cellKey(ix + dx, iy + dy));
  }
  return centres;
}

interface Candidate {
  id: CornerId;
  ix: number;
  iy: number;
  days: number;
  at: LatLon;
}

/**
 * The best candidate of a walk: the most days, then the lowest id; the corner sits at the middle (medoid) of the
 * candidates within the spacing distance of that one, so it ends up on the stretch the household really uses.
 */
function pickCentre(candidates: Candidate[]): Candidate {
  const seed = [...candidates].sort((a, b) => b.days - a.days || (a.id < b.id ? -1 : 1))[0];
  const cluster = candidates.filter((c) => distanceM(c.at, seed.at) < CORNER_CONFIG.minSpacingM);
  let best = seed;
  let bestSum = Infinity;
  for (const c of cluster) {
    let sum = 0;
    for (const o of cluster) sum += distanceM(c.at, o.at);
    if (sum < bestSum || (sum === bestSum && c.id < best.id)) {
      best = c;
      bestSum = sum;
    }
  }
  return best;
}

/**
 * The corners these walks create that are not in `known` yet, in the order they were created.
 * - Days count per walk, not per paint: a walk that passes a block twice counts once, two walks on one day count once.
 * - A block qualifies on the walk that completes its `minDays`-th day; a walk makes at most `maxNewPerWalk` corners.
 * - At most one new corner per `minDaysBetweenNewCorners` local days (by the walk dates of the replay).
 * - Corners lie at least `minSpacingM` apart (known ones included) and never within `homeExcludeM` of home.
 * - Manual logs (no route) and walks with fewer than two fixes do not count.
 * The replay itself ignores `known` (so "one corner per walk" holds exactly as it did the first time); `known` only
 * filters the result: a corner this phone already has, or one within the spacing distance of one it has (another id
 * for the same street, e.g. after a late walk of the household arrived), is not new.
 */
export function detectCorners(walks: readonly CornerWalk[], known: ReadonlyArray<{ ix: number; iy: number }> = []): DetectedCorner[] {
  const tracked = walks.filter(isTracked).sort(byTimeThenId);
  if (tracked.length === 0) return [];
  const home = homeAnchor(walks);
  const existing: LatLon[] = [];
  const created: DetectedCorner[] = [];
  const daysByBlock = new Map<CornerId, Set<string>>();
  // A block that is too close to home or to a corner stays that way (corners are never removed), so it is checked once.
  const blocked = new Set<CornerId>();
  // startTime of the walk that made the latest corner IN THIS REPLAY (never the wall clock, never the stored corners).
  let lastCreatedAt: number | null = null;

  for (const walk of tracked) {
    const day = calendarDayKey(walk.startTime);
    const candidates: Candidate[] = [];
    for (const id of touchedCentres(walkedCells(walk.locations as Location[]))) {
      let days = daysByBlock.get(id);
      if (!days) {
        days = new Set();
        daysByBlock.set(id, days);
      }
      days.add(day);
      if (days.size < CORNER_CONFIG.minDays || blocked.has(id)) continue;
      const { ix, iy } = parseCellKey(id);
      const at = centreOf(ix, iy);
      if ((home && distanceM(at, home) < CORNER_CONFIG.homeExcludeM) || existing.some((e) => distanceM(at, e) < CORNER_CONFIG.minSpacingM)) {
        blocked.add(id);
        continue;
      }
      candidates.push({ id, ix, iy, days: days.size, at });
    }
    // Pacing: a qualified block waits (it keeps its days) until a walk comes along after the quiet period.
    const resting = lastCreatedAt !== null && calendarDayGap(lastCreatedAt, walk.startTime) < CORNER_CONFIG.minDaysBetweenNewCorners;
    let pool = resting ? [] : candidates;
    for (let n = 0; n < CORNER_CONFIG.maxNewPerWalk && pool.length > 0; n++) {
      const chosen = pickCentre(pool);
      created.push({ id: chosen.id, ix: chosen.ix, iy: chosen.iy, createdAt: walk.startTime, walkId: walk.id });
      existing.push(chosen.at);
      lastCreatedAt = walk.startTime;
      pool = pool.filter((c) => distanceM(c.at, chosen.at) >= CORNER_CONFIG.minSpacingM);
    }
  }
  const knownAt = known.map((k) => centreOf(k.ix, k.iy));
  return created.filter((c) => {
    const at = centreOf(c.ix, c.iy);
    return knownAt.every((k) => distanceM(at, k) >= CORNER_CONFIG.minSpacingM);
  });
}

/** The corners whose block the walk's path runs through, the one it spent the most path in first. */
export function cornersTouchedBy(walk: Pick<CornerWalk, 'locations'>, corners: ReadonlyArray<{ id: CornerId; ix: number; iy: number }>): CornerId[] {
  if (corners.length === 0 || walk.locations.length < 2) return [];
  const cells = walkedCells(walk.locations as Location[]);
  const r = CORNER_CONFIG.blockRadiusCells;
  const counts: Array<{ id: CornerId; n: number }> = [];
  for (const c of corners) {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (cells.has(cellKey(c.ix + dx, c.iy + dy))) n++;
    if (n > 0) counts.push({ id: c.id, n });
  }
  return counts.sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1)).map((c) => c.id);
}

/**
 * The corners to show: never two within `displayDedupeM` (two phones can briefly hold different ids for one street until
 * they have synced). A named corner beats an unnamed one, then the older one, then the lower id: the same pick on every phone.
 */
export function resolveCorners<T extends { id: CornerId; ix: number; iy: number; createdAt: number; name: string | null }>(corners: readonly T[]): T[] {
  const ordered = [...corners].sort((a, b) => Number(b.name !== null) - Number(a.name !== null) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const kept: T[] = [];
  for (const c of ordered) {
    const at = centreOf(c.ix, c.iy);
    if (kept.every((k) => distanceM(at, centreOf(k.ix, k.iy)) >= CORNER_CONFIG.displayDedupeM)) kept.push(c);
  }
  return kept;
}

/** The centre of a corner as [lat, lon] (street lookup, map placement). */
export function cornerLatLon(corner: { ix: number; iy: number }): [number, number] {
  return cellCentre(corner.ix, corner.iy);
}

const CORNER_ID_REGEX = new RegExp(CORNER_ID_PATTERN);

/** `"ix,iy"` -> cell coordinates, or null when it is not a well-formed corner id. */
export function parseCornerId(id: string): { ix: number; iy: number } | null {
  if (!CORNER_ID_REGEX.test(id)) return null;
  return parseCellKey(id);
}

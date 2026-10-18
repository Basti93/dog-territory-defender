// The Home Range grid — pure functions, no I/O. See
// docs/decisions/2026-08-21-home-range.md (Decisions 1, 2, 5) and its
// home-range-prototype.mjs, which validated every formula below against
// simulated GPS data before this file existed. Do not re-derive these
// numbers from first principles; they're anchored to that script's real
// output (design.md quotes it throughout).
//
// Two layers this module deliberately does NOT implement, because they
// belong to the sibling change home-range-rewards: bloomMultiplier (the
// Fresh Ground treats bonus) and any manual-log refresh logic. This module
// only paints cells, ages them, and detects new ground.

import { Location } from '../types';

/** Grid cell edge length, metres. See design.md Decision 1. */
export const CELL_M = 20;

/** A walk paints every cell whose centre lies within this of the walked path. */
export const PAINT_RADIUS_M = 25;

/** Resample the path this finely (metres) before stamping cells, so a long
 * GPS gap between fixes doesn't leave holes in the painted ribbon. */
const SAMPLE_STEP_M = 5;

/** Longer than this between consecutive GPS fixes = signal loss; don't paint through it. */
export const MAX_SEGMENT_M = 60;

/** Faster than this between consecutive GPS fixes = not a dog walk (bike/tram/car); don't paint it. */
export const MAX_SEGMENT_SPEED_MS = 4.5;

// Dropout bridge — only the DISTANCE rule uses these (geometry.ts's stepCountsAsDistance), never the paint filter above.
// A step longer than MAX_SEGMENT_M still counts as walked distance when it plainly is a signal dropout (tunnel, app
// resumed after a kill) and not a ride: short enough, quick enough to be a pause, and at a strolling pace on average.
// docs/specs/walk-lifecycle.md "Distance rule" has the reasoning.

/** A dropout step may be at most this long, metres. */
export const DROPOUT_BRIDGE_MAX_M = 250;

/** A dropout step may span at most this much time, seconds. */
export const DROPOUT_BRIDGE_MAX_S = 180;

/** A dropout step's average speed over the whole gap may be at most this, m/s (a stroll; a tram or car is far above). */
export const DROPOUT_BRIDGE_MAX_SPEED_MS = 2.0;

/** Freshness curve time constant, days. See design.md Decision 2. */
const TAU_DAYS = 5;

/** Wildness reaches its ceiling at this many days and stops changing after. */
const D_MAX_DAYS = 18;

const WILD_DENOM = 1 - Math.exp(-D_MAX_DAYS / TAU_DAYS);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Dilated set-difference threshold for New Ground detection. See design.md Decision 5. */
export const NEW_GROUND_MIN_CELLS = 12;

/**
 * The single qualifying-ground floor this change reuses for two purposes:
 * suppressing a Fresh Ground bonus on a stub walk (home-range-rewards, not
 * yet wired) and — per this change's Technical Split Addendum — gating base
 * treats/XP eligibility on a live-tracked "Finish Walk", replacing the
 * deleted canCloseWalk loop-closure gate. ~200m of real ground covered.
 */
export const MIN_CELLS_FOR_REWARD = 25;

/**
 * "No movement" for a tracked walk (see walkHasMovement in geometry.ts): every fix within NO_MOVEMENT_RADIUS_M of the
 * first one, OR under this walked distance (metres) AND under NO_MOVEMENT_CELLS_BELOW painted cells. Such a walk is discarded instead of saved (docs/specs/walk-lifecycle.md).
 */
export const NO_MOVEMENT_MAX_DISTANCE_M = 50;

/**
 * The jitter half of the no-movement rule: a walk whose every fix lies within this many metres of its FIRST fix never
 * went anywhere, even if GPS noise summed up to more than NO_MOVEMENT_MAX_DISTANCE_M of "distance" (a phone left standing).
 */
export const NO_MOVEMENT_RADIUS_M = 40;

/**
 * The cell half of the no-movement rule. Measured with PAINT_RADIUS_M 25 and CELL_M 20: a walk that never leaves one
 * spot already paints about 5 cells (the start point's footprint) and 50 m of walking about 12, so a floor of 2 could
 * never hold; 13 is "less ground than 50 m of walking paints". It only backs up the distance test.
 */
export const NO_MOVEMENT_CELLS_BELOW = 13;

/**
 * Divisor used to turn a raw Range cell count into the "Buddy knows N
 * streets" headline stat. Also reused by docs/decisions/somewhere-wild.md's
 * `src/utils/wildSpot.ts` as its minimum wild-cluster size (a cluster
 * smaller than one street's worth of cells isn't worth surfacing) — hence
 * the export, so that module imports this number rather than re-declaring
 * it.
 */
export const CELLS_PER_STREET = 11;

const M_PER_DEG_LAT = 111320;
const D_LAT = CELL_M / M_PER_DEG_LAT;

export interface CellCoord {
  ix: number;
  iy: number;
}

/** Canonical cell identifier, `"${ix},${iy}"` — usable directly as a Set/Map key or storage row key. */
export type CellId = string;

export function cellKey(ix: number, iy: number): CellId {
  return `${ix},${iy}`;
}

export function parseCellKey(id: CellId): CellCoord {
  const [ix, iy] = id.split(',').map(Number);
  return { ix, iy };
}

// dLon depends only on the row index, never on the point's own longitude, so
// the cell mapping is a pure function with no drift and no ambiguity at cell
// boundaries. See design.md Decision 1.
function dLonForRow(iy: number): number {
  return CELL_M / (M_PER_DEG_LAT * Math.cos((iy + 0.5) * D_LAT * (Math.PI / 180)));
}

export function cellForLocation(lat: number, lon: number): CellCoord {
  const iy = Math.floor(lat / D_LAT);
  const ix = Math.floor(lon / dLonForRow(iy));
  return { ix, iy };
}

/**
 * A cell's centre point, `[lat, lon]`. Exported for
 * docs/decisions/somewhere-wild.md's `src/utils/streetLookup.ts`, which
 * reverse-geocodes a wild cluster's anchor cell centre — the same
 * per-row-longitude convention `cellForLocation` uses, so this is the exact
 * inverse of that function, not a separate approximation.
 */
export function cellCentre(ix: number, iy: number): [number, number] {
  return [(iy + 0.5) * D_LAT, (ix + 0.5) * dLonForRow(iy)];
}

// Flat-earth metre distance — the same approximation home-range-prototype.mjs
// validated every worked number in design.md against. Accurate enough at the
// <100m scale this is ever called at, and much cheaper than haversine when
// called ~25 times per resampled path point during painting.
function metresBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dy = (lat2 - lat1) * M_PER_DEG_LAT;
  const dx = (lon2 - lon1) * M_PER_DEG_LAT * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
}

/**
 * Wildness — 0 (freshly refreshed) to 1 (fully wild) — as a function of
 * elapsed time since a cell's `lastRefreshed` clock. Reaches its ceiling at
 * exactly 18 days and never changes after that (design.md's "stops getting
 * worse" rule, enforced by construction via the WILD_DENOM normalizer, not a
 * tolerance check).
 */
export function wildness(lastRefreshedMs: number, nowMs: number): number {
  const days = (nowMs - lastRefreshedMs) / MS_PER_DAY;
  if (days <= 0) return 0;
  if (days >= D_MAX_DAYS) return 1;
  return (1 - Math.exp(-days / TAU_DAYS)) / WILD_DENOM;
}

/**
 * The core paint operation: every cell whose centre lies within
 * PAINT_RADIUS_M of `locations`' path, resampled every SAMPLE_STEP_M between
 * consecutive fixes. Segments that fail either anti-exploit guard (too long
 * a gap, or too fast to be a dog walk) are skipped entirely — nothing is
 * painted through them. Called identically by a live walk's Finish Walk
 * (section 4) and the one-time migration backfill (section 3); there is
 * exactly one implementation.
 */
export function paintedCells(locations: Location[]): Set<CellId> {
  const cells = new Set<CellId>();

  const stamp = (lat: number, lon: number) => {
    const { ix: cx, iy: cy } = cellForLocation(lat, lon);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const ix = cx + dx;
        const iy = cy + dy;
        const [clat, clon] = cellCentre(ix, iy);
        if (metresBetween(lat, lon, clat, clon) <= PAINT_RADIUS_M) {
          cells.add(cellKey(ix, iy));
        }
      }
    }
  };

  forEachPathPoint(locations, SAMPLE_STEP_M, stamp);
  return cells;
}

/** Walk the resampled path with the same anti-exploit guards for painting and for corner detection: no point is visited through a dropout or a ride. */
function forEachPathPoint(locations: Location[], stepM: number, visit: (lat: number, lon: number) => void): void {
  if (locations.length === 0) return;
  visit(locations[0].latitude, locations[0].longitude);

  for (let i = 1; i < locations.length; i++) {
    const a = locations[i - 1];
    const b = locations[i];
    const distance = metresBetween(a.latitude, a.longitude, b.latitude, b.longitude);
    if (distance > MAX_SEGMENT_M) continue;

    const dtSeconds = (b.timestamp - a.timestamp) / 1000;
    if (dtSeconds > 0 && distance / dtSeconds > MAX_SEGMENT_SPEED_MS) continue;

    const steps = Math.max(1, Math.ceil(distance / stepM));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      visit(a.latitude + (b.latitude - a.latitude) * u, a.longitude + (b.longitude - a.longitude) * u);
    }
  }
}

/** Finer than a cell (20 m) is never needed to find every cell a path runs through. */
const WALKED_STEP_M = 10;

/**
 * The cells the walked path itself runs through: no paint radius, same dropout and speed guards as `paintedCells`.
 * Corner detection uses it, so a street 40 m away does not count as passing a corner.
 */
export function walkedCells(locations: Location[]): Set<CellId> {
  const cells = new Set<CellId>();
  forEachPathPoint(locations, WALKED_STEP_M, (lat, lon) => {
    const { ix, iy } = cellForLocation(lat, lon);
    cells.add(cellKey(ix, iy));
  });
  return cells;
}

/**
 * New Ground: cells this walk painted that are neither already in the Range
 * nor 8-neighbour-adjacent to a Range cell. The dilation is what keeps
 * ordinary GPS jitter on an already-known route from firing this on every
 * pass — see design.md Decision 5's false-positive/true-positive sweep.
 * Compare `.size` against NEW_GROUND_MIN_CELLS to decide whether New Ground
 * actually fires.
 */
export function newGroundCells(painted: Set<CellId>, range: Set<CellId>): Set<CellId> {
  const result = new Set<CellId>();
  for (const c of painted) {
    if (range.has(c)) continue;
    const { ix, iy } = parseCellKey(c);
    let touchesRange = false;
    for (let dy = -1; dy <= 1 && !touchesRange; dy++) {
      for (let dx = -1; dx <= 1 && !touchesRange; dx++) {
        if (range.has(cellKey(ix + dx, iy + dy))) touchesRange = true;
      }
    }
    if (!touchesRange) result.add(c);
  }
  return result;
}

/** One contiguous run of a walk's trail, all the same color. See splitTrailByNewGround. */
export interface TrailRun {
  color: 'base' | 'new-ground';
  points: Location[];
}

/**
 * Splits an ordered trail into contiguous same-color runs for the Walk
 * Portrait's two-color trail (docs/decisions/walk-portrait.md
 * Decision 4) — each point is mapped to its cell via cellForLocation and
 * colored 'new-ground' if that cell is in newGroundCellIds, 'base'
 * otherwise. A missing or empty newGroundCellIds produces exactly one
 * all-'base' run, covering both "this walk genuinely had no New Ground" and
 * "this walk was saved before newGroundCellIds existed" identically, by
 * construction — no special-casing needed for either. Returns an empty array
 * for an empty trail.
 */
export function splitTrailByNewGround(locations: Location[], newGroundCellIds?: string[]): TrailRun[] {
  const newGroundSet = new Set(newGroundCellIds ?? []);
  const runs: TrailRun[] = [];

  for (const loc of locations) {
    const { ix, iy } = cellForLocation(loc.latitude, loc.longitude);
    const color: TrailRun['color'] = newGroundSet.has(cellKey(ix, iy)) ? 'new-ground' : 'base';
    const currentRun = runs[runs.length - 1];
    if (currentRun && currentRun.color === color) {
      currentRun.points.push(loc);
    } else {
      runs.push({ color, points: [loc] });
    }
  }

  return runs;
}

/**
 * "Buddy knows N streets" — a count of things, not a percentage of anything,
 * so it has no denominator and implies no finish line. See design.md
 * Decision 5. Computed here (this change owns the Range data); displayed by
 * home-range-rewards.
 */
export function streetsKnown(rangeCellCount: number): number {
  return rangeCellCount > 0 ? Math.max(1, Math.floor(rangeCellCount / CELLS_PER_STREET)) : 0;
}

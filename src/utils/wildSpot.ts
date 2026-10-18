// Wild-cluster selection — pure functions, no I/O. See
// docs/decisions/somewhere-wild/design.md Decision 3. Finds the single
// most-worth-visiting wild patch of the player's Home Range (not one per
// patch), so the marker/card can point at exactly one spot.

import { BALANCE } from '../economy/balanceConfig';
import { Cell } from '../storage/HomeRangeRepository';
import { CellCoord, CellId, cellKey, CELLS_PER_STREET, parseCellKey, wildness } from './grid';

/**
 * The wild-threshold bonus must be WILD_MARGIN times the bonus at the
 * Fresh Ground display-suppression floor — not just one rounding step past
 * it. See design.md Decision 2's "Second correction": a bare break-even
 * derivation (no margin) gave WILD_THRESHOLD = 0.45 at today's K, a much
 * lower and much less rare bar than intended. 1.8 is the original
 * hand-picked 0.75 reverse-engineered — at K=0.6 the floor bonus is 0.25
 * and 0.75's bonus is 0.45, exactly 1.8x.
 */
const WILD_MARGIN = 1.8;

/**
 * The wild-cluster threshold — see design.md Decision 2. Derived from
 * home-range-rewards' own BALANCE constants (never hardcoded), rounded UP
 * to the nearest 0.05 so a cell right at the computed value clears the
 * Fresh Ground display-suppression floor with a WILD_MARGIN-sized margin,
 * not exactly on it, then clamped to [0.60, 0.95] so the derivation can't
 * degrade to "always true" or "impossible" at the extremes of BALANCE.
 * freshGround.k's documented sweep range. If BALANCE.freshGround.k is ever
 * retuned, this recomputes automatically — grep for BALANCE.freshGround.k
 * if you're the one retuning it. (Also baked as a literal into
 * src/web/homeRangeRendererScript.ts's vanilla-JS string for the second
 * contour, since that file has no import access at WebView runtime — same
 * formula, independently computed there for that reason.)
 */
export const WILD_THRESHOLD = Math.min(
  0.95,
  Math.max(
    0.6,
    Math.ceil(
      (WILD_MARGIN * (BALANCE.freshGround.displayThresholdMultiplier - 1)) / BALANCE.freshGround.k / 0.05
    ) * 0.05
  )
);

export interface WildClusterBounds {
  minIx: number;
  maxIx: number;
  minIy: number;
  maxIy: number;
}

export interface WildCluster {
  /** The highest-visits cell in the winning cluster (ties broken by lowest (ix, iy)) — where the marker is placed and where the label's primary reverse-geocode point comes from. */
  anchor: CellCoord;
  /** Canonical id of `anchor` — used to cache a resolved label and to key the card copy's variant rotation (design.md's "Card copy" section). */
  anchorCellId: CellId;
  /** Every cell belonging to the winning cluster, including the anchor. */
  cellIds: ReadonlySet<CellId>;
  /** Inclusive cell-index bounding box of the cluster — a cheap pre-filter for streetLookup.ts's fallback walk-history scan, before the more expensive paintedCells() overlap check. */
  bounds: WildClusterBounds;
  /** Sum of `visits` across every cell in the cluster — clusters are ranked by this, not by wildness (past the 18-day ceiling every wildness value is flat at 1.0 and would rank arbitrarily). */
  visitsSum: number;
}

/** Lowest (ix, iy) first — ix primary, iy secondary. The shared tie-break convention for both cluster selection and anchor selection (design.md Decision 3's "Determinism additions"). */
function compareCoord(a: CellCoord, b: CellCoord): number {
  if (a.ix !== b.ix) return a.ix - b.ix;
  return a.iy - b.iy;
}

function neighborsOf({ ix, iy }: CellCoord): CellCoord[] {
  const out: CellCoord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      out.push({ ix: ix + dx, iy: iy + dy });
    }
  }
  return out;
}

/**
 * The single most-worth-visiting wild cluster in the Range, or `null` when
 * none qualifies (no cell reaches WILD_THRESHOLD, or every wild patch is
 * smaller than CELLS_PER_STREET) — the "neither" card state's data-level
 * precondition (design.md's own guardrail: degrade to nothing, not a
 * broken/empty state).
 */
export function wildestCluster(cells: Cell[], nowMs: number): WildCluster | null {
  const byId = new Map<CellId, Cell>();
  const candidates = new Set<CellId>();

  for (const cell of cells) {
    const id = cellKey(cell.ix, cell.iy);
    byId.set(id, cell);
    if (wildness(cell.lastRefreshed, nowMs) >= WILD_THRESHOLD) {
      candidates.add(id);
    }
  }

  const visited = new Set<CellId>();
  let winner: { ids: CellId[]; visitsSum: number; representative: CellCoord } | null = null;

  for (const startId of candidates) {
    if (visited.has(startId)) continue;

    // 8-neighbour flood fill over the candidate set.
    const componentIds: CellId[] = [];
    const stack: CellId[] = [startId];
    visited.add(startId);
    while (stack.length > 0) {
      const id = stack.pop() as CellId;
      componentIds.push(id);
      const coord = parseCellKey(id);
      for (const neighbor of neighborsOf(coord)) {
        const neighborId = cellKey(neighbor.ix, neighbor.iy);
        if (candidates.has(neighborId) && !visited.has(neighborId)) {
          visited.add(neighborId);
          stack.push(neighborId);
        }
      }
    }

    if (componentIds.length < CELLS_PER_STREET) continue;

    let visitsSum = 0;
    let representative: CellCoord | null = null;
    for (const id of componentIds) {
      visitsSum += byId.get(id)?.visits ?? 0;
      const coord = parseCellKey(id);
      if (representative === null || compareCoord(coord, representative) < 0) {
        representative = coord;
      }
    }

    const candidate = { ids: componentIds, visitsSum, representative: representative as CellCoord };

    if (
      winner === null ||
      candidate.visitsSum > winner.visitsSum ||
      (candidate.visitsSum === winner.visitsSum &&
        (candidate.ids.length > winner.ids.length ||
          (candidate.ids.length === winner.ids.length && compareCoord(candidate.representative, winner.representative) < 0)))
    ) {
      winner = candidate;
    }
  }

  if (winner === null) return null;

  // Anchor: the highest-visits cell in the winning component, ties broken
  // by lowest (ix, iy) — same convention as the cluster-selection tie-break
  // above (design.md Decision 3's "Determinism additions").
  let anchor: CellCoord | null = null;
  let anchorVisits = -1;
  for (const id of winner.ids) {
    const coord = parseCellKey(id);
    const visits = byId.get(id)?.visits ?? 0;
    if (
      anchor === null ||
      visits > anchorVisits ||
      (visits === anchorVisits && compareCoord(coord, anchor) < 0)
    ) {
      anchor = coord;
      anchorVisits = visits;
    }
  }

  const bounds = winner.ids.reduce<WildClusterBounds>(
    (acc, id) => {
      const { ix, iy } = parseCellKey(id);
      return {
        minIx: Math.min(acc.minIx, ix),
        maxIx: Math.max(acc.maxIx, ix),
        minIy: Math.min(acc.minIy, iy),
        maxIy: Math.max(acc.maxIy, iy),
      };
    },
    { minIx: Infinity, maxIx: -Infinity, minIy: Infinity, maxIy: -Infinity }
  );

  return {
    anchor: anchor as CellCoord,
    anchorCellId: cellKey((anchor as CellCoord).ix, (anchor as CellCoord).iy),
    cellIds: new Set(winner.ids),
    bounds,
    visitsSum: winner.visitsSum,
  };
}

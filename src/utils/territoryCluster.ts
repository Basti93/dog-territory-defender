// Territory clustering/merge algorithm — pure functions, no I/O. See
// docs/decisions/territories/design.md Decisions 1-3. Runs once per
// finished tracked walk (App.tsx's finishWalk) and once per cell during the
// one-time migration backfill (storage/territoryMigration.ts) — there is
// exactly one implementation of the algorithm, reused by both callers.

import { Cell } from '../storage/HomeRangeRepository';
import { TerritoryId } from '../storage/TerritoryRepository';
import { getDistance } from './geometry';
import { CellCoord, CellId, cellCentre, cellKey, parseCellKey } from './grid';

/**
 * Assimilation/birth threshold, metres — see design.md Decision 2. Newly
 * painted ground within this of exactly one existing Territory joins it
 * without needing to literally touch it (a park walked around, not through,
 * shouldn't fragment one neighborhood into two Territories). Deliberately a
 * reasonable first-pass default, not a game-economist-validated number — see
 * Decision 2's "safe to retune later" note. NEVER used for the merge check
 * below, which uses literal 8-neighbour adjacency instead (a much stricter,
 * intentionally different threshold — see Decision 2's "two different
 * questions" reasoning).
 */
export const SPAWN_DISTANCE_M = 400;

interface Bounds {
  minIx: number;
  maxIx: number;
  minIy: number;
  maxIy: number;
}

/** Lowest (ix, iy) first — ix primary, iy secondary. Same tie-break convention wildSpot.ts's cluster/anchor selection already uses. */
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

function distanceBetweenCells(a: CellCoord, b: CellCoord): number {
  const [aLat, aLon] = cellCentre(a.ix, a.iy);
  const [bLat, bLon] = cellCentre(b.ix, b.iy);
  return getDistance(aLat, aLon, bLat, bLon);
}

function boundsOfCoords(coords: CellCoord[]): Bounds {
  return coords.reduce<Bounds>(
    (acc, { ix, iy }) => ({
      minIx: Math.min(acc.minIx, ix),
      maxIx: Math.max(acc.maxIx, ix),
      minIy: Math.min(acc.minIy, iy),
      maxIy: Math.max(acc.maxIy, iy),
    }),
    { minIx: Infinity, maxIx: -Infinity, minIy: Infinity, maxIy: -Infinity }
  );
}

/** Cheap bounding-box pre-filter before the exact distance check — mirrors streetLookup.ts's rectsOverlap shape (design.md Decision 2's "Rejected" section). A generous cell-index margin (not metre-exact — real rejection is the exact distance check below, this is only a perf short-circuit). */
const CELL_M_FOR_MARGIN = 20; // utils/grid.ts's CELL_M, duplicated as a literal to avoid a cross-module numeric coupling for what is only a perf pre-filter, not a correctness boundary.
const BOUNDS_MARGIN_CELLS = Math.ceil(SPAWN_DISTANCE_M / CELL_M_FOR_MARGIN) + 2;

function candidateMayBeNear(candidate: CellCoord, bounds: Bounds): boolean {
  return (
    candidate.ix >= bounds.minIx - BOUNDS_MARGIN_CELLS &&
    candidate.ix <= bounds.maxIx + BOUNDS_MARGIN_CELLS &&
    candidate.iy >= bounds.minIy - BOUNDS_MARGIN_CELLS &&
    candidate.iy <= bounds.maxIy + BOUNDS_MARGIN_CELLS
  );
}

/** Tiny union-find — at most a handful of distinct territory ids in practice per walk (design.md Decision 3 Step 4). */
class UnionFind<T> {
  private parent = new Map<T, T>();

  private find(x: T): T {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x) as T;
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: T, b: T): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }

  groups(): Map<T, T[]> {
    const out = new Map<T, T[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const list = out.get(root) ?? [];
      list.push(key);
      out.set(root, list);
    }
    return out;
  }
}

export interface TerritoryBirth {
  /** A temporary, in-plan-only key (not a real TerritoryId) — the caller creates a real Territory via TerritoryRepository.createTerritory and substitutes the real id everywhere this key appears (newCellAssignments, creditedTerritoryId) before persisting. */
  provisionalId: string;
  /** The founding ground's lowest-(ix,iy) cell — where the reverse-geocode name lookup anchors (design.md Decision 5). */
  anchorCell: CellCoord;
  cellIds: CellId[];
}

export interface TerritoryMerge {
  survivorId: TerritoryId;
  loserId: TerritoryId;
}

export interface TerritoryChangePlan {
  /**
   * Territory assignment for every cell in this walk's `newCells` only — an
   * existing TerritoryId for an assimilated cell, or a birth's
   * `provisionalId` for an orphaned one. Cells this walk merely re-covered
   * (already in the Range) are deliberately omitted: their territoryId is
   * already set and is never touched by a repaint, only by a merge.
   */
  newCellAssignments: Map<CellId, TerritoryId | string>;
  births: TerritoryBirth[];
  merges: TerritoryMerge[];
  /**
   * The single territory credited with this walk's stats (walksHere += 1,
   * treatsEarnedHere += this walk's treatsAwarded) — design.md Decision 3
   * Step 5's majority-cell attribution. A real existing TerritoryId, or a
   * birth's `provisionalId` when this walk's only territory is a brand-new
   * one.
   */
  creditedTerritoryId: TerritoryId | string;
  /** Whether the player already had at least one Territory before this walk — gates the "the player's very first-ever territory is silent" celebration rule (design.md Decision 3, tasks.md task 6.2). */
  hadExistingTerritoryBefore: boolean;
}

/**
 * Resolves this walk's territory birth/assimilation/merge/attribution plan —
 * design.md Decision 3's five steps, exactly. No I/O: the caller persists
 * the returned plan (creating real Territories for each birth, reassigning
 * cells for each merge, incrementing the credited territory's stats).
 *
 * `territoryCreatedAt` supplies each existing TerritoryId's createdAt (the
 * "older wins" merge-survivor rule needs it) — the caller fetches this once
 * via TerritoryRepository.getTerritories() before calling. A birth's
 * provisional id can never end up needing this: by construction (an orphan
 * is, by definition, farther than SPAWN_DISTANCE_M from every existing
 * territory, and literal adjacency implies a distance far smaller than that)
 * a newly-born territory can never be merge-adjacent to an existing one on
 * its own birth walk — see design.md Decision 2's threshold reasoning.
 */
export function resolveTerritoryChanges(
  rangeBeforeCells: readonly Cell[],
  paintedCellIds: ReadonlySet<CellId>,
  now: number,
  territoryCreatedAt: ReadonlyMap<TerritoryId, number>
): TerritoryChangePlan {
  const rangeBeforeSet = new Set<CellId>();
  const cellTerritoryOf = new Map<CellId, TerritoryId>();
  const territoryCoords = new Map<TerritoryId, CellCoord[]>();

  for (const cell of rangeBeforeCells) {
    const id = cellKey(cell.ix, cell.iy);
    rangeBeforeSet.add(id);
    if (cell.territoryId) {
      cellTerritoryOf.set(id, cell.territoryId);
      const list = territoryCoords.get(cell.territoryId) ?? [];
      list.push({ ix: cell.ix, iy: cell.iy });
      territoryCoords.set(cell.territoryId, list);
    }
  }

  const territoryBounds = new Map<TerritoryId, Bounds>();
  for (const [territoryId, coords] of territoryCoords) {
    territoryBounds.set(territoryId, boundsOfCoords(coords));
  }

  const hadExistingTerritoryBefore = territoryCoords.size > 0;

  const allPainted = Array.from(paintedCellIds);
  const newCells = allPainted.filter((id) => !rangeBeforeSet.has(id)).sort((a, b) => compareCoord(parseCellKey(a), parseCellKey(b)));
  const knownCells = allPainted.filter((id) => rangeBeforeSet.has(id));

  const newCellAssignments = new Map<CellId, TerritoryId | string>();
  const births: TerritoryBirth[] = [];
  const merges: TerritoryMerge[] = [];

  if (newCells.length > 0) {
    // Step 1 — assimilate-or-orphan, once per new cell, against the
    // rangeBefore snapshot only (never against cells resolved earlier in
    // this same pass — design.md Decision 3's own wording, kept
    // order-independent/deterministic).
    const orphans: CellId[] = [];
    for (const cellId of newCells) {
      const coord = parseCellKey(cellId);
      let nearestTerritoryId: TerritoryId | null = null;
      let nearestDistance = Infinity;

      for (const [territoryId, bounds] of territoryBounds) {
        if (!candidateMayBeNear(coord, bounds)) continue;
        for (const territoryCell of territoryCoords.get(territoryId) ?? []) {
          const distance = distanceBetweenCells(coord, territoryCell);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestTerritoryId = territoryId;
          }
        }
      }

      if (nearestTerritoryId !== null && nearestDistance <= SPAWN_DISTANCE_M) {
        newCellAssignments.set(cellId, nearestTerritoryId);
      } else {
        orphans.push(cellId);
      }
    }

    // Step 2 — group orphans into new territories: 8-neighbour-OR-within-
    // SPAWN_DISTANCE_M connected components, reusing wildSpot.ts's flood-fill
    // shape and lowest-(ix,iy) tie-break convention for determinism.
    const orphanSet = new Set(orphans);
    const visited = new Set<CellId>();
    let birthIndex = 0;

    for (const startId of orphans) {
      if (visited.has(startId)) continue;

      const componentIds: CellId[] = [];
      const stack: CellId[] = [startId];
      visited.add(startId);

      while (stack.length > 0) {
        const id = stack.pop() as CellId;
        componentIds.push(id);
        const coord = parseCellKey(id);

        for (const otherId of orphanSet) {
          if (visited.has(otherId) || otherId === id) continue;
          const otherCoord = parseCellKey(otherId);
          const isNeighbour = neighborsOf(coord).some((n) => n.ix === otherCoord.ix && n.iy === otherCoord.iy);
          const isWithinSpawnDistance = !isNeighbour && distanceBetweenCells(coord, otherCoord) <= SPAWN_DISTANCE_M;
          if (isNeighbour || isWithinSpawnDistance) {
            visited.add(otherId);
            stack.push(otherId);
          }
        }
      }

      const anchorCell = componentIds.map(parseCellKey).sort(compareCoord)[0];
      const provisionalId = `new-territory-${birthIndex++}`;
      births.push({ provisionalId, anchorCell, cellIds: componentIds });
      for (const id of componentIds) {
        newCellAssignments.set(id, provisionalId);
      }
    }

    // Step 4 — merge check, bounded to this walk's own footprint: scan every
    // new cell plus its immediate 8 neighbours for adjacent cells whose
    // resolved territory differs. Only "real" (already-existing) territory
    // ids can ever participate — a birth's provisionalId cannot, by the
    // construction reasoned in this function's own doc comment.
    const resolvedTerritoryOf = (id: CellId): TerritoryId | string | undefined =>
      newCellAssignments.get(id) ?? cellTerritoryOf.get(id);

    const mergeUnionFind = new UnionFind<TerritoryId>();
    const realTerritoryIdsInvolved = new Set<TerritoryId>();

    for (const cellId of newCells) {
      const ownResolved = resolvedTerritoryOf(cellId);
      if (ownResolved === undefined) continue;
      const coord = parseCellKey(cellId);

      for (const neighbourCoord of neighborsOf(coord)) {
        const neighbourId = cellKey(neighbourCoord.ix, neighbourCoord.iy);
        const neighbourResolved = resolvedTerritoryOf(neighbourId);
        if (neighbourResolved === undefined || neighbourResolved === ownResolved) continue;

        const ownIsReal = territoryCreatedAt.has(ownResolved);
        const neighbourIsReal = territoryCreatedAt.has(neighbourResolved);
        if (ownIsReal && neighbourIsReal) {
          mergeUnionFind.union(ownResolved, neighbourResolved);
          realTerritoryIdsInvolved.add(ownResolved);
          realTerritoryIdsInvolved.add(neighbourResolved);
        }
        // If exactly one side is real and the other is a provisional birth,
        // this would violate the construction invariant above — skip
        // rather than merge a not-yet-created territory (defensive; should
        // never trigger given SPAWN_DISTANCE_M/adjacency's relative sizes).
      }
    }

    if (realTerritoryIdsInvolved.size > 0) {
      for (const group of mergeUnionFind.groups().values()) {
        const distinctIds = Array.from(new Set(group));
        if (distinctIds.length < 2) continue;
        const survivorId = distinctIds
          .slice()
          .sort((a, b) => (territoryCreatedAt.get(a) ?? 0) - (territoryCreatedAt.get(b) ?? 0))[0];
        for (const id of distinctIds) {
          if (id !== survivorId) merges.push({ survivorId, loserId: id });
        }
      }
    }
  }

  // Step 5 — attribution: the single territory credited with this walk's
  // stats, by majority cell count over the FULL painted set (not just
  // newCells), resolved through this walk's own merges (a knownCell's
  // stored territoryId may itself be a loser merged away this very walk).
  const loserToSurvivor = new Map<TerritoryId, TerritoryId>(merges.map((m) => [m.loserId, m.survivorId]));
  const resolveFinal = (id: TerritoryId | string): TerritoryId | string => loserToSurvivor.get(id) ?? id;

  const counts = new Map<TerritoryId | string, number>();
  for (const cellId of allPainted) {
    const raw = newCellAssignments.get(cellId) ?? cellTerritoryOf.get(cellId);
    if (raw === undefined) continue; // defensive: should never happen — every painted cell is either new or known.
    const final = resolveFinal(raw);
    counts.set(final, (counts.get(final) ?? 0) + 1);
  }

  let creditedTerritoryId: TerritoryId | string = '';
  let creditedCount = -1;
  for (const [id, count] of Array.from(counts.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (count > creditedCount) {
      creditedCount = count;
      creditedTerritoryId = id;
    }
  }

  return { newCellAssignments, births, merges, creditedTerritoryId, hadExistingTerritoryBefore };
}

export interface CelebrationTerritoryBeat {
  /** Never set for the player's very first-ever Territory (design.md Decision 3's "silent first territory" rule) — tasks.md task 6.2's gating condition. */
  newTerritoryName: string | null;
  /** [survivor name, absorbed name] when this walk caused a merge. */
  mergedTerritoryNames: [string, string] | null;
}

/**
 * Decides which (if any) territory-related celebration beats this walk
 * should show — pure selection logic over an already-resolved plan, given
 * the caller's already-fetched name lookups (birth names come from
 * resolving each birth's reverse-geocode; existing-territory names come from
 * TerritoryRepository reads the caller already needed to do to persist
 * merges/attribution). See design.md Decision 3 and tasks.md tasks 6.2/6.3.
 *
 * When a single walk (rarely) both births a territory AND causes an
 * unrelated merge, both beats are returned — CelebrationScreen renders both
 * boxes, exactly as it already does for its other independent beats.
 */
export function resolveCelebrationTerritoryBeat(
  plan: Pick<TerritoryChangePlan, 'births' | 'merges' | 'hadExistingTerritoryBefore'>,
  birthNamesByProvisionalId: ReadonlyMap<string, string>,
  territoryNamesById: ReadonlyMap<TerritoryId, string>
): CelebrationTerritoryBeat {
  let newTerritoryName: string | null = null;
  if (plan.births.length > 0) {
    // The player's very first-ever territory is silent (nothing to contrast
    // it with yet) — but if this same walk births a SECOND one too (the
    // rare synthetic-segment-gap edge case), that second one still reads as
    // a real discovery.
    const birthToAnnounce = plan.hadExistingTerritoryBefore ? plan.births[0] : plan.births[1];
    if (birthToAnnounce) {
      newTerritoryName = birthNamesByProvisionalId.get(birthToAnnounce.provisionalId) ?? null;
    }
  }

  let mergedTerritoryNames: [string, string] | null = null;
  if (plan.merges.length > 0) {
    const [firstMerge] = plan.merges;
    const survivorName = territoryNamesById.get(firstMerge.survivorId);
    const loserName = territoryNamesById.get(firstMerge.loserId);
    if (survivorName && loserName) {
      mergedTerritoryNames = [survivorName, loserName];
    }
  }

  return { newTerritoryName, mergedTerritoryNames };
}

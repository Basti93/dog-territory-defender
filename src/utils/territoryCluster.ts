// Territory algorithm — pure functions, no I/O. See docs/specs/home-range.md ("Reviere") and
// docs/decisions/territories.md. Shared by the phone (offline players) and the server (households).
//
// Model: the OLDEST territory is "home". Every cell is home ground unless it lies more than SPAWN_DISTANCE_M from
// the home centre (homeCentreCell). Far ground stays home's (mass and income are split-invariant) until a connected
// patch of it has been walked on at least PROMOTE_MIN_WALKS walks and holds at least PROMOTE_MIN_CELLS cells:
// then it is promoted to a territory of its own (findPromotionCandidates + confirmPromotions). Territories
// only ever merge (8-neighbour touch, older survives); a shown territory never disappears or splits.

import { Cell } from '../storage/HomeRangeRepository';
import { TerritoryId } from '../storage/TerritoryRepository';
import { getDistance } from './geometry';
import { CornerWalk, homeAnchor } from './cornerDetection';
import { CellCoord, CellId, cellCentre, cellForLocation, cellKey, parseCellKey } from './grid';

/** Birth distance, metres, measured from the centre of the home territory (not from the nearest territory). Far ground within this of a shown territory joins it. Retune with a LOG entry. */
export const SPAWN_DISTANCE_M = 1000;
/** A far patch is shown as its own territory only after this many walks there ... */
export const PROMOTE_MIN_WALKS = 2;
/** ... and once it holds this many cells (about 800 m of walking). */
export const PROMOTE_MIN_CELLS = 40;

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
  /** A temporary, in-plan-only key (not a real TerritoryId); the caller creates the real Territory and substitutes its id. Only the player's very first territory is ever born here; every later one is a promotion. */
  provisionalId: string;
  /** The founding ground's lowest-(ix,iy) cell: where the reverse-geocode name lookup anchors. */
  anchorCell: CellCoord;
  cellIds: CellId[];
}

export interface TerritoryMerge {
  survivorId: TerritoryId;
  loserId: TerritoryId;
}

export interface TerritoryChangePlan {
  /**
   * Territory assignment for every cell in this walk's `newCells` only: an existing TerritoryId, or the first
   * birth's `provisionalId`. Cells this walk merely re-covered keep their territoryId (only a merge changes it).
   */
  newCellAssignments: Map<CellId, TerritoryId | string>;
  /** Empty, except for the very first territory of a player. */
  births: TerritoryBirth[];
  merges: TerritoryMerge[];
  /** The single territory credited with this walk's stats (walksHere += 1, treats): the one with most of the walk's painted cells (tie: lowest id string). */
  creditedTerritoryId: TerritoryId | string;
  /** Whether the player already had a territory before this walk (the very first one is silent). */
  hadExistingTerritoryBefore: boolean;
}

/** The home territory: the oldest one (tie: lowest id). `null` when there is none. */
export function pickHomeTerritoryId(territoryCreatedAt: ReadonlyMap<TerritoryId, number>): TerritoryId | null {
  let home: TerritoryId | null = null;
  for (const [id, createdAt] of territoryCreatedAt) {
    if (home === null) {
      home = id;
      continue;
    }
    const homeCreatedAt = territoryCreatedAt.get(home) as number;
    if (createdAt < homeCreatedAt || (createdAt === homeCreatedAt && id < home)) home = id;
  }
  return home;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * The centre of a territory: the median cell column and row. Robust on purpose: far patches that still count as
 * home ground (not yet promoted) must not drag the centre away from where the dog actually lives.
 */
export function territoryCentre(coords: readonly CellCoord[]): CellCoord | null {
  if (coords.length === 0) return null;
  return { ix: median(coords.map((c) => c.ix)), iy: median(coords.map((c) => c.iy)) };
}

/**
 * Where home is, as a cell: the same anchor the corners and the neighbours use (the first tracked walk's start, the
 * median start of the first walks later). Stable however much far ground the home territory has absorbed, so every
 * device and the server agree. Pass one entry per walk with at least its first fix. `null` without a tracked walk.
 */
export function homeCentreCell(walks: readonly CornerWalk[]): CellCoord | null {
  const anchor = homeAnchor(walks);
  return anchor ? cellForLocation(anchor.lat, anchor.lon) : null;
}

/**
 * Resolves this walk's territory assignment/merge/credit plan. No I/O: the caller persists the result
 * (assign cells, reassign for each merge, increment the credited territory's stats).
 *
 * New ground within SPAWN_DISTANCE_M of the home centre is home. Farther ground joins the nearest shown
 * territory within SPAWN_DISTANCE_M of its cells, else it is home ground too (a "candidate", see
 * findPromotionCandidates). `territoryCreatedAt` lists the territories that exist (the oldest is home).
 */
export function resolveTerritoryChanges(
  rangeBeforeCells: readonly Cell[],
  paintedCellIds: ReadonlySet<CellId>,
  now: number,
  territoryCreatedAt: ReadonlyMap<TerritoryId, number>,
  homeCentre: CellCoord | null = null
): TerritoryChangePlan {
  void now;
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

  const hadExistingTerritoryBefore = territoryCoords.size > 0;
  const allPainted = Array.from(paintedCellIds);
  const newCells = allPainted.filter((id) => !rangeBeforeSet.has(id)).sort((a, b) => compareCoord(parseCellKey(a), parseCellKey(b)));

  const newCellAssignments = new Map<CellId, TerritoryId | string>();
  const births: TerritoryBirth[] = [];
  const merges: TerritoryMerge[] = [];

  if (!hadExistingTerritoryBefore) {
    // The player's very first territory: all of this walk's new ground, one birth.
    if (newCells.length > 0) {
      const provisionalId = 'new-territory-0';
      births.push({ provisionalId, anchorCell: parseCellKey(newCells[0]), cellIds: newCells });
      for (const id of newCells) newCellAssignments.set(id, provisionalId);
    }
  } else if (newCells.length > 0) {
    const createdAtOf = new Map<TerritoryId, number>();
    for (const id of territoryCoords.keys()) createdAtOf.set(id, territoryCreatedAt.get(id) ?? 0);
    const homeId = pickHomeTerritoryId(createdAtOf) as TerritoryId;
    const centre = homeCentre ?? (territoryCentre(territoryCoords.get(homeId) ?? []) as CellCoord);

    const shownBounds = new Map<TerritoryId, Bounds>();
    for (const [id, coords] of territoryCoords) if (id !== homeId) shownBounds.set(id, boundsOfCoords(coords));

    for (const cellId of newCells) {
      const coord = parseCellKey(cellId);
      if (distanceBetweenCells(coord, centre) <= SPAWN_DISTANCE_M) {
        newCellAssignments.set(cellId, homeId);
        continue;
      }
      let nearest: TerritoryId = homeId;
      let nearestDistance = SPAWN_DISTANCE_M;
      for (const [id, bounds] of shownBounds) {
        if (!candidateMayBeNear(coord, bounds)) continue;
        for (const territoryCell of territoryCoords.get(id) ?? []) {
          const distance = distanceBetweenCells(coord, territoryCell);
          if (distance <= nearestDistance) {
            nearestDistance = distance;
            nearest = id;
          }
        }
      }
      newCellAssignments.set(cellId, nearest);
    }

    // Merge check, bounded to this walk's footprint: every new cell plus its 8 neighbours. Literal touching only.
    const resolvedTerritoryOf = (id: CellId): TerritoryId | string | undefined => newCellAssignments.get(id) ?? cellTerritoryOf.get(id);
    const mergeUnionFind = new UnionFind<TerritoryId>();
    let anyTouch = false;
    for (const cellId of newCells) {
      const ownResolved = resolvedTerritoryOf(cellId);
      if (ownResolved === undefined) continue;
      for (const neighbourCoord of neighborsOf(parseCellKey(cellId))) {
        const neighbourResolved = resolvedTerritoryOf(cellKey(neighbourCoord.ix, neighbourCoord.iy));
        if (neighbourResolved === undefined || neighbourResolved === ownResolved) continue;
        if (territoryCreatedAt.has(ownResolved) && territoryCreatedAt.has(neighbourResolved)) {
          mergeUnionFind.union(ownResolved, neighbourResolved);
          anyTouch = true;
        }
      }
    }
    if (anyTouch) {
      for (const group of mergeUnionFind.groups().values()) {
        const distinctIds = Array.from(new Set(group));
        if (distinctIds.length < 2) continue;
        const survivorId = distinctIds.slice().sort((a, b) => (territoryCreatedAt.get(a) ?? 0) - (territoryCreatedAt.get(b) ?? 0) || (a < b ? -1 : 1))[0];
        for (const id of distinctIds) if (id !== survivorId) merges.push({ survivorId, loserId: id });
      }
    }
  }

  // Attribution: majority cell count over the FULL painted set, resolved through this walk's own merges.
  const loserToSurvivor = new Map<TerritoryId, TerritoryId>(merges.map((m) => [m.loserId, m.survivorId]));
  const counts = new Map<TerritoryId | string, number>();
  for (const cellId of allPainted) {
    const raw = newCellAssignments.get(cellId) ?? cellTerritoryOf.get(cellId);
    if (raw === undefined) continue; // legacy cell without a territory
    const final = loserToSurvivor.get(raw) ?? raw;
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

// ---- promotion of far patches ----

export interface PromotionCandidate {
  cellIds: CellId[];
  /** Lowest-(ix,iy) cell: where the name lookup anchors. */
  anchorCell: CellCoord;
}

export interface TerritoryPromotion extends PromotionCandidate {
  /** Walks (this one included) that touched the patch. */
  walks: number;
}

/** Index distance below which two cells can be within SPAWN_DISTANCE_M (perf prefilter only; the exact check follows). */
const CONNECT_INDEX_SPAN = Math.ceil(SPAWN_DISTANCE_M / CELL_M_FOR_MARGIN) + 3;

/**
 * Far patches that this walk touched and that are big enough (PROMOTE_MIN_CELLS): connected pieces of home ground
 * lying beyond SPAWN_DISTANCE_M from the home centre. Cells are the state AFTER this walk was painted and merged.
 * A patch that physically touches other cells of the Range (a road out from home) is one place with home and is
 * never a candidate. Cheap, so the caller runs it first and only loads the walk history when it returns something.
 */
export function findPromotionCandidates(
  cells: readonly Cell[],
  territoryCreatedAt: ReadonlyMap<TerritoryId, number>,
  paintedThisWalk: ReadonlySet<CellId>,
  homeCentre: CellCoord | null = null
): PromotionCandidate[] {
  const owned = cells.filter((c) => c.territoryId && territoryCreatedAt.has(c.territoryId));
  if (owned.length === 0) return [];
  const createdAtOf = new Map<TerritoryId, number>();
  for (const c of owned) createdAtOf.set(c.territoryId as TerritoryId, territoryCreatedAt.get(c.territoryId as TerritoryId) as number);
  const homeId = pickHomeTerritoryId(createdAtOf) as TerritoryId;
  const homeCoords = owned.filter((c) => c.territoryId === homeId).map((c) => ({ ix: c.ix, iy: c.iy }));
  const centre = homeCentre ?? (territoryCentre(homeCoords) as CellCoord);
  const far = homeCoords.filter((c) => distanceBetweenCells(c, centre) > SPAWN_DISTANCE_M);
  if (far.length < PROMOTE_MIN_CELLS) return [];

  // Connected components of far cells: 8-neighbour or within SPAWN_DISTANCE_M, via coarse buckets.
  const buckets = new Map<string, CellCoord[]>();
  const bucketOf = (c: CellCoord) => `${Math.floor(c.ix / CONNECT_INDEX_SPAN)},${Math.floor(c.iy / CONNECT_INDEX_SPAN)}`;
  for (const c of far) {
    const key = bucketOf(c);
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  }
  const visited = new Set<CellId>();
  const out: PromotionCandidate[] = [];
  const allIds = new Set(cells.map((c) => cellKey(c.ix, c.iy)));
  for (const start of far) {
    const startId = cellKey(start.ix, start.iy);
    if (visited.has(startId)) continue;
    const component: CellCoord[] = [];
    const stack: CellCoord[] = [start];
    visited.add(startId);
    while (stack.length > 0) {
      const cur = stack.pop() as CellCoord;
      component.push(cur);
      const bx = Math.floor(cur.ix / CONNECT_INDEX_SPAN);
      const by = Math.floor(cur.iy / CONNECT_INDEX_SPAN);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const other of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
            const otherId = cellKey(other.ix, other.iy);
            if (visited.has(otherId)) continue;
            if (distanceBetweenCells(cur, other) <= SPAWN_DISTANCE_M) {
              visited.add(otherId);
              stack.push(other);
            }
          }
        }
      }
    }
    if (component.length < PROMOTE_MIN_CELLS) continue;
    const ids = component.map((c) => cellKey(c.ix, c.iy));
    if (!ids.some((id) => paintedThisWalk.has(id))) continue;
    const members = new Set(ids);
    const touchesOutside = component.some((c) => neighborsOf(c).some((n) => {
      const nid = cellKey(n.ix, n.iy);
      return allIds.has(nid) && !members.has(nid);
    }));
    if (touchesOutside) continue;
    out.push({ cellIds: ids, anchorCell: component.slice().sort(compareCoord)[0] });
  }
  return out;
}

/** Keeps the candidates that at least PROMOTE_MIN_WALKS walks touched. `earlierWalkPaints`: painted cell sets of the household's earlier tracked walks (this walk excluded). */
export function confirmPromotions(
  candidates: readonly PromotionCandidate[],
  paintedThisWalk: ReadonlySet<CellId>,
  earlierWalkPaints: readonly ReadonlySet<CellId>[]
): TerritoryPromotion[] {
  const out: TerritoryPromotion[] = [];
  for (const candidate of candidates) {
    const members = new Set(candidate.cellIds);
    const touches = (paint: ReadonlySet<CellId>) => {
      for (const id of paint) if (members.has(id)) return true;
      return false;
    };
    const walks = (touches(paintedThisWalk) ? 1 : 0) + earlierWalkPaints.filter(touches).length;
    if (walks >= PROMOTE_MIN_WALKS) out.push({ ...candidate, walks });
  }
  return out;
}

// ---- folding small territories (migration) ----

export interface TerritoryFold {
  loserId: TerritoryId;
  survivorId: TerritoryId;
}

/**
 * Migration plan: every territory with fewer than PROMOTE_MIN_WALKS walks is folded into the nearest kept one
 * (nearest cell to cell). Kept = home (always) and every territory with enough walks. Idempotent: a second run
 * over the result plans nothing.
 */
export function planTerritoryFolds(
  territories: ReadonlyArray<{ id: TerritoryId; createdAt: number; walksHere: number }>,
  cells: readonly Cell[]
): TerritoryFold[] {
  if (territories.length < 2) return [];
  const createdAt = new Map(territories.map((t) => [t.id, t.createdAt] as const));
  const homeId = pickHomeTerritoryId(createdAt) as TerritoryId;
  const kept = territories.filter((t) => t.id === homeId || t.walksHere >= PROMOTE_MIN_WALKS).map((t) => t.id);
  const keptSet = new Set(kept);
  const coordsOf = new Map<TerritoryId, CellCoord[]>();
  for (const c of cells) {
    if (!c.territoryId) continue;
    const list = coordsOf.get(c.territoryId) ?? [];
    list.push({ ix: c.ix, iy: c.iy });
    coordsOf.set(c.territoryId, list);
  }
  const folds: TerritoryFold[] = [];
  for (const t of territories) {
    if (keptSet.has(t.id)) continue;
    const mine = coordsOf.get(t.id) ?? [];
    let best = homeId;
    let bestDistance = Infinity;
    for (const keptId of kept) {
      for (const a of mine) {
        for (const b of coordsOf.get(keptId) ?? []) {
          const d = Math.hypot(a.ix - b.ix, a.iy - b.iy); // index distance is enough to rank; cells are ~20 m apart in both axes
          if (d < bestDistance) {
            bestDistance = d;
            best = keptId;
          }
        }
      }
    }
    folds.push({ loserId: t.id, survivorId: best });
  }
  return folds;
}

export interface CelebrationTerritoryBeat {
  /** Set when a far patch was promoted to a territory of its own by this walk. */
  newTerritoryName: string | null;
  /** [survivor name, absorbed name] when this walk caused a merge. */
  mergedTerritoryNames: [string, string] | null;
}

/** Which territory-related celebration beats this walk shows. `promotedName`: the name of the territory this walk promoted (or null). */
export function resolveCelebrationTerritoryBeat(
  plan: Pick<TerritoryChangePlan, 'merges'>,
  promotedName: string | null,
  territoryNamesById: ReadonlyMap<TerritoryId, string>
): CelebrationTerritoryBeat {
  let mergedTerritoryNames: [string, string] | null = null;
  if (plan.merges.length > 0) {
    const [firstMerge] = plan.merges;
    const survivorName = territoryNamesById.get(firstMerge.survivorId);
    const loserName = territoryNamesById.get(firstMerge.loserId);
    if (survivorName && loserName) mergedTerritoryNames = [survivorName, loserName];
  }
  return { newTerritoryName: promotedName, mergedTerritoryNames };
}

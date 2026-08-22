// Persists the Home Range grid — the per-cell record described in
// openspec/changes/home-range/design.md Decision 1. Mirrors WalkRepository's
// shape: an interface, a sqlite implementation for the app, and an in-memory
// implementation for tests.
//
// Also owns the New Ground event (openspec/changes/somewhere-wild/design.md
// Decision 4) — a single overwritten row, same singleton-row convention
// DenEconomyState already uses elsewhere, so the "Somewhere Wild" card can
// still answer "was there a recent discovery" up to 48h after the walk that
// made it has otherwise left no trace in memory.

import { CellId } from '../utils/grid';
import { TerritoryId } from './TerritoryRepository';

/** One grid cell's persisted state. See design.md's "per-cell record". */
export interface Cell {
  ix: number;
  iy: number;
  /** The Bloom clock (ms epoch) — pushed forward by any tracked or (future, home-range-rewards) refreshed paint. */
  lastRefreshed: number;
  /** GPS-verified only (ms epoch) — never written by a non-tracked paint. Reserved for a Phase 3 defence mechanic; see design.md. */
  lastTracked: number;
  /** Monotonic, tracked-walk paints only. The ghost-trail brightness channel. */
  visits: number;
  /**
   * Which Territory (openspec/changes/territories) this cell belongs to.
   * `null` only transiently, before the one-time territory migration backfill
   * has run (see storage/territoryMigration.ts) — every cell is assigned
   * exactly one Territory once that completes. Set once at insert time, and
   * only ever reassigned afterward by a Territory merge
   * (reassignCellsToTerritory below) — never by an ordinary repaint. See
   * openspec/changes/territories/design.md Decision 1.
   */
  territoryId: TerritoryId | null;
}

/** One cell touched by a paint operation — either a live/migrated tracked walk, or (future, home-range-rewards) a manual-log route refresh. */
export interface PaintCellInput {
  ix: number;
  iy: number;
  refreshedAt: number;
  tracked: boolean;
  /**
   * The resolved Territory this cell belongs to — used ONLY on the INSERT
   * path for a brand-new cell row (openspec/changes/territories/design.md
   * Decision 1/tasks.md task 1.1). The UPDATE path for an already-existing
   * cell must never touch its territoryId column; omit this field (or pass
   * anything) when repainting a cell that's already in the Range.
   */
  territoryId?: TerritoryId;
}

/** The most recent New Ground discovery — see openspec/changes/somewhere-wild/design.md Decision 4. `cellIds` is this discovery's own New Ground cell set (not the whole Range), kept only so a future consumer could re-derive the same "N new streets" figure without re-running newGroundCells(); the "Somewhere Wild" card itself only needs the count. */
export interface NewGroundEvent {
  occurredAt: number;
  cellIds: CellId[];
}

export interface HomeRangeRepository {
  getCells(): Promise<Cell[]>;
  /** Batch upsert: creates a cell if new, otherwise bumps lastRefreshed/lastTracked/visits per the per-cell record rules above. Runs as a single transaction — see design.md's "no DB write per fix" cost budget. */
  paintCells(cells: PaintCellInput[]): Promise<void>;
  /** Viewport-scoped read for rendering (Decision 6's bridge payload needs a bounded query, not the whole table). Bounds are inclusive. */
  getCellsInBounds(minIx: number, maxIx: number, minIy: number, maxIy: number): Promise<Cell[]>;
  /** The single most recent New Ground event, or `null` if none has ever fired. Freshness (the 48h card window) is evaluated by the caller at read time — this just returns whatever was last recorded, however old. See openspec/changes/somewhere-wild/design.md Decision 4. */
  getLastNewGroundEvent(): Promise<NewGroundEvent | null>;
  /** Overwrites any previous New Ground event — a singleton row, not an event log (only the most recent discovery is ever relevant to the card). See openspec/changes/somewhere-wild/design.md Decision 4. */
  recordNewGroundEvent(occurredAt: number, cellIds: CellId[]): Promise<void>;

  /** Every cell currently assigned to `territoryId` — used by the territories list screen and per-territory portrait rendering (openspec/changes/territories/tasks.md task 1.3). Scoped read, mirroring getCellsInBounds's viewport-scoped shape. */
  getCellsByTerritory(territoryId: TerritoryId): Promise<Cell[]>;
  /**
   * Bulk-reassigns every cell from `fromTerritoryId` to `toTerritoryId` — the
   * one write a Territory merge makes to the cells table
   * (openspec/changes/territories/design.md Decision 3 Step 4). `null` is
   * accepted for `fromTerritoryId` for exactly one other caller: the one-time
   * territory migration backfill (storage/territoryMigration.ts), which
   * needs to move a specific, already-resolved set of previously-untracked
   * (territoryId IS NULL) cells into the territory they replay to — the
   * bulk-by-current-value shape is identical to a merge's, so this reuses
   * the same method rather than adding a parallel one.
   */
  reassignCellsToTerritory(fromTerritoryId: TerritoryId | null, toTerritoryId: TerritoryId): Promise<void>;
  /**
   * Sets `territoryId` on exactly the given cells, regardless of their
   * current value — used ONLY by the one-time territory migration backfill
   * (storage/territoryMigration.ts) to assign the specific territory each
   * pre-existing (pre-territories) cell resolves to. Every other
   * territoryId write goes through PaintCellInput's insert-time field or
   * reassignCellsToTerritory's bulk-by-current-value shape above — this is
   * the one coordinate-scoped exception migration needs, since two
   * differently-resolved cells can share the same "currently null"
   * `territoryId` value going into the backfill.
   */
  assignTerritoryToCells(cellIds: CellId[], territoryId: TerritoryId): Promise<void>;
  /**
   * The single global, ungrouped aggregate `{ cellCount, visitsSum }` over
   * the WHOLE cells table — the only correct way to compute the Territory
   * passive-income formula's `worldMass` term (openspec/changes/territories/
   * design.md Decision 6's split-invariance guardrail). This method MUST
   * NEVER gain a `territoryId` parameter, and there MUST NEVER be a
   * territory-scoped variant of it — `worldMass` summed correctly is always
   * bit-identical to `worldMass` computed per-territory-then-summed only if
   * nothing ever calls a grouped/scoped version of this query by mistake.
   * Do not add one, even for a seemingly-harmless debug/display purpose.
   */
  getWorldMass(): Promise<{ cellCount: number; visitsSum: number }>;
}

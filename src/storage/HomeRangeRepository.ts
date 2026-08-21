// Persists the Home Range grid — the per-cell record described in
// openspec/changes/home-range/design.md Decision 1. Mirrors WalkRepository's
// shape: an interface, a sqlite implementation for the app, and an in-memory
// implementation for tests.

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
}

/** One cell touched by a paint operation — either a live/migrated tracked walk, or (future, home-range-rewards) a manual-log route refresh. */
export interface PaintCellInput {
  ix: number;
  iy: number;
  refreshedAt: number;
  tracked: boolean;
}

export interface HomeRangeRepository {
  getCells(): Promise<Cell[]>;
  /** Batch upsert: creates a cell if new, otherwise bumps lastRefreshed/lastTracked/visits per the per-cell record rules above. Runs as a single transaction — see design.md's "no DB write per fix" cost budget. */
  paintCells(cells: PaintCellInput[]): Promise<void>;
  /** Viewport-scoped read for rendering (Decision 6's bridge payload needs a bounded query, not the whole table). Bounds are inclusive. */
  getCellsInBounds(minIx: number, maxIx: number, minIy: number, maxIy: number): Promise<Cell[]>;
}

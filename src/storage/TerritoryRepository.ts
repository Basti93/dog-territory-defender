// Owns Territory metadata only — id, name, createdAt, and the two monotonic
// counters (walksHere, treatsEarnedHere). Never touches the Home Range cells
// table; HomeRangeRepository remains the sole owner of cell-level territory
// membership. See docs/decisions/territories/design.md Decision 1.

/** Stable identifier for a Territory. Encodes its createdAt as a sortable,
 * zero-padded decimal prefix (`t<15-digit-ms-epoch>-<random>`) so pure,
 * I/O-free code (src/utils/territoryCluster.ts) can determine "which of two
 * Territories is older" — the merge survivor rule (design.md Decision 3 Step
 * 4) — from the id alone, via territoryIdCreatedAt below, without needing a
 * full Territory read. This is an implementation detail of id generation,
 * not a public contract beyond that one helper. */
export type TerritoryId = string;

/** One Territory — a named, auto-discovered sub-region of the single Home
 * Range grid. See docs/decisions/territories/design.md Decision 1. */
export interface Territory {
  id: TerritoryId;
  name: string;
  createdAt: number;
  /** Lifetime count of walks credited to this Territory (design.md Decision 3 Step 5's majority-attribution rule). Monotonic — summed, never averaged, on merge. */
  walksHere: number;
  /** Lifetime treats earned on walks credited to this Territory. Monotonic — summed, never averaged, on merge. */
  treatsEarnedHere: number;
}

export function generateTerritoryId(createdAt: number): TerritoryId {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `t${String(createdAt).padStart(15, '0')}-${randomSuffix}`;
}

/** Parses the createdAt timestamp embedded in a TerritoryId — see the type's
 * own doc comment. Used only by the pure clustering algorithm
 * (territoryCluster.ts) to resolve "older wins" on merge without needing I/O. */
export function territoryIdCreatedAt(id: TerritoryId): number {
  const match = /^t(\d{15})-/.exec(id);
  return match ? Number(match[1]) : 0;
}

export interface IncrementTerritoryStatsInput {
  walksIncrement: number;
  treatsIncrement: number;
}

export interface TerritoryRepository {
  getTerritories(): Promise<Territory[]>;
  getTerritory(id: TerritoryId): Promise<Territory | null>;
  /** Creates a new Territory, generating its id internally (see generateTerritoryId) — the caller supplies only the name and createdAt. */
  createTerritory(name: string, createdAt: number): Promise<TerritoryId>;
  renameTerritory(id: TerritoryId, name: string): Promise<void>;
  /** Sums `walksHere`/`treatsEarnedHere` from `absorbedId` into `survivorId`, then deletes the absorbed row. Never touches the cells table — the caller is responsible for HomeRangeRepository.reassignCellsToTerritory separately. */
  mergeTerritoryStats(survivorId: TerritoryId, absorbedId: TerritoryId): Promise<void>;
  incrementTerritoryStats(id: TerritoryId, input: IncrementTerritoryStatsInput): Promise<void>;
  /**
   * Household sync only: inserts server territories (ids preserved, cells
   * reference them) or updates existing ones: name = server's, counters =
   * max(local, server) so the local optimistic increments are never lost.
   */
  upsertTerritories(territories: Territory[]): Promise<void>;
  /** Household sync only: drops territories the server merged away (their cells were reassigned separately). */
  removeTerritories(ids: TerritoryId[]): Promise<void>;
  /** Backup & Restore only: wipes every Territory, then writes exactly the given ones (ids preserved, since cells reference them). */
  replaceAll(territories: Territory[]): Promise<void>;
}

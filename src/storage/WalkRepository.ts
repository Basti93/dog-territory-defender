import { Walk } from '../types';

export interface StoredWalk extends Walk {
  syncedAt: number | null;
}

export interface WalkRepository {
  saveWalk(walk: Walk): Promise<void>;
  getWalks(): Promise<StoredWalk[]>;
  /** The `limit` newest walks (startTime descending). Cheap alternative to getWalks() when only the latest few are needed (the bench). */
  getRecentWalks(limit: number): Promise<StoredWalk[]>;
  getWalk(id: string): Promise<StoredWalk | null>;
  deleteWalk(id: string): Promise<void>;
  /** Household sync: records that the server acknowledged this walk. No-op for an unknown id. */
  markSynced(id: string, at: number): Promise<void>;
  /** How many stored walks are closed (reward-eligible); cheap, no locations are read. */
  countClosedWalks(): Promise<number>;
  /** Last fix of the walk with the newest startTime that has any fixes (manual logs have none); null when no walk has a fix. */
  getLastWalkEnd(): Promise<{ latitude: number; longitude: number } | null>;
  /** Atomically replaces every stored walk with `walks` (used by backup restore). */
  replaceAll(walks: Walk[]): Promise<void>;
}

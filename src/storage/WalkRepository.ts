import { Walk } from '../types';

export interface StoredWalk extends Walk {
  syncedAt: number | null;
}

export interface WalkRepository {
  saveWalk(walk: Walk): Promise<void>;
  getWalks(): Promise<StoredWalk[]>;
  getWalk(id: string): Promise<StoredWalk | null>;
  deleteWalk(id: string): Promise<void>;
  /** Household sync: records that the server acknowledged this walk. No-op for an unknown id. */
  markSynced(id: string, at: number): Promise<void>;
  /** Atomically replaces every stored walk with `walks` (used by backup restore). */
  replaceAll(walks: Walk[]): Promise<void>;
}

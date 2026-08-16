import { Walk } from '../types';

export interface StoredWalk extends Walk {
  syncedAt: number | null;
}

export interface WalkRepository {
  saveWalk(walk: Walk): Promise<void>;
  getWalks(): Promise<StoredWalk[]>;
  getWalk(id: string): Promise<StoredWalk | null>;
  deleteWalk(id: string): Promise<void>;
}

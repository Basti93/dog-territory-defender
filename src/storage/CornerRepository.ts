// "Unsere Ecken": the corners this phone knows (detected from the walks, or learned from the household's names).
// Local game data like walks and cells: it is not part of the sync outbox state and survives leaving a household.

import type { CornerId } from '../utils/cornerDetection';

export interface StoredCorner {
  /** The centre cell of the 3x3 block, "ix,iy". */
  id: CornerId;
  ix: number;
  iy: number;
  /** startTime of the walk that made it a corner; for a corner only known from the server, the time of its first name. */
  createdAt: number;
  /** The walk that made it a corner (the homecoming asks for a name only on that walk); null for a corner learned from the server. */
  walkId: string | null;
  /** The street at the corner from the OS geocoder, resolved once on this phone; null until a lookup worked. The auto-name is built from it per language. */
  street: string | null;
  /** The household's name for it (1..24 characters); null = nobody named it yet. */
  name: string | null;
  /** playerId of the member who wrote the current name; null when unknown (named before joining) or unnamed. */
  nameBy: string | null;
  /** ms epoch of the current name; null when unnamed. */
  nameAt: number | null;
}

/** A corner detection just found. */
export interface NewCorner {
  id: CornerId;
  ix: number;
  iy: number;
  createdAt: number;
  walkId: string;
}

export interface CornerRepository {
  getCorners(): Promise<StoredCorner[]>;
  /** Inserts the corners that are not stored yet; a stored id is left untouched (idempotent). */
  addCorners(corners: NewCorner[]): Promise<void>;
  /** Remembers the street found for a corner. No-op for an unknown id. */
  setStreet(id: CornerId, street: string): Promise<void>;
  /**
   * Writes the household's name for a corner (the player's own rename, or the server's). Creates the corner when the id
   * is unknown (a corner the other phone found first). Last write wins.
   */
  setName(id: CornerId, name: string, by: string | null, at: number): Promise<void>;
}

/** Cell coordinates out of a corner id ("ix,iy"). */
export function cornerCoords(id: CornerId): { ix: number; iy: number } {
  const [ix, iy] = id.split(',').map(Number);
  return { ix, iy };
}

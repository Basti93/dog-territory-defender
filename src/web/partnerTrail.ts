// RN-side half of Alex's thread (M4): turns the partner presence into the SHOW_PARTNER_TRAIL bridge payload and the
// frame item that keeps the thread inside the Viertel portrait. Pure TypeScript, no React. The WebView-side half is
// partnerTrailScript.ts.

import type { PartnerPresence } from '../sync/presenceStore';
import { cellForLocation } from '../utils/grid';
import type { NeighbourOverlayItem } from './neighbourOverlay';

export interface PartnerTrailPayload {
  points: Array<{ lat: number; lon: number }>;
  name: string;
}

export const PARTNER_TRAIL_FRAME_ID = '__partner-trail';
const MAX_NAME_LENGTH = 24;

/** The bridge payload; `points: []` clears the thread. */
export function partnerTrailPayload(walk: PartnerPresence | null): PartnerTrailPayload {
  if (!walk) return { points: [], name: '' };
  return {
    points: walk.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => ({ lat: p.lat, lon: p.lon })),
    name: walk.name.trim().slice(0, MAX_NAME_LENGTH),
  };
}

/**
 * A stand-in "neighbour" whose two cells are the corners of the thread's bounding box, so framePortraitNeighbours
 * widens the portrait to hold the thread (and, like a far-away neighbour, drops it when it would shrink our Range to a
 * speck). Never drawn: callers remove PARTNER_TRAIL_FRAME_ID from the items they send. Null when there is no thread.
 */
export function partnerTrailFrameItem(payload: PartnerTrailPayload): NeighbourOverlayItem | null {
  if (payload.points.length === 0) return null;
  let minIx = Infinity;
  let maxIx = -Infinity;
  let minIy = Infinity;
  let maxIy = -Infinity;
  for (const p of payload.points) {
    const { ix, iy } = cellForLocation(p.lat, p.lon);
    if (ix < minIx) minIx = ix;
    if (ix > maxIx) maxIx = ix;
    if (iy < minIy) minIy = iy;
    if (iy > maxIy) maxIy = iy;
  }
  const corner = { ix: minIx, iy: minIy };
  return { id: PARTNER_TRAIL_FRAME_ID, name: '', cells: [corner, { ix: maxIx, iy: maxIy }], label: corner };
}

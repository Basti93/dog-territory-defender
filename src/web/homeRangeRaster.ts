// Builds the bounded raster payload the WebView/Leaflet bridge renders (see
// mapHTML.ts's SHOW_HOME_RANGE handler and
// openspec/changes/home-range/design.md Decision 6). This is the RN-side
// half — pure, unit-testable TS. The WebView-side half (Gaussian blur,
// marching-squares contour, Lab colour interpolation, canvas drawing) lives
// inline in mapHTML.ts's own script, the same way every other WebView
// rendering concern in this codebase already does.
//
// Payload shape: `{ origin: [ix0, iy0], w, h, wild: base64(Uint8Array),
// visits: base64(Uint8Array) }` — one bounded postMessage regardless of how
// many walks/cells the player has. `wild` is quantised 0-254 (wildness*254,
// rounded); 255 is the sentinel for "not in the Range."

import { Cell } from '../storage/HomeRangeRepository';
import { CellId, parseCellKey, wildness } from '../utils/grid';

/** Sentinel value in the `wild` plane meaning "this cell has no data — outside the Range." */
export const OUTSIDE_RANGE_SENTINEL = 255;

export interface HomeRangeRasterPayload {
  origin: [number, number];
  w: number;
  h: number;
  wild: string;
  visits: string;
}

/** A cell painted live during an in-progress walk, not yet persisted — rendered as fully fresh (wildness 0) so the player sees the Bloom extend in real time. See MapView.tsx's live-walk preview (tasks.md task 5.3). */
export interface LiveOverlayCell {
  ix: number;
  iy: number;
}

// Manual base64 encoder — avoids depending on a `Buffer`/`btoa` global that
// isn't guaranteed present in the RN JS engine.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 !== undefined ? b1 >> 4 : 0)];
    result += b1 !== undefined ? BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 !== undefined ? b2 >> 6 : 0)] : '=';
    result += b2 !== undefined ? BASE64_CHARS[b2 & 0x3f] : '=';
  }
  return result;
}

function boundsOf(coords: Array<{ ix: number; iy: number }>): { minIx: number; maxIx: number; minIy: number; maxIy: number } | null {
  if (coords.length === 0) return null;
  let minIx = Infinity;
  let maxIx = -Infinity;
  let minIy = Infinity;
  let maxIy = -Infinity;
  for (const { ix, iy } of coords) {
    if (ix < minIx) minIx = ix;
    if (ix > maxIx) maxIx = ix;
    if (iy < minIy) minIy = iy;
    if (iy > maxIy) maxIy = iy;
  }
  return { minIx, maxIx, minIy, maxIy };
}

/**
 * Builds the bounded raster payload from a set of persisted cells plus an
 * optional set of live-walk-only cells (painted this walk, not yet in
 * storage). Returns null when there is nothing to render at all (a brand
 * new player with no Range and no walk in progress).
 */
export function buildHomeRangeRasterPayload(
  cells: Cell[],
  nowMs: number,
  liveOverlayCells: LiveOverlayCell[] = []
): HomeRangeRasterPayload | null {
  const allCoords: Array<{ ix: number; iy: number }> = [
    ...cells.map((c) => ({ ix: c.ix, iy: c.iy })),
    ...liveOverlayCells,
  ];
  const bounds = boundsOf(allCoords);
  if (!bounds) return null;

  const { minIx, maxIx, minIy, maxIy } = bounds;
  const w = maxIx - minIx + 1;
  const h = maxIy - minIy + 1;

  const wild = new Uint8Array(w * h).fill(OUTSIDE_RANGE_SENTINEL);
  const visits = new Uint8Array(w * h);

  for (const cell of cells) {
    const idx = (cell.iy - minIy) * w + (cell.ix - minIx);
    wild[idx] = Math.round(wildness(cell.lastRefreshed, nowMs) * (OUTSIDE_RANGE_SENTINEL - 1));
    visits[idx] = Math.min(255, cell.visits);
  }

  // Live-walk overlay paints on top, always fully fresh (wildness 0) — a
  // walk in progress hasn't been persisted yet, but the player should see
  // it appear on the Bloom immediately. See design.md Decision 1's "visits
  // is the ghost-trail brightness channel" — a live cell hasn't earned a
  // visit yet (that's recorded at Finish Walk), so visits is untouched here.
  for (const { ix, iy } of liveOverlayCells) {
    const idx = (iy - minIy) * w + (ix - minIx);
    wild[idx] = 0;
  }

  return { origin: [minIx, minIy], w, h, wild: encodeBase64(wild), visits: encodeBase64(visits) };
}

/** Converts a Set<CellId> (as returned by utils/grid.ts's paintedCells) into the LiveOverlayCell[] shape this module needs. */
export function cellIdsToCoords(ids: Set<CellId>): LiveOverlayCell[] {
  return Array.from(ids).map((id) => parseCellKey(id));
}

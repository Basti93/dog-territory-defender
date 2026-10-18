// RN-side half of the Nachbarhunde map layer (multiplayer-sync Decision 23, slice M3): turns the cached
// GET /v1/nearby items into the small bridge payload for SHOW_NEIGHBOURS / RENDER_PORTRAIT, and picks the
// portrait frame. Pure TypeScript, no React. The WebView-side half is neighbourOverlayScript.ts.
//
// Only synthetic cell indices ever travel here (bot routes never leave the server).

import { NEIGHBOUR_CONFIG } from '../economy/neighbourConfig';
import type { NearbyItem } from '../sync/apiContract';

export interface NeighbourOverlayCell {
  ix: number;
  iy: number;
}

export interface NeighbourOverlayItem {
  /** Opaque bot id; comes back in NEIGHBOUR_TAPPED. */
  id: string;
  name: string;
  cells: NeighbourOverlayCell[];
  /** The Range cell nearest to the cells' mean: the name sign sits here, so it always rests on the patch. */
  label: NeighbourOverlayCell;
}

export interface NeighbourOverlayPayload {
  items: NeighbourOverlayItem[];
}

const MAX_NAME_LENGTH = 24;

const isCellIndex = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** Pure: nearby items -> bridge payload. Items without usable cells are dropped; cells are de-duplicated and capped. */
export function neighbourOverlayPayload(nearby: NearbyItem[]): NeighbourOverlayPayload {
  const items: NeighbourOverlayItem[] = [];
  for (const item of nearby) {
    const seen = new Set<string>();
    const cells: NeighbourOverlayCell[] = [];
    for (const c of item.rangeCells ?? []) {
      if (!c || !isCellIndex(c.ix) || !isCellIndex(c.iy)) continue;
      const key = `${c.ix},${c.iy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push({ ix: c.ix, iy: c.iy });
      if (cells.length >= NEIGHBOUR_CONFIG.nearby.maxCellsPerBot) break;
    }
    if (cells.length === 0) continue;
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      sx += c.ix;
      sy += c.iy;
    }
    const mx = sx / cells.length;
    const my = sy / cells.length;
    let label = cells[0];
    let best = Infinity;
    for (const c of cells) {
      const d = (c.ix - mx) ** 2 + (c.iy - my) ** 2;
      if (d < best) {
        best = d;
        label = c;
      }
    }
    items.push({ id: item.id, name: (item.dogName ?? '').trim().slice(0, MAX_NAME_LENGTH), cells, label });
  }
  return { items };
}

export interface RasterFrame {
  origin: [number, number];
  w: number;
  h: number;
}

/** The portrait never zooms out further than this many cells (20 m each) across, even for a tiny Range of our own. */
export const PORTRAIT_MIN_SPAN_CELLS = 120;
/** ...and never further than this multiple of our own Range's longer side. */
export const PORTRAIT_MAX_RANGE_MULTIPLE = 5;

interface Box {
  minIx: number;
  maxIx: number;
  minIy: number;
  maxIy: number;
}

const boxOfCells = (cells: NeighbourOverlayCell[]): Box => {
  const box: Box = { minIx: Infinity, maxIx: -Infinity, minIy: Infinity, maxIy: -Infinity };
  for (const c of cells) {
    if (c.ix < box.minIx) box.minIx = c.ix;
    if (c.ix > box.maxIx) box.maxIx = c.ix;
    if (c.iy < box.minIy) box.minIy = c.iy;
    if (c.iy > box.maxIy) box.maxIy = c.iy;
  }
  return box;
};

const span = (b: Box) => Math.max(b.maxIx - b.minIx + 1, b.maxIy - b.minIy + 1);

/**
 * Which neighbours fit into the portrait/map frame, and the frame that holds them and our own Range.
 * Nearest first; a neighbour is only added while the union stays within `max(PORTRAIT_MIN_SPAN_CELLS, 5 x our
 * longer side)` cells, so a far-away Range never shrinks our own to a speck. `frame` is null when no neighbour
 * is shown (callers then keep framing our Range alone).
 */
export function framePortraitNeighbours(
  raster: RasterFrame,
  items: NeighbourOverlayItem[]
): { frame: RasterFrame | null; items: NeighbourOverlayItem[] } {
  const own: Box = { minIx: raster.origin[0], maxIx: raster.origin[0] + raster.w - 1, minIy: raster.origin[1], maxIy: raster.origin[1] + raster.h - 1 };
  const limit = Math.max(PORTRAIT_MIN_SPAN_CELLS, PORTRAIT_MAX_RANGE_MULTIPLE * span(own));
  const cx = (own.minIx + own.maxIx) / 2;
  const cy = (own.minIy + own.maxIy) / 2;
  const distance = (it: NeighbourOverlayItem) => {
    const b = boxOfCells(it.cells);
    return (((b.minIx + b.maxIx) / 2 - cx) ** 2 + ((b.minIy + b.maxIy) / 2 - cy) ** 2);
  };
  const union: Box = { ...own };
  const shown: NeighbourOverlayItem[] = [];
  for (const it of [...items].sort((a, b) => distance(a) - distance(b))) {
    const b = boxOfCells(it.cells);
    const next: Box = {
      minIx: Math.min(union.minIx, b.minIx),
      maxIx: Math.max(union.maxIx, b.maxIx),
      minIy: Math.min(union.minIy, b.minIy),
      maxIy: Math.max(union.maxIy, b.maxIy),
    };
    if (span(next) > limit) continue;
    Object.assign(union, next);
    shown.push(it);
  }
  if (shown.length === 0) return { frame: null, items: [] };
  return {
    frame: { origin: [union.minIx, union.minIy], w: union.maxIx - union.minIx + 1, h: union.maxIy - union.minIy + 1 },
    items: shown,
  };
}

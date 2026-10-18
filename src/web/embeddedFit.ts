// Which part of our Range the embedded Viertel band frames. Pure TypeScript, no React.
//
// A real Range can be several scattered clusters (a walk in another part of the city). Framing its whole bounding box would
// zoom the band out to the city, so the band frames the cluster our newest paint belongs to, adds the nearest other
// clusters only while everything still fits at zoom 15 (the band's lowest zoom), and leaves the rest off-screen.

import { Cell } from '../storage/HomeRangeRepository';
import type { NeighbourOverlayItem } from './neighbourOverlay';
import { framePortraitNeighbours, RasterFrame } from './neighbourOverlay';

/** Largest area (in 20 m cells) that fits into the padded band at zoom 15 (about 1.2 x 0.9 km). */
export const EMBEDDED_MAX_CELLS_W = 60;
export const EMBEDDED_MAX_CELLS_H = 46;
/** Cells closer than this many cells (Chebyshev) belong to one cluster. */
const CLUSTER_GAP_CELLS = 12;

interface Box {
  minIx: number;
  maxIx: number;
  minIy: number;
  maxIy: number;
}

interface Cluster {
  box: Box;
  count: number;
  newest: Cell;
}

function clusterCells(cells: Cell[]): Cluster[] {
  // Bucket grid of CLUSTER_GAP_CELLS: cells in the same or neighbouring buckets are within 2 * gap, close enough to count as one place.
  const bucketOf = (c: Cell) => `${Math.floor(c.ix / CLUSTER_GAP_CELLS)},${Math.floor(c.iy / CLUSTER_GAP_CELLS)}`;
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(k, root);
    return root;
  };
  for (const c of cells) {
    const k = bucketOf(c);
    if (!parent.has(k)) parent.set(k, k);
  }
  for (const k of [...parent.keys()]) {
    const [bx, by] = k.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const n = `${bx + dx},${by + dy}`;
        if (parent.has(n)) parent.set(find(n), find(k));
      }
    }
  }
  const clusters = new Map<string, Cluster>();
  for (const c of cells) {
    const root = find(bucketOf(c));
    const existing = clusters.get(root);
    if (!existing) {
      clusters.set(root, { box: { minIx: c.ix, maxIx: c.ix, minIy: c.iy, maxIy: c.iy }, count: 1, newest: c });
      continue;
    }
    existing.count += 1;
    existing.box.minIx = Math.min(existing.box.minIx, c.ix);
    existing.box.maxIx = Math.max(existing.box.maxIx, c.ix);
    existing.box.minIy = Math.min(existing.box.minIy, c.iy);
    existing.box.maxIy = Math.max(existing.box.maxIy, c.iy);
    if (c.lastRefreshed > existing.newest.lastRefreshed) existing.newest = c;
  }
  return [...clusters.values()];
}

const fits = (b: Box) => b.maxIx - b.minIx + 1 <= EMBEDDED_MAX_CELLS_W && b.maxIy - b.minIy + 1 <= EMBEDDED_MAX_CELLS_H;
const toFrame = (b: Box): RasterFrame => ({ origin: [b.minIx, b.minIy], w: b.maxIx - b.minIx + 1, h: b.maxIy - b.minIy + 1 });

/** The cell box the band frames for these cells; null without cells. */
export function embeddedRangeFrame(cells: Cell[]): RasterFrame | null {
  if (cells.length === 0) return null;
  const clusters = clusterCells(cells);
  // Anchor = the cluster holding the newest paint (the walk the household did last).
  const anchor = clusters.reduce((a, b) => (b.newest.lastRefreshed > a.newest.lastRefreshed ? b : a));
  let union: Box = { ...anchor.box };
  if (!fits(union)) {
    // One huge cluster: a window of the maximum size around its newest cell.
    const cx = anchor.newest.ix;
    const cy = anchor.newest.iy;
    union = {
      minIx: Math.max(anchor.box.minIx, cx - Math.floor(EMBEDDED_MAX_CELLS_W / 2)),
      maxIx: Math.min(anchor.box.maxIx, cx + Math.floor(EMBEDDED_MAX_CELLS_W / 2) - 1),
      minIy: Math.max(anchor.box.minIy, cy - Math.floor(EMBEDDED_MAX_CELLS_H / 2)),
      maxIy: Math.min(anchor.box.maxIy, cy + Math.floor(EMBEDDED_MAX_CELLS_H / 2) - 1),
    };
    return toFrame(union);
  }
  const centreOf = (b: Box) => [(b.minIx + b.maxIx) / 2, (b.minIy + b.maxIy) / 2];
  const [ax, ay] = centreOf(anchor.box);
  const others = clusters
    .filter((c) => c !== anchor)
    .sort((a, b) => {
      const [aex, aey] = centreOf(a.box);
      const [bex, bey] = centreOf(b.box);
      return (aex - ax) ** 2 + (aey - ay) ** 2 - ((bex - ax) ** 2 + (bey - ay) ** 2);
    });
  for (const c of others) {
    const next: Box = {
      minIx: Math.min(union.minIx, c.box.minIx),
      maxIx: Math.max(union.maxIx, c.box.maxIx),
      minIy: Math.min(union.minIy, c.box.minIy),
      maxIy: Math.max(union.maxIy, c.box.maxIy),
    };
    if (fits(next)) union = next;
  }
  return toFrame(union);
}

/**
 * The frame for SHOW_HOME_RANGE in the embedded band: our Range's frame, widened to hold the nearest neighbours and the
 * partner thread when they fit (framePortraitNeighbours' own rules). The wild pin never takes part: it may sit off-screen.
 */
export function embeddedFitFrame(cells: Cell[], extras: NeighbourOverlayItem[]): RasterFrame | null {
  const base = embeddedRangeFrame(cells);
  if (!base) return null;
  return framePortraitNeighbours(base, extras).frame ?? base;
}

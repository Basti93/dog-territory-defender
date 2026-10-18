import type { Location } from '../types';
import { splitAtGaps } from '../utils/geometry';

// A walk's trail as a tiny static drawing for the postcard thumbnails (bench and Album): a few runs of at most
// MAX_THUMB_POINTS points in total, scaled into a box. No map, no WebView.

export const MAX_THUMB_POINTS = 60;

type XY = [number, number];

const EARTH_M = 6371000;

/** Local flat projection in metres around the trail's mean latitude (fine at walk scale). */
function project(runs: Location[][]): XY[][] {
  let latSum = 0;
  let count = 0;
  for (const run of runs) for (const p of run) {
    latSum += p.latitude;
    count += 1;
  }
  const cosLat = Math.cos((latSum / Math.max(1, count) * Math.PI) / 180);
  const k = Math.PI / 180;
  return runs.map((run) => run.map((p): XY => [EARTH_M * p.longitude * k * cosLat, -EARTH_M * p.latitude * k]));
}

function perpendicularDistance(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy));
}

interface Segment {
  run: number;
  from: number;
  to: number;
  /** Index of the point farthest from the chord from -> to, and how far it is (-1 when nothing lies between). */
  worstAt: number;
  worst: number;
}

function segmentOf(points: XY[], run: number, from: number, to: number): Segment {
  let worst = -1;
  let worstAt = -1;
  for (let i = from + 1; i < to; i++) {
    const d = perpendicularDistance(points[i], points[from], points[to]);
    if (d > worst) {
      worst = d;
      worstAt = i;
    }
  }
  return { run, from, to, worstAt, worst };
}

/**
 * The trail's continuous runs (cut at gaps, like the portrait map), reduced to at most `maxPoints` points in total.
 * Ramer-Douglas-Peucker with a point budget: start from each run's two ends and keep adding the point that sits farthest
 * from the line drawn so far, until the budget is used up or nothing deviates any more. Single-fix dots are dropped unless
 * the whole walk is one dot. Projected to metres, y pointing down.
 */
export function simplifiedTrail(locations: Location[], maxPoints = MAX_THUMB_POINTS): XY[][] {
  if (locations.length === 0) return [];
  let runs = splitAtGaps(locations).filter((r) => r.length >= 2);
  if (runs.length === 0) return project([[locations[0]]]);
  if (runs.length * 2 > maxPoints) {
    // Too many fragments to draw each: keep the longest ones, in walking order.
    const longest = [...runs].sort((a, b) => b.length - a.length).slice(0, Math.floor(maxPoints / 2));
    runs = runs.filter((r) => longest.includes(r));
  }
  const projected = project(runs);
  const keep = projected.map((run) => {
    const marks = new Array<boolean>(run.length).fill(false);
    marks[0] = true;
    marks[run.length - 1] = true;
    return marks;
  });
  let budget = maxPoints - projected.length * 2;
  const segments = projected.map((run, r) => segmentOf(run, r, 0, run.length - 1));
  while (budget > 0) {
    let best = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].worstAt !== -1 && segments[i].worst > 0 && (best === -1 || segments[i].worst > segments[best].worst)) best = i;
    }
    if (best === -1) break;
    const seg = segments[best];
    keep[seg.run][seg.worstAt] = true;
    segments.splice(best, 1, segmentOf(projected[seg.run], seg.run, seg.from, seg.worstAt), segmentOf(projected[seg.run], seg.run, seg.worstAt, seg.to));
    budget -= 1;
  }
  return projected.map((run, r) => run.filter((_, i) => keep[r][i]));
}

export interface TrailDrawing {
  /** SVG path data, one per run, in a width x height box. */
  paths: string[];
  /** Where the walk began (the little green dot). Null for an empty trail. */
  start: { x: number; y: number } | null;
  pointCount: number;
}

/** Scales the simplified runs uniformly into the box (padding on every side, centred) and writes them as path data. */
export function trailDrawing(locations: Location[], width: number, height: number, padding: number): TrailDrawing {
  const runs = simplifiedTrail(locations);
  const flat = runs.flat();
  if (flat.length === 0) return { paths: [], start: null, pointCount: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of flat) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const at = ([x, y]: XY) => ({ x: offsetX + (x - minX) * scale, y: offsetY + (y - minY) * scale });
  const round = (n: number) => Math.round(n * 10) / 10;
  const paths = runs.map((run) =>
    run
      .map((p, i) => {
        const { x, y } = at(p);
        return `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
      })
      .join(' ')
  );
  return { paths, start: at(runs[0][0]), pointCount: flat.length };
}

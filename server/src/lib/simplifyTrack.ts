// "Douglas-Peucker-lite" for live presence tracks: keeps the first and last point and the points that bend the line
// most, until at most `max` remain. Index based (the points carry a timestamp that must survive), flat-earth metres.
import type { PresencePoint } from '@game/sync/apiContract';

const M_PER_DEG_LAT = 111_320;

/** Indices to keep for a given tolerance (metres). Always includes 0 and the last index. */
function keepIndices(points: PresencePoint[], toleranceM: number): boolean[] {
  const n = points.length;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = keep[n - 1] = true;
  const lat0 = points[0].lat;
  const kx = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => (p.lon - points[0].lon) * kx);
  const ys = points.map((p) => (p.lat - lat0) * M_PER_DEG_LAT);
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const len = Math.hypot(xs[b] - xs[a], ys[b] - ys[a]);
    let worst = -1;
    let worstD = toleranceM;
    for (let i = a + 1; i < b; i++) {
      // distance to the segment's line, or to the end point when the segment is a single spot (a loop closing on itself)
      const d = len < 1e-9 ? Math.hypot(xs[i] - xs[a], ys[i] - ys[a]) : Math.abs((xs[b] - xs[a]) * (ys[a] - ys[i]) - (xs[a] - xs[i]) * (ys[b] - ys[a])) / len;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return keep;
}

/**
 * At most `max` points (max >= 2), in the original order. Under the limit the input is returned unchanged. Over it the
 * tolerance is doubled from 1 m until the result fits (a handful of passes); a last resort thins evenly.
 */
export function simplifyTrack(points: PresencePoint[], max: number): PresencePoint[] {
  if (points.length <= max) return points;
  let tolerance = 1;
  for (let pass = 0; pass < 24; pass++, tolerance *= 2) {
    const keep = keepIndices(points, tolerance);
    const kept = points.filter((_, i) => keep[i]);
    if (kept.length <= max) return kept;
  }
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

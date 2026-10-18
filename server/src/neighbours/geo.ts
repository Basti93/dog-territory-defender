// Small flat-earth helpers for the neighbour generator (distances here are at most a few km).
import { getDistance } from '@game/utils/geometry';

export const M_PER_DEG_LAT = 111_320;

export type LatLng = [number, number];

export const distanceM = (a: LatLng, b: LatLng): number => getDistance(a[0], a[1], b[0], b[1]);

/** Moves `from` by (eastM, northM) metres. */
export function offsetLatLng(from: LatLng, eastM: number, northM: number): LatLng {
  const lat = from[0] + northM / M_PER_DEG_LAT;
  const lon = from[1] + eastM / (M_PER_DEG_LAT * Math.cos((from[0] * Math.PI) / 180));
  return [lat, lon];
}

/** Point at `distM` metres from `from` in direction `bearingRad` (0 = north, clockwise). */
export function pointAt(from: LatLng, distM: number, bearingRad: number): LatLng {
  return offsetLatLng(from, Math.sin(bearingRad) * distM, Math.cos(bearingRad) * distM);
}

export function polylineLengthM(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  return total;
}

/** Douglas-Peucker on a short polyline, tolerance in metres. */
export function simplify(points: LatLng[], toleranceM: number): LatLng[] {
  if (points.length <= 2) return points;
  const lat0 = points[0][0];
  const kx = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const xy = points.map((p) => [(p[1] - points[0][1]) * kx, (p[0] - points[0][0]) * M_PER_DEG_LAT]);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let worstD = toleranceM;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len;
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
  return points.filter((_, i) => keep[i]);
}

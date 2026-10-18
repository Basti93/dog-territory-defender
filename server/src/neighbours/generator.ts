// Walk generation (design Decision 18): a pure function of (graph, archetype, seed, constraints).
// Two generators: `osm` (random-walk loops on the cached street graph) and `offset` (jittered copies of the
// household's own routes, the degraded fallback). Both end in resample(), which makes ordinary Location[].
import type { Location } from '@game/types';
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import type { Rng } from './rng';
import { distanceM, offsetLatLng, polylineLengthM, type LatLng } from './geo';
import { expandSteps, nearestNode, type GEdge, type Graph, type Step } from './graph';

const GEO = NEIGHBOUR_CONFIG.geo;

export interface GeneratedRoute {
  points: LatLng[];
  lengthM: number;
}

export interface LoopRequest {
  graph: Graph;
  homeNode: number;
  targetM: number;
  rng: Rng;
  /** True for points the walk must never touch (home block, and the real Range for ordinary walks). */
  excluded: (p: LatLng) => boolean;
  /** Reaction walks: the loop must pass near this point. */
  via?: LatLng;
}

class MinHeap {
  private a: Array<[number, number]> = [];
  get size() {
    return this.a.length;
  }
  push(cost: number, id: number) {
    const a = this.a;
    a.push([cost, id]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Walkable view of the graph with excluded nodes and edges removed (memoised per node). */
function walkableView(graph: Graph, excluded: (p: LatLng) => boolean) {
  const nodeOk = new Map<number, boolean>();
  const okNode = (id: number) => {
    let v = nodeOk.get(id);
    if (v === undefined) {
      const p = graph.nodes.get(id);
      v = !!p && !excluded(p);
      nodeOk.set(id, v);
    }
    return v;
  };
  // An edge is walkable only if every point along it (sampled at the route spacing) is allowed: a long straight
  // edge between two fine nodes can still cut through excluded ground.
  const edgeOk = (from: number, e: GEdge): boolean => {
    if (!okNode(e.to)) return false;
    const pts: LatLng[] = [graph.nodes.get(from)!, ...e.mid, graph.nodes.get(e.to)!];
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(distanceM(pts[i - 1], pts[i]) / GEO.routeSpacingM));
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        if (excluded([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u])) return false;
      }
    }
    return true;
  };
  const edgesOf = new Map<number, GEdge[]>();
  const edges = (id: number): GEdge[] => {
    let list = edgesOf.get(id);
    if (!list) {
      list = okNode(id) ? (graph.adj.get(id) ?? []).filter((e) => edgeOk(id, e)) : [];
      edgesOf.set(id, list);
    }
    return list;
  };
  return { okNode, edges };
}

function shortest(
  edges: (id: number) => GEdge[],
  from: number,
  to: number,
  used: Map<string, number>
): Step[] | null {
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, Step>();
  const heap = new MinHeap();
  heap.push(0, from);
  while (heap.size) {
    const [d, id] = heap.pop();
    if (id === to) break;
    if (d > (dist.get(id) ?? Infinity)) continue;
    for (const e of edges(id)) {
      const cost = d + e.len * (1 + 2 * (used.get(edgeKey(id, e.to)) ?? 0));
      if (cost < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, cost);
        prev.set(e.to, { from: id, edge: e });
        heap.push(cost, e.to);
      }
    }
  }
  if (from !== to && !prev.has(to)) return null;
  const steps: Step[] = [];
  for (let cur = to; cur !== from; ) {
    const s = prev.get(cur)!;
    steps.push(s);
    cur = s.from;
  }
  return steps.reverse();
}

const stepsLength = (steps: Step[]) => steps.reduce((s, st) => s + st.edge.len, 0);

/** Non-backtracking random walk out, shortest path (preferring unused edges) back. Null = skip this slot. */
export function generateLoop(req: LoopRequest): GeneratedRoute | null {
  const { graph, homeNode, targetM, rng } = req;
  const { edges, okNode } = walkableView(graph, req.excluded);
  if (!okNode(homeNode) || edges(homeNode).length === 0) return null;
  const home = graph.nodes.get(homeNode)!;
  const tol = GEO.lengthTolerance;
  const bestRef: { v: { steps: Step[]; err: number } | null } = { v: null };

  const consider = (steps: Step[]) => {
    const err = Math.abs(stepsLength(steps) - targetM) / targetM;
    if (!bestRef.v || err < bestRef.v.err) bestRef.v = { steps, err };
  };

  let viaNode: number | null = null;
  if (req.via) {
    const n = nearestNode(graph, req.via, okNode);
    if (n && n.distM <= 300) viaNode = n.id;
    else return null;
  }

  for (let attempt = 0; attempt < 24 && (!bestRef.v || bestRef.v.err > tol); attempt++) {
    const used = new Map<string, number>();
    const steps: Step[] = [];
    const markUsed = (s: Step) => used.set(edgeKey(s.from, s.edge.to), (used.get(edgeKey(s.from, s.edge.to)) ?? 0) + 1);
    let cur = homeNode;
    let prev = -1;
    let len = 0;

    if (viaNode !== null) {
      const out = shortest(edges, homeNode, viaNode, used);
      if (!out) return null;
      out.forEach((s) => {
        steps.push(s);
        markUsed(s);
      });
      cur = viaNode;
    } else {
      // outbound until outbound + estimated way back (straight line x 1.25) reaches the target
      for (let guard = 0; guard < 2000; guard++) {
        const back = distanceM(graph.nodes.get(cur)!, home) * 1.25;
        if (len + back >= targetM) break;
        const options = edges(cur);
        if (options.length === 0) break;
        const weights = options.map((e) => (e.to === prev && options.length > 1 ? 0.03 : 1) / (1 + 3 * (used.get(edgeKey(cur, e.to)) ?? 0)));
        const edge = options[rng.weighted(weights)];
        const step = { from: cur, edge };
        steps.push(step);
        markUsed(step);
        len += edge.len;
        prev = cur;
        cur = edge.to;
      }
    }
    const back = shortest(edges, cur, homeNode, used);
    if (!back) continue;
    consider([...steps, ...back]);
  }

  const chosen = bestRef.v;
  if (!chosen) return null;
  if (viaNode !== null) {
    const len = stepsLength(chosen.steps);
    if (len < GEO.loopMinM || len > GEO.loopMaxM * (1 + tol)) return null;
  } else if (chosen.err > tol) {
    return null;
  }
  const points = expandSteps(graph, homeNode, chosen.steps);
  return { points, lengthM: polylineLengthM(points) };
}

// ---------------------------------------------------------------- offset fallback

/**
 * Degraded mode: translate (300-1500 m) and rotate one of the household's own routes, jitter it, drop what falls
 * in excluded ground and keep the longest contiguous remainder (capped at the target length).
 */
export function generateOffsetRoute(
  hostRoutes: LatLng[][],
  targetM: number,
  rng: Rng,
  excluded: (p: LatLng) => boolean
): GeneratedRoute | null {
  const usable = hostRoutes.filter((r) => r.length >= 10);
  if (usable.length === 0) return null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const route = usable[rng.int(0, usable.length - 1)];
    const centroid: LatLng = [route.reduce((s, p) => s + p[0], 0) / route.length, route.reduce((s, p) => s + p[1], 0) / route.length];
    const shiftDist = rng.range(GEO.offsetMinM, GEO.offsetMaxM);
    const shiftAngle = rng.range(0, Math.PI * 2);
    const rot = rng.range(-0.7, 0.7);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const kx = Math.cos((centroid[0] * Math.PI) / 180);
    const moved: LatLng[] = route.map((p) => {
      const east = (p[1] - centroid[1]) * 111_320 * kx;
      const north = (p[0] - centroid[0]) * 111_320;
      const re = east * cos - north * sin + Math.sin(shiftAngle) * shiftDist + rng.range(-3, 3);
      const rn = east * sin + north * cos + Math.cos(shiftAngle) * shiftDist + rng.range(-3, 3);
      return offsetLatLng(centroid, re, rn);
    });
    // contiguous allowed runs
    let bestRun: LatLng[] = [];
    let run: LatLng[] = [];
    const flush = () => {
      if (polylineLengthM(run) > polylineLengthM(bestRun)) bestRun = run;
      run = [];
    };
    for (const p of moved) {
      if (excluded(p)) flush();
      else run.push(p);
    }
    flush();
    // cap at the target length
    const capped: LatLng[] = [];
    let len = 0;
    for (const p of bestRun) {
      if (capped.length) len += distanceM(capped[capped.length - 1], p);
      capped.push(p);
      if (len >= targetM) break;
    }
    if (len >= GEO.offsetMinRemainingM) return { points: capped, lengthM: len };
  }
  return null;
}

// ---------------------------------------------------------------- timing

/** Resamples to ~routeSpacingM and stamps timestamps from a walking speed (+-10% per leg). */
export function resample(points: LatLng[], startMs: number, speedMs: number, rng: Rng): Location[] {
  const out: Location[] = [];
  if (points.length === 0) return out;
  let t = startMs;
  const push = (p: LatLng) => out.push({ latitude: p[0], longitude: p[1], timestamp: Math.round(t), accuracy: 5 });
  push(points[0]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = distanceM(a, b);
    const n = Math.max(1, Math.round(d / GEO.routeSpacingM));
    for (let s = 1; s <= n; s++) {
      const u = s / n;
      const legM = d / n;
      t += (legM / (speedMs * rng.range(0.9, 1.1))) * 1000;
      push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
  }
  return out;
}

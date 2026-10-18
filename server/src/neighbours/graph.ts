// Street graph from Overpass ways (design Decision 18). Tiles are simplified to junction nodes plus
// polylines, stored gzipped, and merged on demand. Pure data code: no I/O.
import { gunzipSync, gzipSync } from 'node:zlib';
import { distanceM, polylineLengthM, simplify, type LatLng } from './geo';

export interface OverpassWay {
  type: 'way';
  id: number;
  nodes: number[];
  geometry: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: Array<OverpassWay | { type: string }>;
}

/** Wire format of one stored tile. */
interface TileData {
  v: 1;
  nodes: Array<[number, number, number]>; // id, lat, lon
  edges: Array<[number, number, number, number[]]>; // a, b, lengthM, flat [lat, lon, ...] intermediate points from a to b
}

export interface GEdge {
  to: number;
  len: number;
  /** Intermediate points from this edge's start to `to` (exclusive of both ends). */
  mid: LatLng[];
}

export interface Graph {
  nodes: Map<number, LatLng>;
  adj: Map<number, GEdge[]>;
}

const SIMPLIFY_TOLERANCE_M = 5;
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function emptyGraph(): Graph {
  return { nodes: new Map(), adj: new Map() };
}

/** Overpass `out geom` JSON -> compact tile (junction nodes + simplified polylines). */
export function tileFromOverpass(json: OverpassResponse): TileData {
  const ways = json.elements.filter((e): e is OverpassWay => e.type === 'way' && Array.isArray((e as OverpassWay).nodes) && Array.isArray((e as OverpassWay).geometry));
  const uses = new Map<number, number>();
  for (const w of ways) for (const id of w.nodes) uses.set(id, (uses.get(id) ?? 0) + 1);
  const nodes = new Map<number, LatLng>();
  const edges: TileData['edges'] = [];
  for (const w of ways) {
    if (w.nodes.length < 2 || w.nodes.length !== w.geometry.length) continue;
    let startIdx = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      const isStop = i === w.nodes.length - 1 || (uses.get(w.nodes[i]) ?? 0) > 1;
      if (!isStop) continue;
      const pts: LatLng[] = w.geometry.slice(startIdx, i + 1).map((g) => [g.lat, g.lon]);
      const a = w.nodes[startIdx];
      const b = w.nodes[i];
      if (a !== b) {
        const len = polylineLengthM(pts);
        const simp = simplify(pts, SIMPLIFY_TOLERANCE_M);
        nodes.set(a, [round5(pts[0][0]), round5(pts[0][1])]);
        nodes.set(b, [round5(pts[pts.length - 1][0]), round5(pts[pts.length - 1][1])]);
        edges.push([a, b, Math.round(len), simp.slice(1, -1).flatMap((p) => [round5(p[0]), round5(p[1])])]);
      }
      startIdx = i;
    }
  }
  return { v: 1, nodes: Array.from(nodes, ([id, p]) => [id, p[0], p[1]] as [number, number, number]), edges };
}

export function gzipTile(tile: TileData): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(tile)));
}

export function addTile(graph: Graph, gz: Buffer): void {
  const tile = JSON.parse(gunzipSync(gz).toString('utf8')) as TileData;
  for (const [id, lat, lon] of tile.nodes) graph.nodes.set(id, [lat, lon]);
  const link = (from: number, to: number, len: number, mid: LatLng[]) => {
    const list = graph.adj.get(from) ?? [];
    if (!list.some((e) => e.to === to && e.len === len)) list.push({ to, len, mid });
    graph.adj.set(from, list);
  };
  for (const [a, b, len, flat] of tile.edges) {
    const mid: LatLng[] = [];
    for (let i = 0; i < flat.length; i += 2) mid.push([flat[i], flat[i + 1]]);
    link(a, b, len, mid);
    link(b, a, len, [...mid].reverse());
  }
}

export function nearestNode(graph: Graph, p: LatLng, allowed?: (id: number) => boolean): { id: number; distM: number } | null {
  let best: { id: number; distM: number } | null = null;
  for (const [id, ll] of graph.nodes) {
    if (!graph.adj.has(id) || (allowed && !allowed(id))) continue;
    const d = distanceM(p, ll);
    if (!best || d < best.distM) best = { id, distM: d };
  }
  return best;
}

export interface Step {
  from: number;
  edge: GEdge;
}

/** Polyline of a walked sequence of edges (node coordinates plus each edge's intermediate points). */
export function expandSteps(graph: Graph, home: number, steps: Step[]): LatLng[] {
  const out: LatLng[] = [graph.nodes.get(home)!];
  for (const s of steps) {
    out.push(...s.edge.mid, graph.nodes.get(s.edge.to)!);
  }
  return out;
}

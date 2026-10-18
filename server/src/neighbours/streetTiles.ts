// Overpass street tiles on a coarse global grid, cached in Postgres (design Decision 18).
// A request names only a ~2 km grid tile, never an exact position or the Range shape (privacy note, Decision 12).
import { inArray } from 'drizzle-orm';
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import type { Db } from '../db/client';
import { streetTiles } from '../db/schema';
import { localMinutesOfDay } from '../lib/time';
import { addTile, emptyGraph, gzipTile, tileFromOverpass, type Graph, type OverpassResponse } from './graph';
import type { LatLng } from './geo';

export const TILE_LAT_DEG = 0.02; // ~2.2 km
export const TILE_LON_DEG = 0.03; // ~2.2 km at 48 degrees north
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

const HIGHWAYS = 'footway|path|pedestrian|living_street|residential|service|track|cycleway|unclassified';

export const tileIdFor = (lat: number, lon: number) => `${Math.floor(lat / TILE_LAT_DEG)}:${Math.floor(lon / TILE_LON_DEG)}`;

function tileBounds(id: string): { south: number; west: number; north: number; east: number } {
  const [y, x] = id.split(':').map(Number);
  return { south: y * TILE_LAT_DEG, west: x * TILE_LON_DEG, north: (y + 1) * TILE_LAT_DEG, east: (x + 1) * TILE_LON_DEG };
}

/** Tiles covering the square of half-width `radiusM` around `centre`. */
export function tilesAround(centre: LatLng, radiusM: number): string[] {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((centre[0] * Math.PI) / 180));
  const y0 = Math.floor((centre[0] - dLat) / TILE_LAT_DEG);
  const y1 = Math.floor((centre[0] + dLat) / TILE_LAT_DEG);
  const x0 = Math.floor((centre[1] - dLon) / TILE_LON_DEG);
  const x1 = Math.floor((centre[1] + dLon) / TILE_LON_DEG);
  const ids: string[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ids.push(`${y}:${x}`);
  return ids;
}

export interface OverpassDeps {
  /** Empty = Overpass disabled: nothing is fetched and the offset fallback is used. */
  url: string;
  fetchImpl?: typeof fetch;
  /** Pause between sequential fetches (ms). */
  pauseMs?: number;
}

export async function fetchTile(deps: OverpassDeps, tileId: string): Promise<OverpassResponse> {
  const b = tileBounds(tileId);
  const query = `[out:json][timeout:25];way["highway"~"^(${HIGHWAYS})$"]["access"!~"^(private|no)$"](${b.south},${b.west},${b.north},${b.east});out geom;`;
  const res = await (deps.fetchImpl ?? fetch)(deps.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'dog-territory-defender-server/0.1 (self-hosted game backend)' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('overpass response too large');
  return JSON.parse(text) as OverpassResponse;
}

export function isQuietFetchHour(now: number, timeZone: string): boolean {
  const hour = Math.floor(localMinutesOfDay(now, timeZone) / 60);
  const { from, to } = NEIGHBOUR_CONFIG.scheduler.quietFetchHours;
  return hour >= from && hour < to;
}

/**
 * Fetches up to `limit` tiles that are missing (or failed long enough ago), one at a time. Returns how many were
 * fetched. Errors are swallowed per tile: the tile is marked `failed` and retried later; the offset fallback
 * covers the gap.
 */
export async function ensureTiles(db: Db, deps: OverpassDeps, tileIds: string[], now: number, limit: number): Promise<number> {
  if (!deps.url || tileIds.length === 0 || limit <= 0) return 0;
  const { tileRetryAfterMs, tileRefreshAfterMs } = NEIGHBOUR_CONFIG.scheduler;
  const have = await db.select({ id: streetTiles.tileId, fetchedAt: streetTiles.fetchedAt, status: streetTiles.status }).from(streetTiles).where(inArray(streetTiles.tileId, tileIds));
  const byId = new Map(have.map((r) => [r.id, r]));
  const todo = tileIds.filter((id) => {
    const r = byId.get(id);
    if (!r) return true;
    if (r.status === 'failed') return now - r.fetchedAt >= tileRetryAfterMs;
    return now - r.fetchedAt >= tileRefreshAfterMs;
  });
  let fetched = 0;
  for (const id of todo.slice(0, limit)) {
    if (fetched > 0 && deps.pauseMs) await new Promise((r) => setTimeout(r, deps.pauseMs));
    let row: { graph: Buffer | null; status: string };
    try {
      const gz = gzipTile(tileFromOverpass(await fetchTile(deps, id)));
      row = gz.length > MAX_STORED_BYTES ? { graph: null, status: 'empty' } : { graph: gz, status: 'ok' };
      if (row.status === 'ok' && isEmptyTile(gz)) row = { graph: null, status: 'empty' };
    } catch {
      row = { graph: null, status: 'failed' };
    }
    await db
      .insert(streetTiles)
      .values({ tileId: id, fetchedAt: now, graph: row.graph, status: row.status })
      .onConflictDoUpdate({ target: streetTiles.tileId, set: { fetchedAt: now, graph: row.graph, status: row.status } });
    fetched++;
  }
  return fetched;
}

function isEmptyTile(gz: Buffer): boolean {
  const g = emptyGraph();
  addTile(g, gz);
  return g.adj.size === 0;
}

/** Merged graph of the cached tiles around `centre`. Missing tiles are simply absent. */
export async function loadGraphAround(db: Db, centre: LatLng, radiusM: number): Promise<Graph> {
  const rows = await db.select({ graph: streetTiles.graph }).from(streetTiles).where(inArray(streetTiles.tileId, tilesAround(centre, radiusM)));
  const graph = emptyGraph();
  for (const r of rows) if (r.graph) addTile(graph, Buffer.from(r.graph));
  return graph;
}

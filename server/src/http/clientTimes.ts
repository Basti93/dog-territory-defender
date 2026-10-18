// Client millisecond timestamps -> integers, applied at the HTTP boundary so services and bigint columns can assume
// integers. iOS (expo-location) reports fractional ms (e.g. 1792359406662.5527); Postgres refuses a fractional value
// for a bigint ("invalid input syntax for type bigint") and the upload was a 500. The schemas keep Type.Number on
// purpose: rejecting with 400 would strand the walk in the phone's outbox, rounding accepts it.
import type { ApiMyStats, ImportRequest, LogUploadRequest, PresenceUpdateRequest, WalkUploadRequest } from '@game/sync/apiContract';

const toMs = (v: number): number => Math.round(v);

const roundLocations = <L extends { timestamp: number }>(locations: L[]): L[] => locations.map((l) => ({ ...l, timestamp: toMs(l.timestamp) }));

export function normalizeWalkUpload(req: WalkUploadRequest): WalkUploadRequest {
  return { ...req, startTime: toMs(req.startTime), locations: roundLocations(req.locations) };
}

export function normalizePresence(req: PresenceUpdateRequest): PresenceUpdateRequest {
  return { ...req, startedAt: toMs(req.startedAt), points: req.points.map((p) => ({ ...p, t: toMs(p.t) })) };
}

export function normalizeLogUpload(req: LogUploadRequest): LogUploadRequest {
  return { ...req, entries: req.entries.map((e) => ({ ...e, t: toMs(e.t) })) };
}

export function normalizeImport(req: ImportRequest): ImportRequest {
  return {
    ...req,
    walks: req.walks.map((w) => ({ ...w, startTime: toMs(w.startTime), locations: roundLocations(w.locations) })),
    cells: req.cells.map((c) => ({ ...c, lastRefreshed: toMs(c.lastRefreshed), lastTracked: toMs(c.lastTracked) })),
    territories: req.territories.map((t) => ({ ...t, createdAt: toMs(t.createdAt) })),
    den: { ...req.den, lastTickAt: toMs(req.den.lastTickAt) },
  };
}

export function normalizeMyStats(req: ApiMyStats): ApiMyStats {
  return {
    stats: { ...req.stats, firstWalkAt: req.stats.firstWalkAt === null ? null : toMs(req.stats.firstWalkAt) },
    achievements: req.achievements.map((a) => ({ ...a, unlockedAt: toMs(a.unlockedAt) })),
  };
}

// Live presence of walks in progress (M4 "Alex im Hof"). Ephemeral and household-private: a heartbeat upserts one
// row per (player, walk) with the simplified route so far; the OTHER household members read it (full route, the 100 m
// start fuzz of the neighbours does not apply inside a household). Never written to the events feed, never kept after
// the walk: the final walk arrives through the normal walk upload.
import { and, eq, isNull, lt, max, ne, sql } from 'drizzle-orm';
import { API_LIMITS, type PresenceEntry, type PresencePoint, type PresenceResponse, type PresenceUpdateRequest } from '@game/sync/apiContract';
import type { Db } from '../db/client';
import { players, walkPresence } from '../db/schema';
import { simplifyTrack } from '../lib/simplifyTrack';
import type { EventBus } from './events';
import type { AuthCtx } from './walks';

/** Rows whose last heartbeat is older than this are purged (hourly). */
export const PRESENCE_RETENTION_MS = 6 * 3600_000;

/** Presence waiters use their own bus channel so heartbeats never wake the events long-polls. */
export const presenceChannel = (householdId: string) => `presence:${householdId}`;

const isPoints = (v: unknown): v is PresencePoint[] => Array.isArray(v);

/** Appends the new fixes (strictly newer than the stored last one, oldest first) and keeps at most maxPresencePoints. */
export function mergePresencePoints(stored: PresencePoint[], incoming: PresencePoint[]): PresencePoint[] {
  const lastT = stored.length > 0 ? stored[stored.length - 1].t : -Infinity;
  const fresh = [...incoming].sort((a, b) => a.t - b.t).filter((p, i, all) => p.t > lastT && (i === 0 || all[i - 1].t !== p.t));
  return simplifyTrack([...stored, ...fresh], API_LIMITS.maxPresencePoints);
}

export async function recordPresence(db: Db, bus: EventBus, auth: AuthCtx, req: PresenceUpdateRequest, now: number): Promise<void> {
  await db.transaction(async (tx) => {
    const dbx = tx as unknown as Db;
    const [row] = await dbx
      .select()
      .from(walkPresence)
      .where(and(eq(walkPresence.playerId, auth.playerId), eq(walkPresence.walkId, req.walkId)))
      .for('update');
    if (!row) {
      if (req.ended) return; // nothing was ever shown for this walk
      // One walk at a time per player: a forgotten earlier walk must not keep a ghost sign up.
      await dbx
        .update(walkPresence)
        .set({ endedAt: now, updatedAt: now })
        .where(and(eq(walkPresence.playerId, auth.playerId), isNull(walkPresence.endedAt), ne(walkPresence.walkId, req.walkId)));
      await dbx.insert(walkPresence).values({
        householdId: auth.householdId,
        playerId: auth.playerId,
        walkId: req.walkId,
        startedAt: req.startedAt,
        updatedAt: now,
        points: mergePresencePoints([], req.points),
        endedAt: null,
      });
      return;
    }
    if (row.endedAt !== null) return; // an ended walk is never revived by a late heartbeat
    await dbx
      .update(walkPresence)
      .set({
        points: mergePresencePoints(isPoints(row.points) ? row.points : [], req.points),
        updatedAt: now,
        endedAt: req.ended ? now : null,
      })
      .where(and(eq(walkPresence.playerId, auth.playerId), eq(walkPresence.walkId, req.walkId)));
  });
  bus.notify(presenceChannel(auth.householdId));
}

/** Closes the presence of an uploaded walk (the upload is the proof the walk is over, even if the `ended` heartbeat was lost). Runs inside the upload transaction. */
export async function endPresenceForWalk(dbx: Db, playerId: string, walkId: string, now: number): Promise<void> {
  await dbx
    .update(walkPresence)
    .set({ endedAt: now, updatedAt: now })
    .where(and(eq(walkPresence.playerId, playerId), eq(walkPresence.walkId, walkId), isNull(walkPresence.endedAt)));
}

/** The other members' walks in progress. `rev` is the newest update among their rows, ended ones included, so an end changes it. */
export async function readPresence(db: Db, auth: AuthCtx, now: number): Promise<PresenceResponse> {
  const others = and(eq(walkPresence.householdId, auth.householdId), ne(walkPresence.playerId, auth.playerId));
  const [{ rev }] = await db.select({ rev: max(walkPresence.updatedAt) }).from(walkPresence).where(others);
  const rows = await db
    .select({
      playerId: walkPresence.playerId,
      name: players.displayName,
      walkId: walkPresence.walkId,
      startedAt: walkPresence.startedAt,
      points: walkPresence.points,
      updatedAt: walkPresence.updatedAt,
    })
    .from(walkPresence)
    .innerJoin(players, eq(players.id, walkPresence.playerId))
    .where(and(others, isNull(walkPresence.endedAt)))
    .orderBy(sql`${walkPresence.updatedAt} desc`);
  const seen = new Set<string>();
  const presence: PresenceEntry[] = [];
  for (const r of rows) {
    if (seen.has(r.playerId)) continue; // newest walk per person
    seen.add(r.playerId);
    presence.push({ ...r, points: isPoints(r.points) ? r.points : [] });
  }
  return { rev: rev ?? 0, presence, serverTime: now };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

/**
 * GET /v1/presence. Without `after` (or with wait 0) it answers at once. With `after` = the caller's last rev it parks
 * until the others' presence changes (a heartbeat or an end wakes it) or `waitSeconds` pass, then answers either way.
 */
export async function pullPresenceLongPoll(
  db: Db,
  bus: EventBus,
  auth: AuthCtx,
  after: number | undefined,
  waitSeconds: number,
  maxWaiters: number,
  now: () => number,
  signal?: AbortSignal,
  cappedPauseMs = 2000
): Promise<PresenceResponse> {
  if (after === undefined || waitSeconds <= 0) return readPresence(db, auth, now());
  const channel = presenceChannel(auth.householdId);
  if (bus.waiterCount(channel) >= maxWaiters) {
    await sleep(cappedPauseMs, signal);
    return readPresence(db, auth, now());
  }
  // Subscribe first, then read: a heartbeat committed between the read and the wait still wakes us.
  const sub = bus.subscribe(channel, signal);
  try {
    const deadline = Date.now() + Math.min(waitSeconds, API_LIMITS.maxEventWaitSeconds) * 1000;
    let result = await readPresence(db, auth, now());
    while (result.rev === after && Date.now() < deadline && !signal?.aborted && !bus.isShutdown) {
      await sub.wait(deadline - Date.now());
      result = await readPresence(db, auth, now());
    }
    return result;
  } finally {
    sub.dispose();
  }
}

/** Deletes rows whose last heartbeat is older than PRESENCE_RETENTION_MS. Returns the number deleted. */
export async function purgeStalePresence(db: Db, now: number): Promise<number> {
  const deleted = await db.delete(walkPresence).where(lt(walkPresence.updatedAt, now - PRESENCE_RETENTION_MS)).returning({ playerId: walkPresence.playerId });
  return deleted.length;
}

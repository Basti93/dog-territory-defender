// Device log shipping (server side). Ingest is idempotent per (device, deviceSeq); reads happen only through
// the operator CLI (`cli logs`), never over HTTP.
import { and, count, desc, eq, gte, ilike, lt, type SQL } from 'drizzle-orm';
import { API_LIMITS, type LogUploadRequest } from '@game/sync/apiContract';
import type { Db } from '../db/client';
import { deviceLogs, devices } from '../db/schema';
import type { AuthCtx } from './walks';

export const DEVICE_LOG_RETENTION_MS = 14 * 24 * 3600_000;
const DAY_MS = 24 * 3600_000;

export type LogIngestResult = { kind: 'ok'; stored: number } | { kind: 'capped' };

/** Serialized UTF-8 size of a value, in bytes. */
function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * Stores a batch. Entries over maxLogEntryBytes are skipped (the app drops them too). The daily cap counts rows received
 * in the last 24 h for this device; a batch that would exceed it is refused whole (429 daily_cap).
 */
export async function ingestLogs(db: Db, auth: AuthCtx, req: LogUploadRequest, now: number): Promise<LogIngestResult> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(deviceLogs)
    .where(and(eq(deviceLogs.deviceId, auth.deviceId), gte(deviceLogs.receivedAt, now - DAY_MS)));
  if (n + req.entries.length > API_LIMITS.maxLogRowsPerDayPerDevice) return { kind: 'capped' };

  const rows = req.entries.flatMap((e, i) =>
    jsonBytes(e) > API_LIMITS.maxLogEntryBytes
      ? []
      : [
          {
            householdId: auth.householdId,
            deviceId: auth.deviceId,
            deviceSeq: req.deviceSeq + i,
            t: e.t,
            event: e.event,
            payload: e.payload,
            appState: e.appState,
            receivedAt: now,
          },
        ]
  );
  if (rows.length === 0) return { kind: 'ok', stored: 0 };
  const inserted = await db
    .insert(deviceLogs)
    .values(rows)
    .onConflictDoNothing({ target: [deviceLogs.deviceId, deviceLogs.deviceSeq] })
    .returning({ id: deviceLogs.id });
  return { kind: 'ok', stored: inserted.length };
}

/** Deletes rows received more than 14 days ago. Returns the number deleted. */
export async function purgeOldDeviceLogs(db: Db, now: number): Promise<number> {
  const deleted = await db.delete(deviceLogs).where(lt(deviceLogs.receivedAt, now - DEVICE_LOG_RETENTION_MS)).returning({ id: deviceLogs.id });
  return deleted.length;
}

export interface LogQuery {
  householdId: string;
  /** Device label or id. */
  device?: string;
  /** Only rows with t >= this (ms epoch). */
  sinceMs?: number;
  /** SQL LIKE pattern on the event tag, case-insensitive (e.g. WALK_%). */
  event?: string;
  limit: number;
}

export interface LogRow {
  t: number;
  event: string;
  payload: unknown;
  appState: string;
  deviceLabel: string;
  deviceSeq: number;
}

/** The newest `limit` matching rows, returned oldest first (reads like a log). */
export async function queryDeviceLogs(db: Db, q: LogQuery): Promise<LogRow[]> {
  const conds: SQL[] = [eq(deviceLogs.householdId, q.householdId)];
  if (q.device) {
    const isId = /^[0-9a-f-]{36}$/i.test(q.device);
    conds.push(isId ? eq(devices.id, q.device) : eq(devices.label, q.device));
  }
  if (q.sinceMs !== undefined) conds.push(gte(deviceLogs.t, q.sinceMs));
  if (q.event) conds.push(ilike(deviceLogs.event, q.event));
  const rows = await db
    .select({
      t: deviceLogs.t,
      event: deviceLogs.event,
      payload: deviceLogs.payload,
      appState: deviceLogs.appState,
      deviceLabel: devices.label,
      deviceSeq: deviceLogs.deviceSeq,
    })
    .from(deviceLogs)
    .innerJoin(devices, eq(devices.id, deviceLogs.deviceId))
    .where(and(...conds))
    .orderBy(desc(deviceLogs.t), desc(deviceLogs.deviceSeq))
    .limit(q.limit);
  return rows.reverse();
}

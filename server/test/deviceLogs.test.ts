import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { LogUploadRequest } from '@game/sync/apiContract';
import { deviceLogs } from '../src/db/schema';
import { formatLogLine, parseSince } from '../src/ops/logFormat';
import { DEVICE_LOG_RETENTION_MS, purgeOldDeviceLogs, queryDeviceLogs } from '../src/services/deviceLogs';
import { joinNew, makeServer, newHousehold, NOW, type Member, type TestServer } from './helpers';

let s: TestServer;
let m: Member;
let householdId: string;

beforeEach(async () => {
  s = await makeServer();
  householdId = (await newHousehold(s)).id;
  m = await joinNew(s, householdId);
});
afterEach(() => s.close());

const batch = (deviceSeq: number, n: number, event = 'WALK_START'): LogUploadRequest => ({
  deviceSeq,
  entries: Array.from({ length: n }, (_, i) => ({ t: NOW + i, event, payload: { i }, appState: 'active' })),
});
const post = (body: unknown, headers = m.auth) => s.app.inject({ method: 'POST', url: '/v1/logs', headers, payload: body as object });

describe('POST /v1/logs', () => {
  it('requires a token', async () => {
    expect((await post(batch(1, 1), {} as never)).statusCode).toBe(401);
  });

  it('stores entries with consecutive device_seq and is idempotent on resend', async () => {
    const first = await post(batch(1000, 3));
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ stored: 3 });
    const again = await post(batch(1000, 3));
    expect(again.json()).toEqual({ stored: 0 });
    // overlapping resend stores only the new tail
    const overlap = await post(batch(1002, 3));
    expect(overlap.json()).toEqual({ stored: 2 });
    const rows = await s.db.select().from(deviceLogs).where(eq(deviceLogs.householdId, householdId));
    expect(rows.map((r) => r.deviceSeq).sort()).toEqual([1000, 1001, 1002, 1003, 1004]);
  });

  it('rejects unknown properties, empty and oversized batches', async () => {
    expect((await post({ ...batch(1, 1), extra: 1 })).statusCode).toBe(400);
    expect((await post({ deviceSeq: 1, entries: [] })).statusCode).toBe(400);
    expect((await post(batch(1, 201))).statusCode).toBe(400);
    const big = { deviceSeq: 1, entries: [{ t: 1, event: 'X', payload: { blob: 'a'.repeat(70 * 1024) }, appState: 'active' }] };
    expect((await post(big)).statusCode).toBe(413);
  });

  it('skips single entries over 2 KB but stores the rest', async () => {
    const body: LogUploadRequest = {
      deviceSeq: 50,
      entries: [
        { t: 1, event: 'OK', payload: {}, appState: 'active' },
        { t: 2, event: 'HUGE', payload: { blob: 'a'.repeat(3000) }, appState: 'active' },
        { t: 3, event: 'OK2', payload: {}, appState: 'active' },
      ],
    };
    expect((await post(body)).json()).toEqual({ stored: 2 });
  });

  it('caps a device at 2000 rows per day with 429 daily_cap, and frees up a day later', async () => {
    for (let i = 0; i < 10; i++) expect((await post(batch(i * 200, 200))).statusCode).toBe(200);
    const over = await post(batch(5000, 1));
    expect(over.statusCode).toBe(429);
    expect(over.json()).toEqual({ error: 'daily_cap' });
    s.setNow(NOW + 25 * 3600_000);
    expect((await post(batch(5000, 1))).statusCode).toBe(200);
  });

  it('limits a device to 30 requests per 10 minutes', async () => {
    for (let i = 0; i < 30; i++) expect((await post(batch(i, 1))).statusCode).toBe(200);
    expect((await post(batch(100, 1))).statusCode).toBe(429);
    s.setNow(NOW + 11 * 60_000);
    expect((await post(batch(100, 1))).statusCode).toBe(200);
  });
});

describe('retention and query', () => {
  it('purges rows received more than 14 days ago', async () => {
    await post(batch(1, 2));
    s.setNow(NOW + DEVICE_LOG_RETENTION_MS - 1000);
    await post(batch(10, 1));
    expect(await purgeOldDeviceLogs(s.db, NOW + DEVICE_LOG_RETENTION_MS + 1000)).toBe(2);
    const left = await s.db.select().from(deviceLogs);
    expect(left).toHaveLength(1);
    expect(left[0].deviceSeq).toBe(10);
  });

  it('filters by event pattern, device label, since and limit (newest rows, oldest first)', async () => {
    await post({ deviceSeq: 1, entries: [
      { t: NOW - 3 * 3600_000, event: 'OLD', payload: {}, appState: 'active' },
      { t: NOW - 1000, event: 'WALK_START', payload: { a: 1 }, appState: 'active' },
      { t: NOW - 500, event: 'WALK_FINISHED', payload: { b: 2 }, appState: 'background' },
      { t: NOW - 100, event: 'SYNC_RUN_FAILED', payload: {}, appState: 'active' },
    ] });
    const base = { householdId };
    expect((await queryDeviceLogs(s.db, { ...base, limit: 10 })).map((r) => r.event)).toEqual(['OLD', 'WALK_START', 'WALK_FINISHED', 'SYNC_RUN_FAILED']);
    expect((await queryDeviceLogs(s.db, { ...base, limit: 10, event: 'WALK_%' })).map((r) => r.event)).toEqual(['WALK_START', 'WALK_FINISHED']);
    expect((await queryDeviceLogs(s.db, { ...base, limit: 10, sinceMs: NOW - 2 * 3600_000 })).map((r) => r.event)).not.toContain('OLD');
    expect((await queryDeviceLogs(s.db, { ...base, limit: 2 })).map((r) => r.event)).toEqual(['WALK_FINISHED', 'SYNC_RUN_FAILED']);
    expect(await queryDeviceLogs(s.db, { ...base, limit: 10, device: 'no such phone' })).toEqual([]);
    expect(await queryDeviceLogs(s.db, { ...base, limit: 10, device: 'test phone' })).toHaveLength(4);
  });
});

describe('CLI formatting', () => {
  it('formats one line per entry', () => {
    const line = formatLogLine({ t: Date.UTC(2026, 9, 18, 12, 0, 0), event: 'WALK_START', payload: { id: 'w1' }, appState: 'active', deviceLabel: 'Pixel', deviceSeq: 1 });
    expect(line).toBe('2026-10-18T12:00:00.000Z  Pixel  active  [WALK_START] {"id":"w1"}');
  });

  it('parses --since spans', () => {
    expect(parseSince('2h', 10_000_000)).toBe(10_000_000 - 7_200_000);
    expect(parseSince('30m', 10_000_000)).toBe(10_000_000 - 1_800_000);
    expect(parseSince('3d', 1e9)).toBe(1e9 - 3 * 86_400_000);
    expect(() => parseSince('yesterday', 0)).toThrow(/--since/);
  });
});

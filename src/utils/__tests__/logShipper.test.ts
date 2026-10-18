import { ApiError } from '../../sync/apiClient';
import type { LogUploadRequest } from '../../sync/apiContract';
import type { SyncIdentity } from '../../storage/SettingsRepository';
import { createLogShipper, redact, SHIPPER_LIMITS } from '../logShipper';

const IDENTITY: SyncIdentity = { serverUrl: 'http://x', token: 'tok', householdId: 'h', playerId: 'p', deviceId: 'd', playerName: 'S' };

function setup(opts: { joined?: boolean; enabled?: boolean; fail?: ApiError | null } = {}) {
  const state = { now: 1_000_000, joined: opts.joined ?? true, enabled: opts.enabled ?? true, fail: opts.fail ?? null };
  const sent: LogUploadRequest[] = [];
  const shipper = createLogShipper({
    now: () => state.now,
    getIdentity: async () => (state.joined ? IDENTITY : null),
    isEnabled: async () => state.enabled,
    setEnabled: async (v) => {
      state.enabled = v;
    },
    send: async (_id, req) => {
      if (state.fail) throw state.fail;
      sent.push(req);
    },
    initialSeq: 100,
  });
  const add = (n: number, event = 'E', payload: Record<string, unknown> = {}) => {
    for (let i = 0; i < n; i++) shipper.append(event, { i, ...payload }, 'active');
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { state, sent, shipper, add, settle };
}

describe('redact', () => {
  it('GPS_UPDATE keeps accuracy and timestamp, drops lat/lon', () => {
    expect(redact('GPS_UPDATE', { lat: 48.1, lon: 11.5, accuracy: 7, gpsTimestamp: 123 })).toEqual({ accuracy: 7, gpsTimestamp: 123 });
    expect(redact('GPS_FIX_REJECTED', { accuracy: 90, lat: 1, lon: 2 })).toEqual({ accuracy: 90 });
  });

  it('WALK_* keeps ids and counts, drops positions and routes at any depth', () => {
    expect(redact('WALK_START', { id: 'w1', lat: 48.1, lon: 11.5, watching: true, foreground: 'granted' })).toEqual({
      id: 'w1',
      watching: true,
      foreground: 'granted',
    });
    expect(redact('WALK_FINISHED', { id: 'w1', points: 400, cellsPainted: 30, newGroundCells: 5, qualifies: true })).toEqual({
      id: 'w1',
      points: 400,
      cellsPainted: 30,
      newGroundCells: 5,
      qualifies: true,
    });
    expect(redact('WALK_X', { id: 'w', nested: { locations: [{ latitude: 1 }], keep: 1 } })).toEqual({ id: 'w', nested: { keep: 1 } });
    expect(redact('WALK_PORTRAIT_MESSAGE_PARSE_ERROR', { error: 'boom', raw: '{"route":[]}' })).toEqual({ error: 'boom' });
  });

  it('TREATS_* passes its numbers through untouched', () => {
    const payload = { walkId: 'w1', startSource: 'button', amount: 12, walkOrderToday: 1, dailyMultiplier: 1.5, before: 3, after: 15 };
    expect(redact('TREATS_AWARD', payload)).toEqual(payload);
    expect(redact('TREATS_PASSIVE_ACCRUAL', { before: 1, after: 2, elapsedHours: 0.5 })).toEqual({ before: 1, after: 2, elapsedHours: 0.5 });
  });

  it('never lets tokens, invite codes or backup content through', () => {
    expect(redact('SYNC_X', { token: 'abc', deviceToken: 'abc', inviteCode: 'ABCD', code: 'x', authorization: 'Bearer abc', ok: 1 })).toEqual({ ok: 1 });
    expect(redact('BACKUP_SHARED', { json: '{"walks":[]}', bytes: 1200, ok: true, backup: { a: 1 } })).toEqual({ bytes: 1200, ok: true });
    expect(redact('SYNC_RUN_FAILED', { error: 'HTTP 401 with Bearer abc.def-123 at 48.13701,11.57502' })).toEqual({
      error: 'HTTP 401 with Bearer [redacted] at [coords]',
    });
  });

  it('summarises long arrays and handles errors and odd values', () => {
    expect(redact('E', { ids: Array.from({ length: 50 }, (_, i) => i) })).toEqual({ ids: '[50 items]' });
    expect(redact('E', { err: new Error('x'), fn: () => 1, big: BigInt(3) })).toEqual({ err: { name: 'Error', message: 'x' }, big: '3' });
  });
});

describe('ring buffer', () => {
  it('keeps at most 500 entries, dropping the oldest', async () => {
    const { shipper, add } = setup({ joined: false });
    add(600);
    expect(shipper.pendingCount()).toBe(SHIPPER_LIMITS.maxBuffered);
  });

  it('drops entries over 2 KB', () => {
    const { shipper, add } = setup({ joined: false });
    add(1, 'BIG', { blob: 'a'.repeat(3000) });
    expect(shipper.pendingCount()).toBe(0);
    add(1, 'SMALL', { blob: 'a'.repeat(500) });
    expect(shipper.pendingCount()).toBe(1);
  });

  it('never buffers raw coordinates', async () => {
    const { shipper, state, sent, settle } = setup();
    shipper.append('GPS_UPDATE', { lat: 48.1, lon: 11.5, accuracy: 5 }, 'active');
    state.now += 61_000;
    await shipper.flush();
    await settle();
    expect(JSON.stringify(sent)).not.toContain('48.1');
    expect(sent[0].entries[0].payload).toEqual({ accuracy: 5 });
  });
});

describe('shipping', () => {
  it('flushes automatically at 25 pending entries, with consecutive seq numbers', async () => {
    const { sent, add, settle } = setup();
    add(24);
    await settle();
    expect(sent).toHaveLength(0);
    add(1);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].deviceSeq).toBe(100);
    expect(sent[0].entries).toHaveLength(25);
    expect(sent[0].entries[0]).toMatchObject({ event: 'E', appState: 'active', t: 1_000_000 });
  });

  it('allows a flush at most once per 60 s', async () => {
    const { shipper, sent, state, add, settle } = setup();
    add(25);
    await settle();
    expect(sent).toHaveLength(1);
    add(3);
    await shipper.flush();
    expect(sent).toHaveLength(1);
    state.now += 59_000;
    await shipper.flush();
    expect(sent).toHaveLength(1);
    state.now += 2_000;
    await shipper.flush();
    expect(sent).toHaveLength(2);
    expect(sent[1].deviceSeq).toBe(125);
    expect(shipper.pendingCount()).toBe(0);
    expect(shipper.getLastSentAt()).toBe(state.now);
  });

  it('splits big buffers into batches under the size limit', async () => {
    const { shipper, sent, add } = setup();
    add(300, 'E', { pad: 'x'.repeat(900) }); // ~1 KB each, 300 KB total; the 25th entry already started a flush
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.length).toBeGreaterThan(4);
    for (const req of sent) {
      expect(JSON.stringify(req).length).toBeLessThanOrEqual(SHIPPER_LIMITS.maxBatchBytes);
      expect(req.entries.length).toBeLessThanOrEqual(SHIPPER_LIMITS.maxBatchEntries);
    }
    // consecutive and complete
    let expected = sent[0].deviceSeq;
    for (const req of sent) {
      expect(req.deviceSeq).toBe(expected);
      expected += req.entries.length;
    }
    expect(sent.reduce((n, r) => n + r.entries.length, 0)).toBe(300);
    expect(shipper.pendingCount()).toBe(0);
  });

  it('keeps the buffer on failure and backs off, then resends the same seq', async () => {
    const { shipper, sent, state, add, settle } = setup({ fail: new ApiError('network', 'offline') });
    add(25);
    await settle();
    expect(shipper.pendingCount()).toBe(25);
    state.fail = null;
    state.now += 61_000; // still inside the 5 min failure backoff
    await shipper.flush();
    expect(sent).toHaveLength(0);
    state.now += 5 * 60_000;
    await shipper.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].deviceSeq).toBe(100);
    expect(shipper.pendingCount()).toBe(0);
  });

  it('drops a batch the server permanently refuses (400-type) instead of retrying forever', async () => {
    const { shipper, state, add, settle } = setup({ fail: new ApiError('client', 'HTTP 400', 400) });
    add(25);
    await settle();
    expect(shipper.pendingCount()).toBe(0);
    state.fail = null;
  });

  it('does not ship when not joined, but keeps the capped buffer for later', async () => {
    const { shipper, sent, state, add, settle } = setup({ joined: false });
    add(30);
    await settle();
    expect(sent).toHaveLength(0);
    expect(shipper.pendingCount()).toBe(30);
    state.joined = true;
    state.now += 61_000;
    await shipper.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].entries).toHaveLength(30);
  });

  it('does not ship when the Settings switch is off, and forgets entries from the off period', async () => {
    const { shipper, sent, state, add, settle } = setup({ enabled: false });
    add(30);
    await settle();
    expect(sent).toHaveLength(0);
    expect(shipper.pendingCount()).toBe(0);
    await shipper.setEnabled(true);
    state.now += 61_000;
    add(25);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].entries).toHaveLength(25);
  });
});

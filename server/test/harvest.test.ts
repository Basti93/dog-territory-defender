// Harvest (pile) and Buddy tap bonus commands: additive inside API_LEVEL 2.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { CommandBody, CommandResponse, SnapshotResponse } from '@game/sync/apiContract';
import * as schema from '../src/db/schema';
import { NOW, denRevOf, joinNew, makeServer, newHousehold, type Member, type TestServer } from './helpers';

let s: TestServer;
let hid: string;
let m: Member;
const HOUR = 3600_000;

beforeEach(async () => {
  s = await makeServer();
  hid = (await newHousehold(s)).id;
  m = await joinNew(s, hid);
});
afterEach(async () => {
  await s.close();
});

const send = async (clientId: string, command: CommandBody) =>
  (await s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: { clientId, command } })).json<CommandResponse>();

describe('den.harvest', () => {
  it('accrues into the pile (bank untouched) and the harvest banks it, idempotent by clientId', async () => {
    const before = await denRevOf(s, hid);
    s.setNow(before.lastTickAt + 3 * HOUR);
    const snap = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
    expect(snap.den.treats).toBe(before.treats);
    expect(snap.den.pile).toBeGreaterThan(0);

    const res = await send('client-harvest-01', { kind: 'den.harvest', at: s.now });
    expect(res.ok).toBe(true);
    expect(res.den.pile).toBe(0);
    expect(res.den.treats).toBeCloseTo(before.treats + (snap.den.pile ?? 0), 6);

    const replay = await send('client-harvest-01', { kind: 'den.harvest', at: s.now });
    expect(replay.replayed).toBe(true);
    expect(replay.den.treats).toBeCloseTo(res.den.treats, 6);
  });

  it('keeps hours between an offline tap and its delivery in the pile, and clamps a future `at`', async () => {
    const start = (await denRevOf(s, hid)).lastTickAt;
    s.setNow(start + 10 * HOUR);
    const early = await send('client-harvest-02', { kind: 'den.harvest', at: start + 2 * HOUR });
    expect(early.den.lastTickAt).toBe(start + 2 * HOUR);
    const afterEarly = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
    expect(afterEarly.den.pile).toBeGreaterThan(0); // the 8 later hours are still waiting
    const future = await send('client-harvest-03', { kind: 'den.harvest', at: s.now + 99 * HOUR });
    expect(future.den.lastTickAt).toBe(s.now);
    const stale = await send('client-harvest-04', { kind: 'den.harvest', at: 0 });
    expect(stale.den.lastTickAt).toBe(s.now); // never before the watermark
  });

  it('upgrade banks the pile first', async () => {
    const row = await denRevOf(s, hid);
    await s.db.update(schema.denState).set({ treats: 0, pile: 150, doghouseLevel: 3 }).where(eq(schema.denState.householdId, hid));
    s.setNow(row.lastTickAt);
    const res = await send('client-harvest-05', { kind: 'den.upgrade', building: 'bakery' });
    expect(res.ok).toBe(true);
    expect(res.den.pile).toBe(0);
  });
});

describe('den.buddyTaps', () => {
  it('credits the bank, trims to 30 per household day and rolls over at local midnight', async () => {
    await s.db.update(schema.denState).set({ doghouseLevel: 20, treats: 0 }).where(eq(schema.denState.householdId, hid));
    s.setNow((await denRevOf(s, hid)).lastTickAt);
    const a = await send('client-taps-01', { kind: 'den.buddyTaps', taps: 25, treats: 50 });
    expect(a.den.tapCount).toBe(25);
    expect(a.den.treats).toBeCloseTo(50, 6);
    const b = await send('client-taps-02', { kind: 'den.buddyTaps', taps: 25, treats: 50 }); // second phone
    expect(b.ok).toBe(true);
    expect(b.den.tapCount).toBe(30);
    expect(b.den.treats).toBeLessThanOrEqual(50 + 15 + 1e-6); // only 5 more taps (<= 3 each)
    const replay = await send('client-taps-02', { kind: 'den.buddyTaps', taps: 25, treats: 50 });
    expect(replay.replayed).toBe(true);
    s.setNow(s.now + 24 * HOUR);
    const next = await send('client-taps-03', { kind: 'den.buddyTaps', taps: 2, treats: 4 });
    expect(next.den.tapCount).toBe(2);
  });

  it('gives nothing and costs no tap when the bank is full', async () => {
    await s.db.update(schema.denState).set({ treats: 200 }).where(eq(schema.denState.householdId, hid)); // cap at doghouse 1
    const res = await send('client-taps-04', { kind: 'den.buddyTaps', taps: 4, treats: 8 });
    expect(res.ok).toBe(true);
    expect(res.den.treats).toBe(200);
    expect(res.den.tapCount ?? 0).toBe(0);
  });

  it('rejects malformed commands', async () => {
    for (const command of [{ kind: 'den.buddyTaps', taps: 0, treats: 1 }, { kind: 'den.buddyTaps', taps: 1 }, { kind: 'den.harvest' }]) {
      const r = await s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: { clientId: 'client-bad-0001', command } });
      expect(r.statusCode).toBe(400);
    }
  });
});

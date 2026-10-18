import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PresencePoint, PresenceResponse, PresenceUpdateRequest } from '@game/sync/apiContract';
import { walkPresence } from '../src/db/schema';
import { simplifyTrack } from '../src/lib/simplifyTrack';
import { PRESENCE_RETENTION_MS, purgeStalePresence } from '../src/services/presence';
import { joinNew, makeServer, newHousehold, NOW, straightWalk, type Member, type TestServer } from './helpers';

let s: TestServer;
let householdId: string;
let sam: Member;
let alex: Member;

beforeEach(async () => {
  s = await makeServer();
  householdId = (await newHousehold(s)).id;
  sam = await joinNew(s, householdId, 'Sam', '10.0.0.1');
  alex = await joinNew(s, householdId, 'Alex', '10.0.0.2');
});
afterEach(() => s.close());

/** n points heading north from Munich, one fix every 5 s from `t0`. */
const track = (n: number, t0 = NOW, from = 0, wiggle = 0): PresencePoint[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 48.137 + (from + i) * 0.00005, lon: 11.575 + (((from + i) % 7) - 3) * wiggle, t: t0 + (from + i) * 5000 }));

const beat = (who: Member, body: Partial<PresenceUpdateRequest> = {}) =>
  s.app.inject({
    method: 'POST',
    url: '/v1/presence',
    headers: who.auth,
    payload: { walkId: 'walk-alex-1', startedAt: NOW, points: track(3), ...body },
  });
const read = async (who: Member, query = ''): Promise<PresenceResponse> => {
  const res = await s.app.inject({ method: 'GET', url: `/v1/presence${query}`, headers: who.auth });
  expect(res.statusCode).toBe(200);
  return res.json<PresenceResponse>();
};

describe('POST /v1/presence', () => {
  it('needs a token for both verbs', async () => {
    expect((await s.app.inject({ method: 'POST', url: '/v1/presence', payload: { walkId: 'walk-alex-1', startedAt: 1, points: [] } })).statusCode).toBe(401);
    expect((await s.app.inject({ method: 'GET', url: '/v1/presence' })).statusCode).toBe(401);
  });

  it('shows Alex\'s walk to Sam with her name and full route, and never to herself', async () => {
    expect((await beat(alex)).json()).toEqual({ ok: true });
    s.setNow(NOW + 4000);
    const seen = await read(sam);
    expect(seen.presence).toHaveLength(1);
    expect(seen.presence[0]).toMatchObject({ name: 'Alex', walkId: 'walk-alex-1', startedAt: NOW, updatedAt: NOW });
    expect(seen.presence[0].points).toEqual(track(3)); // full precision, no fuzz inside a household
    expect(seen.serverTime).toBe(NOW + 4000);
    expect((await read(alex)).presence).toEqual([]);
  });

  it('appends the delta since the last beat, drops repeats and keeps time order', async () => {
    await beat(alex, { points: track(3) });
    s.setNow(NOW + 30_000);
    await beat(alex, { points: [...track(3, NOW, 3).reverse(), ...track(2)] }); // out of order, plus 2 already known points
    const points = (await read(sam)).presence[0].points;
    expect(points.map((p) => p.t)).toEqual(track(6).map((p) => p.t));
  });

  it('keeps at most 400 simplified points, the first and the last one among them', async () => {
    let from = 0;
    for (let i = 0; i < 6; i++) {
      s.setNow(NOW + i * 30_000);
      await beat(alex, { points: track(300, NOW, from, 0.0001) });
      from += 300;
    }
    const points = (await read(sam)).presence[0].points;
    expect(points.length).toBeLessThanOrEqual(400);
    expect(points.length).toBeGreaterThan(2);
    expect(points[0].t).toBe(NOW);
    expect(points[points.length - 1].t).toBe(NOW + 1799 * 5000);
    for (let i = 1; i < points.length; i++) expect(points[i].t).toBeGreaterThan(points[i - 1].t);
  });

  it('rejects unknown fields, more than 400 points in one beat and impossible coordinates', async () => {
    expect((await beat(alex, { extra: 1 } as never)).statusCode).toBe(400);
    expect((await beat(alex, { points: track(401) })).statusCode).toBe(400);
    expect((await beat(alex, { points: [{ lat: 91, lon: 0, t: 1 }] })).statusCode).toBe(400);
    expect((await beat(alex, { walkId: 'x' })).statusCode).toBe(400);
  });

  it('allows one beat per 10 s per device (429 with Retry-After), but never refuses the closing one', async () => {
    expect((await beat(alex)).statusCode).toBe(200);
    s.setNow(NOW + 3000);
    const tooSoon = await beat(alex, { points: [] });
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json()).toEqual({ error: 'rate_limited' });
    expect(Number(tooSoon.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect((await beat(alex, { points: [], ended: true })).statusCode).toBe(200);
    expect((await read(sam)).presence).toEqual([]);
    // Sam's own device has its own budget
    expect((await beat(sam, { walkId: 'walk-sam-1' })).statusCode).toBe(200);
  });

  it('after 10 s the next beat is accepted again', async () => {
    await beat(alex);
    s.setNow(NOW + 11_000);
    expect((await beat(alex, { points: track(2, NOW, 3) })).statusCode).toBe(200);
  });

  it('ending hides the walk, changes the rev, and a late heartbeat does not bring it back', async () => {
    await beat(alex);
    const before = await read(sam);
    s.setNow(NOW + 60_000);
    await beat(alex, { points: [], ended: true });
    const after = await read(sam);
    expect(after.presence).toEqual([]);
    expect(after.rev).toBeGreaterThan(before.rev);
    s.setNow(NOW + 90_000);
    await beat(alex);
    expect((await read(sam)).presence).toEqual([]);
  });

  it('an ended beat for a walk that never started stores nothing', async () => {
    await beat(alex, { walkId: 'walk-never-shown', ended: true });
    expect(await s.db.select().from(walkPresence)).toHaveLength(0);
  });

  it('a new walk closes the same person\'s forgotten earlier one', async () => {
    await beat(alex, { walkId: 'walk-alex-old' });
    s.setNow(NOW + 20_000);
    await beat(alex, { walkId: 'walk-alex-new' });
    const seen = (await read(sam)).presence;
    expect(seen.map((p) => p.walkId)).toEqual(['walk-alex-new']);
  });

  it('uploading the finished walk closes its presence, even without an ended beat', async () => {
    const upload = straightWalk('walk-alex-1', NOW, { meters: 100 });
    await beat(alex);
    expect((await read(sam)).presence).toHaveLength(1);
    const res = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: alex.auth, payload: upload });
    expect(res.statusCode).toBe(200);
    expect((await read(sam)).presence).toEqual([]);
  });

  it('never leaks across households', async () => {
    const other = await joinNew(s, (await newHousehold(s, 'Other')).id, 'Stranger', '10.0.0.3');
    await beat(alex);
    expect((await read(other)).presence).toEqual([]);
  });
});

describe('retention', () => {
  it('purges rows older than 6 h and keeps newer ones', async () => {
    await beat(alex);
    await beat(sam, { walkId: 'walk-sam-1' });
    await s.db.update(walkPresence).set({ updatedAt: NOW - PRESENCE_RETENTION_MS - 1 }).where(eq(walkPresence.walkId, 'walk-alex-1'));
    expect(await purgeStalePresence(s.db, NOW)).toBe(1);
    const left = await s.db.select().from(walkPresence);
    expect(left.map((r) => r.walkId)).toEqual(['walk-sam-1']);
  });
});

describe('GET /v1/presence long-poll', () => {
  it('answers at once without `after`, and with wait 0', async () => {
    await beat(alex);
    const t0 = Date.now();
    await read(sam);
    await read(sam, '?after=0&wait=0');
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('wakes as soon as the other person sends a beat', async () => {
    const first = await read(sam);
    const t0 = Date.now();
    const waiting = s.app.inject({ method: 'GET', url: `/v1/presence?after=${first.rev}&wait=20`, headers: sam.auth });
    await new Promise((r) => setTimeout(r, 200));
    s.setNow(NOW + 5000);
    await beat(alex);
    const res = (await waiting).json<PresenceResponse>();
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(res.presence).toHaveLength(1);
    expect(res.rev).toBeGreaterThan(first.rev);
  });

  it('wakes when the other person ends the walk', async () => {
    await beat(alex);
    const first = await read(sam);
    const waiting = s.app.inject({ method: 'GET', url: `/v1/presence?after=${first.rev}&wait=20`, headers: sam.auth });
    await new Promise((r) => setTimeout(r, 200));
    s.setNow(NOW + 5000);
    await beat(alex, { points: [], ended: true });
    expect((await waiting).json<PresenceResponse>().presence).toEqual([]);
  });

  it('times out with the same rev when nothing changes, and ignores the caller\'s own beats', async () => {
    const first = await read(sam);
    const t0 = Date.now();
    const waiting = s.app.inject({ method: 'GET', url: `/v1/presence?after=${first.rev}&wait=1`, headers: sam.auth });
    await new Promise((r) => setTimeout(r, 100));
    await beat(sam, { walkId: 'walk-sam-1' });
    const res = (await waiting).json<PresenceResponse>();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    expect(res.rev).toBe(first.rev);
    expect(res.presence).toEqual([]);
  });

  it('returns at once when the rev already differs from `after`', async () => {
    await beat(alex);
    const t0 = Date.now();
    const res = await read(sam, '?after=0&wait=20');
    expect(res.presence).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('rejects a wait beyond 25 s', async () => {
    expect((await s.app.inject({ method: 'GET', url: '/v1/presence?after=0&wait=26', headers: sam.auth })).statusCode).toBe(400);
  });
});

describe('simplifyTrack', () => {
  it('leaves short tracks alone and thins long ones to the limit, keeping the ends and the corners', () => {
    expect(simplifyTrack(track(10), 400)).toHaveLength(10);
    // an L-shaped route of 1000 fixes: the corner must survive
    const north = track(500);
    const east: PresencePoint[] = Array.from({ length: 500 }, (_, i) => ({ lat: north[499].lat, lon: 11.575 + (i + 1) * 0.00007, t: NOW + (500 + i) * 5000 }));
    const all = [...north, ...east];
    const out = simplifyTrack(all, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out[0]).toEqual(all[0]);
    expect(out[out.length - 1]).toEqual(all[all.length - 1]);
    expect(out).toContainEqual(north[499]);
  });
});

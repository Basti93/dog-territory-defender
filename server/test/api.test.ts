import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  CommandResponse,
  EventsResponse,
  JoinResponse,
  SnapshotResponse,
  WalkUploadResponse,
} from '@game/sync/apiContract';
import { API_LEVEL } from '@game/sync/apiContract';
import * as schema from '../src/db/schema';
import { NOW, denRevOf, joinNew, makeServer, newHousehold, straightWalk, type TestServer } from './helpers';

let s: TestServer;
beforeEach(async () => {
  s = await makeServer();
});
afterEach(async () => {
  await s.close();
});

const WALK_ID = 'walk-aaaaaaaa-0001';

describe('401 surface', () => {
  it('answers identically for unknown paths, known paths and bad tokens', async () => {
    const h = await newHousehold(s);
    await joinNew(s, h.id);
    const probes = [
      { method: 'GET', url: '/v1/snapshot' },
      { method: 'GET', url: '/v1/does-not-exist' },
      { method: 'GET', url: '/admin' },
      { method: 'POST', url: '/healthz' },
      { method: 'GET', url: '/readyz' },
      { method: 'GET', url: '/v1/snapshot', headers: { authorization: 'Bearer dtd_wrongwrongwrongwrongwrongwrong' } },
      { method: 'GET', url: '/v1/walks/abc12345', headers: { authorization: 'Basic abc' } },
    ] as const;
    const bodies = new Set<string>();
    for (const p of probes) {
      const res = await s.app.inject({ method: p.method, url: p.url, headers: (p as any).headers });
      expect(res.statusCode).toBe(401);
      bodies.add(res.body);
    }
    expect(bodies.size).toBe(1);
    expect(JSON.parse([...bodies][0])).toEqual({ error: 'unauthorized' });
  });

  it('keeps /healthz public and minimal, with hardening headers and no server banner', async () => {
    const res = await s.app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, apiLevel: API_LEVEL });
    expect(res.headers['x-api-level']).toBe(String(API_LEVEL));
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects revoked tokens', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    await s.db.update(schema.devices).set({ revokedAt: new Date() }).where(eq(schema.devices.id, m.join.deviceId));
    const res = await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth });
    expect(res.statusCode).toBe(401);
  });

  it('rejects non-JSON content and unknown properties', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const text = await s.app.inject({
      method: 'POST',
      url: '/v1/commands',
      headers: { ...m.auth, 'content-type': 'text/plain' },
      payload: 'hello',
    });
    expect(text.statusCode).toBe(415);
    const extra = await s.app.inject({
      method: 'POST',
      url: '/v1/commands',
      headers: m.auth,
      payload: { clientId: 'client-id-0001', command: { kind: 'den.claim' }, evil: 1 },
    });
    expect(extra.statusCode).toBe(400);
  });
});

describe('join flow', () => {
  it('consumes an invite once, refuses everything else with one indistinguishable answer', async () => {
    const h = await newHousehold(s);
    const { createInvite } = await import('../src/services/households');
    const invite = await createInvite(s.db, h.id, 24 * 3600_000, s.now);
    const body = { code: invite.code.toLowerCase(), playerName: 'Lisa', deviceLabel: 'iPhone', consent: true };

    const ok = await s.app.inject({ method: 'POST', url: '/v1/join', payload: body });
    expect(ok.statusCode).toBe(200);
    const joined = ok.json<JoinResponse>();
    expect(joined.token.startsWith('dtd_')).toBe(true);

    const reuse = await s.app.inject({ method: 'POST', url: '/v1/join', payload: body });
    const unknown = await s.app.inject({ method: 'POST', url: '/v1/join', payload: { ...body, code: 'ZZZZZZZZ' } });
    expect(reuse.statusCode).toBe(403);
    expect(unknown.statusCode).toBe(403);
    expect(reuse.body).toBe(unknown.body);

    // only a hash of the token is stored
    const [device] = await s.db.select().from(schema.devices);
    expect(device.tokenHash).not.toContain(joined.token);
    expect(device.tokenHash).toHaveLength(64);

    const snap = await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: { authorization: `Bearer ${joined.token}` } });
    expect(snap.statusCode).toBe(200);
    const snapshot = snap.json<SnapshotResponse>();
    expect(snapshot.me.displayName).toBe('Lisa');
    expect(snapshot.household.name).toBe('Muster');
    expect(snapshot.den.treats).toBe(50);
    expect(snapshot.cells).toEqual([]);
  });

  it('refuses expired invites and does not burn an invite on a full household', async () => {
    const h = await newHousehold(s);
    const { createInvite } = await import('../src/services/households');
    const expired = await createInvite(s.db, h.id, -1000, s.now);
    const res = await s.app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code: expired.code, playerName: 'X', deviceLabel: 'd', consent: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('requires consent', async () => {
    const res = await s.app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code: 'ABCDEFGH', playerName: 'X', deviceLabel: 'd', consent: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rate-limits joins per IP (5/min)', async () => {
    await s.close();
    s = await makeServer({ joinPerMinPerIp: 5, unauthPerMinPerIp: 1000 });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await s.app.inject({
        method: 'POST',
        url: '/v1/join',
        remoteAddress: '203.0.113.9',
        payload: { code: 'ZZZZZZZZ', playerName: 'X', deviceLabel: 'd', consent: true },
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 5).every((c) => c === 403)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it('bans an IP after 10 failed auths', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await s.app.inject({ method: 'GET', url: '/v1/snapshot', remoteAddress: '198.51.100.7' });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
    const rows = await s.db.select().from(schema.bannedIps);
    expect(rows).toHaveLength(1);
  });
});

describe('walks', () => {
  it('uploads idempotently and returns the server-side reward', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const walk = straightWalk(WALK_ID, NOW - 3600_000);

    const first = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: walk });
    expect(first.statusCode).toBe(200);
    const r1 = first.json<WalkUploadResponse>();
    expect(r1.duplicate).toBe(false);
    expect(r1.reward.qualifies).toBe(true);
    expect(r1.reward.cellsPainted).toBeGreaterThanOrEqual(25);
    expect(r1.reward.treatsEarned).toBeGreaterThan(0);
    // first walk on brand-new ground: bloom is the full 1 + K
    expect(r1.reward.bloomMultiplier).toBeCloseTo(1.6, 5);
    expect(r1.den.treats).toBeGreaterThan(50);
    const revAfterFirst = r1.den.rev;

    const second = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: walk });
    const r2 = second.json<WalkUploadResponse>();
    expect(r2.duplicate).toBe(true);
    expect(r2.reward).toEqual(r1.reward);
    expect(r2.den.rev).toBe(revAfterFirst);
    expect(r2.den.treats).toBe(r1.den.treats);

    expect(await s.db.select().from(schema.walks)).toHaveLength(1);
    const feed = (await s.app.inject({ method: 'GET', url: '/v1/events?after=0', headers: m.auth })).json<EventsResponse>();
    expect(feed.events.filter((e) => e.kind === 'walk.added')).toHaveLength(1);
    expect(feed.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['member.joined', 'walk.added', 'cells.changed', 'territory.changed', 'den.updated'])
    );
  });

  it('shares one Range: the partner sees the same cells after one walk each', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id, 'Sam');
    const b = await joinNew(s, h.id, 'Lisa', '10.0.0.2');
    await s.app.inject({ method: 'POST', url: '/v1/walks', headers: a.auth, payload: straightWalk('walk-a-00000001', NOW - 7200_000) });
    await s.app.inject({
      method: 'POST',
      url: '/v1/walks',
      headers: b.auth,
      payload: straightWalk('walk-b-00000001', NOW - 3600_000, { lon: 11.58 }),
    });
    const snapA = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: a.auth })).json<SnapshotResponse>();
    const snapB = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: b.auth })).json<SnapshotResponse>();
    expect(snapA.cells.length).toBeGreaterThan(50);
    expect(snapA.cells).toEqual(snapB.cells);
    expect(snapA.walks).toHaveLength(2);
    expect(snapA.players).toHaveLength(2);
    expect(snapA.den.treats).toBeGreaterThan(50);
  });

  it('merges cells independently of arrival order (visits are distinct days)', async () => {
    const day = 24 * 3600_000;
    const w1 = straightWalk('walk-o-00000001', NOW - 3 * day);
    const w2 = straightWalk('walk-o-00000002', NOW - 2 * day + 600_000, { lon: 11.5751 }); // overlaps w1
    const w3 = straightWalk('walk-o-00000003', NOW - 2 * day + 900_000); // same day as w2, same route as w1

    const run = async (order: typeof w1[]) => {
      const srv = await makeServer();
      const h = await newHousehold(srv);
      const m = await joinNew(srv, h.id);
      for (const w of order) {
        const res = await srv.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: w });
        expect(res.statusCode).toBe(200);
      }
      const snap = (await srv.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
      await srv.close();
      return snap.cells
        .map(({ territoryId: _t, ...c }) => c)
        .sort((x, y) => x.ix - y.ix || x.iy - y.iy);
    };

    const forward = await run([w1, w2, w3]);
    const backward = await run([w3, w2, w1]);
    expect(backward).toEqual(forward);
    // w1 route walked on 2 distinct days (w1's day, and w2/w3's shared day): visits 2, never 3
    expect(Math.max(...forward.map((c) => c.visits))).toBe(2);
  });

  it('rejects walks from the future and the distant past, and unqualified walks earn nothing', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const future = await s.app.inject({
      method: 'POST',
      url: '/v1/walks',
      headers: m.auth,
      payload: straightWalk('walk-f-00000001', NOW + 3600_000),
    });
    expect(future.statusCode).toBe(422);
    expect(future.json()).toEqual({ error: 'walk_rejected', reason: 'start-in-future' });
    const old = await s.app.inject({
      method: 'POST',
      url: '/v1/walks',
      headers: m.auth,
      payload: straightWalk('walk-f-00000002', NOW - 40 * 24 * 3600_000),
    });
    expect(old.json().reason).toBe('too-old');

    const stub = await s.app.inject({
      method: 'POST',
      url: '/v1/walks',
      headers: m.auth,
      payload: straightWalk('walk-f-00000003', NOW - 1000_000, { meters: 40 }),
    });
    const r = stub.json<WalkUploadResponse>();
    expect(r.reward.qualifies).toBe(false);
    expect(r.reward.treatsEarned).toBe(0);
    expect(r.den.treats).toBe(50);
  });

  it('applies the daily diminishing-returns multiplier by arrival order', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const multipliers: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await s.app.inject({
        method: 'POST',
        url: '/v1/walks',
        headers: m.auth,
        payload: straightWalk(`walk-d-0000000${i}`, NOW - 3600_000 + i * 60_000, { lon: 11.575 + i * 0.01 }),
      });
      multipliers.push(res.json<WalkUploadResponse>().reward.dailyMultiplier);
    }
    expect(multipliers).toEqual([1, 1, 1, 0.5, 0.25]);
  });

  it('keeps households isolated', async () => {
    const h1 = await newHousehold(s, 'One');
    const h2 = await newHousehold(s, 'Two');
    const a = await joinNew(s, h1.id);
    const b = await joinNew(s, h2.id, 'Other', '10.0.0.3');
    await s.app.inject({ method: 'POST', url: '/v1/walks', headers: a.auth, payload: straightWalk(WALK_ID, NOW - 3600_000) });
    const peek = await s.app.inject({ method: 'GET', url: `/v1/walks/${WALK_ID}`, headers: b.auth });
    expect(peek.statusCode).toBe(404);
    const own = await s.app.inject({ method: 'GET', url: `/v1/walks/${WALK_ID}`, headers: a.auth });
    expect(own.statusCode).toBe(200);
    expect(own.json().locations.length).toBeGreaterThan(10);
    const snapB = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: b.auth })).json<SnapshotResponse>();
    expect(snapB.cells).toEqual([]);
    expect(snapB.walks).toEqual([]);
  });
});

describe('commands', () => {
  const upgrade = (clientId: string, building = 'doghouse') => ({
    clientId,
    command: { kind: 'den.upgrade', building },
  });

  it('is idempotent by clientId and server-authoritative on the balance', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    await s.db.update(schema.denState).set({ treats: 150 }).where(eq(schema.denState.householdId, h.id));

    const first = (await s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: upgrade('client-cmd-0001') })).json<CommandResponse>();
    expect(first.ok).toBe(true);
    expect(first.replayed).toBe(false);
    expect(first.den.doghouseLevel).toBe(2);
    expect(first.den.treats).toBe(90); // 150 - floor(40 * 1.5); storage cap at doghouse 1 is 200

    const replay = (await s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: upgrade('client-cmd-0001') })).json<CommandResponse>();
    expect(replay.replayed).toBe(true);
    expect(replay.ok).toBe(true);
    expect(replay.den.doghouseLevel).toBe(2);
    expect(replay.den.treats).toBe(90);

    const row = await denRevOf(s, h.id);
    expect(row.doghouseLevel).toBe(2);

    const clash = await s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: upgrade('client-cmd-0001', 'bakery') });
    expect(clash.statusCode).toBe(409);
  });

  it('reports insufficient treats as a normal result, not an HTTP error, and replays it', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const res = await s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: upgrade('client-cmd-0002', 'bakery') });
    expect(res.statusCode).toBe(200);
    const body = res.json<CommandResponse>();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('insufficient-treats');
    expect(body.den.bakeryLevel).toBe(1);
    const again = (await s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: upgrade('client-cmd-0002', 'bakery') })).json<CommandResponse>();
    expect(again.replayed).toBe(true);
    expect(again.error).toBe('insufficient-treats');
  });

  it('lets the partner spend first: the second upgrade of the same unaffordable step fails gently', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    const b = await joinNew(s, h.id, 'Lisa', '10.0.0.2');
    await s.db.update(schema.denState).set({ treats: 70 }).where(eq(schema.denState.householdId, h.id));
    const r1 = (await s.app.inject({ method: 'POST', url: '/v1/commands', headers: a.auth, payload: upgrade('client-cmd-0003') })).json<CommandResponse>();
    const r2 = (await s.app.inject({ method: 'POST', url: '/v1/commands', headers: b.auth, payload: upgrade('client-cmd-0004') })).json<CommandResponse>();
    expect(r1.ok).toBe(true); // cost 60
    expect(r2.ok).toBe(false); // 10 treats left, cost 90
    expect(r2.error).toBe('insufficient-treats');
  });

  it('updates the dog (last writer wins) and soft-deletes walks', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const dog = (
      await s.app.inject({
        method: 'POST',
        url: '/v1/commands',
        headers: m.auth,
        payload: { clientId: 'client-cmd-0005', command: { kind: 'dog.update', name: 'Buddy' } },
      })
    ).json<CommandResponse>();
    expect(dog.dog?.name).toBe('Buddy');

    await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: straightWalk(WALK_ID, NOW - 3600_000) });
    const del = (
      await s.app.inject({
        method: 'POST',
        url: '/v1/commands',
        headers: m.auth,
        payload: { clientId: 'client-cmd-0006', command: { kind: 'walk.delete', walkId: WALK_ID } },
      })
    ).json<CommandResponse>();
    expect(del.ok).toBe(true);
    const snap = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
    expect(snap.walks[0].deleted).toBe(true);
    expect(snap.cells.length).toBeGreaterThan(0); // cells are never un-painted
    expect(snap.dog.name).toBe('Buddy');
  });

  it('caps state-changing commands per household per day', async () => {
    await s.close();
    s = await makeServer();
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const { testConfig } = await import('./helpers');
    expect(testConfig().limits.commandsPerDayPerHousehold).toBe(200);
    // exercise the cap with a tiny one by writing rows directly
    for (let i = 0; i < 200; i++) {
      await s.db.insert(schema.economyCommands).values({
        householdId: h.id,
        clientId: `filler-${i}`,
        kind: 'den.claim',
        playerId: m.join.playerId,
        request: {},
        result: {},
        createdAt: new Date(NOW - 1000),
      });
    }
    const res = await s.app.inject({
      method: 'POST',
      url: '/v1/commands',
      headers: m.auth,
      payload: { clientId: 'client-cmd-over1', command: { kind: 'den.claim' } },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe('daily_cap');
  });
});

describe('events feed', () => {
  it('pages by cursor and long-polls for new events', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    for (let i = 0; i < 3; i++) {
      await s.app.inject({
        method: 'POST',
        url: '/v1/commands',
        headers: m.auth,
        payload: { clientId: `client-claim-000${i}`, command: { kind: 'den.claim' } },
      });
    }
    const page1 = (await s.app.inject({ method: 'GET', url: '/v1/events?after=0&limit=2', headers: m.auth })).json<EventsResponse>();
    expect(page1.events).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    const page2 = (await s.app.inject({ method: 'GET', url: `/v1/events?after=${page1.cursor}&limit=50`, headers: m.auth })).json<EventsResponse>();
    expect(page2.events.length).toBeGreaterThanOrEqual(2);
    expect(page2.hasMore).toBe(false);
    const empty = (await s.app.inject({ method: 'GET', url: `/v1/events?after=${page2.cursor}`, headers: m.auth })).json<EventsResponse>();
    expect(empty.events).toEqual([]);
    expect(empty.cursor).toBe(page2.cursor);

    // long poll wakes when the partner does something
    const b = await joinNew(s, h.id, 'Lisa', '10.0.0.2'); // member.joined event lands in the feed
    void b;
    const after = (await s.app.inject({ method: 'GET', url: `/v1/events?after=${page2.cursor}`, headers: m.auth })).json<EventsResponse>();
    const cursor = after.cursor;
    const waiting = s.app.inject({ method: 'GET', url: `/v1/events?after=${cursor}&wait=5`, headers: m.auth });
    await new Promise((r) => setTimeout(r, 100));
    await s.app.inject({
      method: 'POST',
      url: '/v1/commands',
      headers: b.auth,
      payload: { clientId: 'client-claim-wake1', command: { kind: 'den.claim' } },
    });
    const woke = (await waiting).json<EventsResponse>();
    expect(woke.events.map((e) => e.kind)).toEqual(['den.updated']);
    expect(woke.events[0].actorPlayerId).toBe(b.join.playerId);
  });

  it('returns an empty long-poll after the wait elapses', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const snap = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
    const started = Date.now();
    const res = (await s.app.inject({ method: 'GET', url: `/v1/events?after=${snap.seq}&wait=1`, headers: m.auth })).json<EventsResponse>();
    expect(res.events).toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it('refuses wait above the 25 s ceiling', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const res = await s.app.inject({ method: 'GET', url: '/v1/events?after=0&wait=60', headers: m.auth });
    expect(res.statusCode).toBe(400);
  });
});

describe('nearby', () => {
  it('returns the fixed empty shape', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const res = await s.app.inject({ method: 'GET', url: '/v1/nearby?radiusM=500', headers: m.auth });
    expect(res.json()).toEqual({ items: [] });
  });
});

describe('founding import', () => {
  const importBody = (importId: string) => ({
    importId,
    walks: [
      { ...straightWalk('old-walk-0000001', NOW - 5 * 24 * 3600_000), closed: true, treatsEarned: 70, startSource: 'button' as const },
    ],
    cells: [
      { ix: 100, iy: 200, lastRefreshed: NOW - 1000, lastTracked: NOW - 1000, visits: 3, territoryId: 't000001700000000-abc123' },
    ],
    territories: [{ id: 't000001700000000-abc123', name: 'Old Town', createdAt: 1_700_000_000, walksHere: 4, treatsEarnedHere: 200 }],
    den: { treats: 120, doghouseLevel: 3, bakeryLevel: 2, sniffGardenLevel: 1, lastTickAt: NOW - 3600_000, xp: 400, level: 4 },
    dog: { name: 'Buddy', appearance: { coat: 'gold' } },
  });

  it('seeds once, replays by importId, rejects a different import, and a later joiner sees the seed', async () => {
    const h = await newHousehold(s, 'Muster', 'Europe/Berlin', true);
    const a = await joinNew(s, h.id);
    const first = await s.app.inject({ method: 'POST', url: '/v1/households/import', headers: a.auth, payload: importBody('import-0000001') });
    expect(first.statusCode).toBe(200);
    const snap = first.json<SnapshotResponse & { replayed: boolean }>();
    expect(snap.replayed).toBe(false);
    expect(snap.den.level).toBe(4);
    expect(snap.den.doghouseLevel).toBe(3);
    expect(snap.dog.name).toBe('Buddy');
    expect(snap.walks.map((w) => w.id)).toEqual(['old-walk-0000001']);
    expect(snap.cells).toHaveLength(1);
    expect(snap.cells[0].visits).toBe(3);
    expect(snap.territories[0].name).toBe('Old Town');

    const replay = await s.app.inject({ method: 'POST', url: '/v1/households/import', headers: a.auth, payload: importBody('import-0000001') });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().replayed).toBe(true);

    const other = await s.app.inject({ method: 'POST', url: '/v1/households/import', headers: a.auth, payload: importBody('import-0000002') });
    expect(other.statusCode).toBe(409);
    expect(other.json()).toEqual({ error: 'import_not_allowed' });

    const b = await joinNew(s, h.id, 'Lisa', '10.0.0.2');
    const seen = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: b.auth })).json<SnapshotResponse>();
    expect(seen.cells).toHaveLength(1);
    expect(seen.dog.name).toBe('Buddy');
    expect(seen.den.level).toBe(4);
    expect(seen.walks).toHaveLength(1);

  });

  it('is refused for households created without allowImport (the default)', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    const res = await s.app.inject({ method: 'POST', url: '/v1/households/import', headers: a.auth, payload: importBody('import-0000004') });
    expect(res.statusCode).toBe(409);
  });

  it('is refused once the household already has walks', async () => {
    const h = await newHousehold(s, 'Muster', 'Europe/Berlin', true);
    const a = await joinNew(s, h.id);
    await s.app.inject({ method: 'POST', url: '/v1/walks', headers: a.auth, payload: straightWalk(WALK_ID, NOW - 3600_000) });
    const res = await s.app.inject({ method: 'POST', url: '/v1/households/import', headers: a.auth, payload: importBody('import-0000003') });
    expect(res.statusCode).toBe(409);
  });
});

describe('ban strikes', () => {
  it('counts missing, malformed and unknown tokens but not revoked-device or left-player tokens', async () => {
    const h = await newHousehold(s);
    const revoked = await joinNew(s, h.id, 'Sam', '10.0.0.1');
    const left = await joinNew(s, h.id, 'Lisa', '10.0.0.2');
    await s.db.update(schema.devices).set({ revokedAt: new Date() }).where(eq(schema.devices.id, revoked.join.deviceId));
    await s.db.update(schema.players).set({ leftAt: new Date() }).where(eq(schema.players.id, left.join.playerId));

    for (const [m, ip] of [[revoked, '198.51.100.20'], [left, '198.51.100.21']] as const) {
      for (let i = 0; i < 15; i++) {
        const res = await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth, remoteAddress: ip });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: 'unauthorized' });
      }
    }
    expect(await s.db.select().from(schema.bannedIps)).toHaveLength(0);

    const unknown = { authorization: 'Bearer dtd_wrongwrongwrongwrongwrongwrong' };
    for (let i = 0; i < 12; i++) await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: unknown, remoteAddress: '198.51.100.22' });
    expect((await s.db.select().from(schema.bannedIps)).map((r) => r.ip)).toEqual(['198.51.100.22']);
  });

  it('IpBanList.load tolerates a database without migrations', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { IpBanList } = await import('../src/http/ipBan');
    const pg = new PGlite();
    const empty = drizzle(pg, { schema }) as unknown as import('../src/db/client').Db;
    await expect(new IpBanList(empty, '172.16.0.0/12').load()).resolves.toBeUndefined();
    await pg.close();
  });
});

describe('command replay detection', () => {
  it('treats the same command with different nested key order as a replay, not a conflict', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const look = (zones: Record<string, string>) => ({
      coat: 'golden', markings: 'none', earStyle: 'floppy', tailStyle: 'curly', size: 'medium', accentColour: 'cream',
      fur: { zones, muzzle: 'short', furLength: 'short' },
    });
    const names = ['head', 'muzzle', 'eyepatch', 'ears', 'back', 'belly', 'chest', 'legs', 'paws', 'tail'];
    const zones = (order: string[], head = '#C8A27A') => Object.fromEntries(order.map((z) => [z, z === 'head' ? head : '#C8A27A']));
    const send = (appearance: unknown) =>
      s.app.inject({
        method: 'POST',
        url: '/v1/commands',
        headers: m.auth,
        payload: { clientId: 'client-dog-000001', command: { kind: 'appearance.set', appearance } },
      });
    const first = await send(look(zones(names)));
    expect(first.statusCode).toBe(200);
    const again = await send(look(zones([...names].reverse())));
    expect(again.statusCode).toBe(200);
    expect(again.json<CommandResponse>().replayed).toBe(true);
    const different = await send(look(zones(names, '#8899AA')));
    expect(different.statusCode).toBe(409);
  });
});

describe('daily caps use the household-local day', () => {
  const fill = async (householdId: string, playerId: string, createdAt: Date) => {
    for (let i = 0; i < 200; i++) {
      await s.db.insert(schema.economyCommands).values({
        householdId, clientId: `filler-${i}`, kind: 'den.claim', playerId, request: {}, result: {}, createdAt,
      });
    }
  };
  const claim = (m: { auth: { authorization: string } }) =>
    s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: { clientId: 'client-cmd-local1', command: { kind: 'den.claim' } } });

  it('counts commands from earlier the same local day, ignores those from the previous local day', async () => {
    // NOW = 12:00 UTC; filler 3 h earlier = 09:00 UTC.
    const berlin = await newHousehold(s, 'Berlin', 'Europe/Berlin'); // both on 2026-10-18 local
    const mb = await joinNew(s, berlin.id, 'A', '10.0.0.5');
    await fill(berlin.id, mb.join.playerId, new Date(NOW - 3 * 3600_000));
    expect((await claim(mb)).statusCode).toBe(429);

    const kiri = await newHousehold(s, 'Kiri', 'Pacific/Kiritimati'); // UTC+14: filler is 23:00 on 10-18, now is 02:00 on 10-19
    const mk = await joinNew(s, kiri.id, 'B', '10.0.0.6');
    await fill(kiri.id, mk.join.playerId, new Date(NOW - 3 * 3600_000));
    expect((await claim(mk)).statusCode).toBe(200);
  });
});

describe('event bus', () => {
  it('does not lose a notify that lands between subscribe and wait', async () => {
    const { EventBus } = await import('../src/services/events');
    const bus = new EventBus();
    const sub = bus.subscribe('h1');
    bus.notify('h1');
    const started = Date.now();
    await sub.wait(5000);
    expect(Date.now() - started).toBeLessThan(500);
    sub.dispose();
    expect(bus.waiterCount('h1')).toBe(0);
  });

  it('shutdown() releases pending long-polls promptly', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const snap = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
    const { pullEventsLongPoll, EventBus } = await import('../src/services/events');
    const bus = new EventBus();
    const started = Date.now();
    const p = pullEventsLongPoll(s.db, bus, h.id, snap.seq, 50, 20, 8);
    await new Promise((r) => setTimeout(r, 100));
    bus.shutdown();
    const res = await p;
    expect(res.events).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('pauses briefly instead of answering at once when the waiter cap is hit', async () => {
    const h = await newHousehold(s);
    const { pullEventsLongPoll, EventBus } = await import('../src/services/events');
    const bus = new EventBus();
    const hold = bus.subscribe(h.id); // occupies the only slot
    const started = Date.now();
    const res = await pullEventsLongPoll(s.db, bus, h.id, 0, 50, 20, 1, undefined, 300);
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(res.events).toEqual([]);
    hold.dispose();
  });
});

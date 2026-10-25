// Personal stats per player (PUT /v1/me/stats, snapshot.myStats) and restore invites (create-invite --for-player).
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiMyStats, EventsResponse, JoinResponse, SnapshotResponse } from '@game/sync/apiContract';
import * as schema from '../src/db/schema';
import { attachDevice, createInvite, findPlayer } from '../src/services/households';
import { joinNew, makeServer, newHousehold, type Member, type TestServer } from './helpers';

let s: TestServer;
beforeEach(async () => {
  s = await makeServer();
});
afterEach(async () => {
  await s.close();
});

const zero = { totalWalksClosed: 0, lifetimeDistanceMeters: 0, lifetimeTerritoryAreaM2: 0, biggestTerritoryAreaM2: 0, longestWalkDistanceM: 0, totalTreatsEarnedLifetime: 0, firstWalkAt: null, statsBasis: 0 };
const doc = (stats: Partial<ApiMyStats['stats']> = {}, achievements: ApiMyStats['achievements'] = []): ApiMyStats => ({ stats: { ...zero, ...stats }, achievements });
const put = (m: Member, payload: unknown) => s.app.inject({ method: 'PUT', url: '/v1/me/stats', headers: m.auth, payload: payload as object });
const snapshot = async (m: Member) => (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
const events = async (m: Member) => (await s.app.inject({ method: 'GET', url: '/v1/events?after=0', headers: m.auth })).json<EventsResponse>();

async function pair() {
  const h = await newHousehold(s);
  const a = await joinNew(s, h.id, 'Sam');
  const b = await joinNew(s, h.id, 'Anna', '10.0.0.2');
  return { h, a, b };
}

describe('PUT /v1/me/stats', () => {
  it('stores the first upload and returns it', async () => {
    const { a } = await pair();
    const res = await put(a, doc({ totalWalksClosed: 3, firstWalkAt: 500 }, [{ id: 'first-steps', unlockedAt: 500 }]));
    expect(res.statusCode).toBe(200);
    expect(res.json<ApiMyStats>()).toEqual(doc({ totalWalksClosed: 3, firstWalkAt: 500 }, [{ id: 'first-steps', unlockedAt: 500 }]));
  });

  it('merges on the server: max numbers, earliest dates, union of ids, never lowers', async () => {
    const { a } = await pair();
    await put(a, doc({ totalWalksClosed: 10, lifetimeDistanceMeters: 5000, firstWalkAt: 900 }, [{ id: 'first-steps', unlockedAt: 900 }]));
    const res = await put(a, doc({ totalWalksClosed: 4, lifetimeDistanceMeters: 7000, firstWalkAt: 400 }, [{ id: 'first-steps', unlockedAt: 400 }, { id: 'moving-in', unlockedAt: 450 }]));
    expect(res.json<ApiMyStats>()).toEqual(
      doc({ totalWalksClosed: 10, lifetimeDistanceMeters: 7000, firstWalkAt: 400 }, [{ id: 'first-steps', unlockedAt: 400 }, { id: 'moving-in', unlockedAt: 450 }])
    );
    // a later, smaller upload (a stale phone) changes nothing
    const stale = await put(a, doc({ totalWalksClosed: 1 }));
    expect(stale.json<ApiMyStats>().stats.totalWalksClosed).toBe(10);
    expect(stale.json<ApiMyStats>().achievements).toHaveLength(2);
  });

  it('two uploads in any order give the same result; repeating one changes nothing', async () => {
    const { a, b } = await pair();
    const x = doc({ totalWalksClosed: 2, lifetimeDistanceMeters: 900, firstWalkAt: 700 }, [{ id: 'a-badge', unlockedAt: 50 }]);
    const y = doc({ totalWalksClosed: 5, lifetimeDistanceMeters: 100, firstWalkAt: 300 }, [{ id: 'a-badge', unlockedAt: 20 }, { id: 'b-badge', unlockedAt: 60 }]);
    await put(a, x);
    const ay = (await put(a, y)).json<ApiMyStats>();
    await put(b, y);
    const bx = (await put(b, x)).json<ApiMyStats>();
    expect(bx).toEqual(ay);
    expect((await put(b, x)).json<ApiMyStats>()).toEqual(ay);
  });

  it('keeps unknown achievement ids (a newer app)', async () => {
    const { a } = await pair();
    await put(a, doc({}, [{ id: 'future-badge-2027', unlockedAt: 5 }]));
    const snap = await snapshot(a);
    expect(snap.myStats?.achievements).toEqual([{ id: 'future-badge-2027', unlockedAt: 5 }]);
  });

  it('rounds fractional millisecond times like the walk upload does (iOS)', async () => {
    const { a } = await pair();
    const res = await put(a, doc({ firstWalkAt: 1792359406662.5527 }, [{ id: 'first-steps', unlockedAt: 1792359406662.4 }]));
    expect(res.statusCode).toBe(200);
    expect(res.json<ApiMyStats>().stats.firstWalkAt).toBe(1792359406663);
    expect(res.json<ApiMyStats>().achievements[0].unlockedAt).toBe(1792359406662);
  });

  it('refuses invalid bodies with 400 and stores nothing', async () => {
    const { a } = await pair();
    const bad: Array<[string, unknown]> = [
      ['negative number', doc({ totalWalksClosed: -1 })],
      ['huge number', doc({ lifetimeDistanceMeters: 1e15 })],
      ['string instead of number', { ...doc(), stats: { ...zero, totalWalksClosed: 'NaN' } }],
      ['negative time', doc({ firstWalkAt: -5 })],
      ['unknown stat key', { ...doc(), stats: { ...zero, bonusTreats: 5 } }],
      ['missing stat key', { stats: { totalWalksClosed: 1 }, achievements: [] }],
      ['extra top-level key', { ...doc(), treats: 1 }],
      ['bad achievement id (upper case)', doc({}, [{ id: 'First-Steps', unlockedAt: 1 }])],
      ['bad achievement id (too long)', doc({}, [{ id: 'a'.repeat(41), unlockedAt: 1 }])],
      ['achievement id with slash', doc({}, [{ id: 'a/b', unlockedAt: 1 }])],
      ['101 achievements', doc({}, Array.from({ length: 101 }, (_, i) => ({ id: `badge-${i}`, unlockedAt: 1 })))],
    ];
    for (const [name, payload] of bad) {
      const res = await put(a, payload);
      expect({ name, status: res.statusCode }).toEqual({ name, status: 400 });
    }
    expect((await snapshot(a)).myStats).toBeUndefined();
  });

  it('refuses a union beyond the stored cap (no unbounded table growth)', async () => {
    const { a } = await pair();
    const batch = (from: number) => doc({}, Array.from({ length: 100 }, (_, i) => ({ id: `badge-${from + i}`, unlockedAt: 1 })));
    expect((await put(a, batch(0))).statusCode).toBe(200);
    expect((await put(a, batch(100))).statusCode).toBe(200);
    expect((await put(a, batch(200))).statusCode).toBe(400);
    expect((await snapshot(a)).myStats?.achievements).toHaveLength(200);
  });

  it('needs a token like every other route', async () => {
    const res = await s.app.inject({ method: 'PUT', url: '/v1/me/stats', payload: doc() });
    expect(res.statusCode).toBe(401);
  });
});

describe('privacy and scope', () => {
  it('never reaches the partner: not in their snapshot, not in the events feed, not in the command log', async () => {
    const { a, b } = await pair();
    const eventsBefore = (await events(a)).events.length;
    await put(a, doc({ totalWalksClosed: 99 }, [{ id: 'hundred-walks', unlockedAt: 1 }]));

    expect((await snapshot(b)).myStats).toBeUndefined();
    expect(JSON.stringify(await snapshot(b))).not.toContain('hundred-walks');
    expect((await snapshot(a)).myStats?.stats.totalWalksClosed).toBe(99);
    expect((await events(b)).events).toHaveLength(eventsBefore);
    expect(await s.db.select().from(schema.events).where(eq(schema.events.kind, 'stats.updated'))).toHaveLength(0);
    expect(await s.db.select().from(schema.economyCommands)).toHaveLength(0);

    // the partner's own upload is separate
    await put(b, doc({ totalWalksClosed: 2 }));
    expect((await snapshot(a)).myStats?.stats.totalWalksClosed).toBe(99);
    expect((await snapshot(b)).myStats?.stats.totalWalksClosed).toBe(2);
  });

  it('is gone with the player (cascade)', async () => {
    const { a, b } = await pair();
    await put(a, doc({ totalWalksClosed: 1 }, [{ id: 'first-steps', unlockedAt: 1 }]));
    await put(b, doc({ totalWalksClosed: 2 }, [{ id: 'first-steps', unlockedAt: 1 }]));
    await s.db.delete(schema.players).where(eq(schema.players.id, a.join.playerId));
    const stats = await s.db.select().from(schema.playerStats);
    const achievements = await s.db.select().from(schema.playerAchievements);
    expect(stats.map((r) => r.playerId)).toEqual([b.join.playerId]);
    expect(achievements.map((r) => r.playerId)).toEqual([b.join.playerId]);
  });
});

describe('restore invite (--for-player)', () => {
  async function restoreJoin(code: string, ip = '10.0.0.9', playerName = 'whatever') {
    return s.app.inject({ method: 'POST', url: '/v1/join', remoteAddress: ip, payload: { code, playerName, deviceLabel: 'new phone', consent: true } });
  }

  it('adds a device to the existing player: same player id, no member.joined, stats come back', async () => {
    const { h, a } = await pair();
    await put(a, doc({ totalWalksClosed: 7 }, [{ id: 'first-steps', unlockedAt: 3 }]));
    const eventsBefore = (await events(a)).events;

    const invite = await createInvite(s.db, h.id, 24 * 3600_000, s.now, a.join.playerId);
    const res = await restoreJoin(invite.code);
    expect(res.statusCode).toBe(200);
    const join = res.json<JoinResponse>();
    expect(join.restored).toBe(true);
    expect(join.playerId).toBe(a.join.playerId);
    expect(join.playerName).toBe('Sam'); // the typed name is ignored
    expect(join.deviceId).not.toBe(a.join.deviceId);

    expect((await events(a)).events).toHaveLength(eventsBefore.length); // no member.joined
    expect(await s.db.select().from(schema.players)).toHaveLength(2);
    expect((await s.db.select().from(schema.devices).where(eq(schema.devices.playerId, a.join.playerId)))).toHaveLength(2);

    const newPhone = { 'authorization': `Bearer ${join.token}` };
    const snap = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: newPhone })).json<SnapshotResponse>();
    expect(snap.me.playerId).toBe(a.join.playerId);
    expect(snap.myStats).toEqual(doc({ totalWalksClosed: 7 }, [{ id: 'first-steps', unlockedAt: 3 }]));
    expect(snap.players.map((p) => p.displayName).sort()).toEqual(['Anna', 'Sam']);
  });

  it('ignores capacity (a full household can still restore a member)', async () => {
    const h = await newHousehold(s);
    const members: Member[] = [];
    for (let i = 0; i < 4; i++) members.push(await joinNew(s, h.id, `P${i}`, `10.0.1.${i}`));
    const full = await createInvite(s.db, h.id, 24 * 3600_000, s.now);
    expect((await restoreJoin(full.code)).statusCode).toBe(403); // a normal invite is refused at capacity
    const invite = await createInvite(s.db, h.id, 24 * 3600_000, s.now, members[2].join.playerId);
    expect((await restoreJoin(invite.code, '10.0.9.9')).statusCode).toBe(200);
  });

  it('is single-use and expires after 24 h', async () => {
    const { h, a } = await pair();
    const invite = await createInvite(s.db, h.id, 24 * 3600_000, s.now, a.join.playerId);
    expect((await restoreJoin(invite.code)).statusCode).toBe(200);
    expect((await restoreJoin(invite.code, '10.0.9.10')).statusCode).toBe(403);

    const old = await createInvite(s.db, h.id, 24 * 3600_000, s.now, a.join.playerId);
    s.setNow(s.now + 25 * 3600_000);
    expect((await restoreJoin(old.code, '10.0.9.11')).statusCode).toBe(403);
  });

  it('is refused (and not burned) for a player who left', async () => {
    const { h, a } = await pair();
    const invite = await createInvite(s.db, h.id, 24 * 3600_000, s.now, a.join.playerId);
    await s.db.update(schema.players).set({ leftAt: new Date(s.now) }).where(eq(schema.players.id, a.join.playerId));
    expect((await restoreJoin(invite.code)).statusCode).toBe(403);
    const [row] = await s.db.select().from(schema.inviteCodes).where(eq(schema.inviteCodes.playerId, a.join.playerId));
    expect(row.usedAt).toBeNull();
  });

  it('is refused (and not burned) when the invite and the player disagree about the household', async () => {
    const { a } = await pair();
    const other = await newHousehold(s, 'Other');
    const invite = await createInvite(s.db, other.id, 24 * 3600_000, s.now, a.join.playerId); // only possible by hand, the CLI derives the household
    expect((await restoreJoin(invite.code)).statusCode).toBe(403);
    const [row] = await s.db.select().from(schema.inviteCodes).where(eq(schema.inviteCodes.playerId, a.join.playerId));
    expect(row.usedAt).toBeNull();
    expect(await s.db.select().from(schema.devices).where(eq(schema.devices.playerId, a.join.playerId))).toHaveLength(1);
  });

  it('cannot be requested over HTTP: a join body with a playerId is a 400 and a normal invite stays a normal invite', async () => {
    const { h, a } = await pair();
    const normal = await createInvite(s.db, h.id, 24 * 3600_000, s.now);
    const res = await s.app.inject({
      method: 'POST', url: '/v1/join', remoteAddress: '10.0.9.20',
      payload: { code: normal.code, playerName: 'Mallory', deviceLabel: 'x', consent: true, playerId: a.join.playerId, restore: true },
    });
    expect(res.statusCode).toBe(400);
    const ok = await restoreJoin(normal.code, '10.0.9.21', 'Mallory');
    expect(ok.json<JoinResponse>().playerId).not.toBe(a.join.playerId);
    expect(ok.json<JoinResponse>().restored).toBeUndefined();
  });

  it('attachDevice makes a working second token for the same player; the old one can be revoked independently', async () => {
    const { a } = await pair();
    const attached = await attachDevice(s.db, a.join.playerId, 'spare');
    const snap = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: { authorization: `Bearer ${attached.token}` } })).json<SnapshotResponse>();
    expect(snap.me.playerId).toBe(a.join.playerId);
    expect(snap.me.deviceId).toBe(attached.device.id);
  });

  it('findPlayer resolves an id, or a name inside a household', async () => {
    const { h, a } = await pair();
    expect((await findPlayer(s.db, a.join.playerId)).displayName).toBe('Sam');
    expect((await findPlayer(s.db, 'Anna', h.id)).displayName).toBe('Anna');
    await expect(findPlayer(s.db, 'Anna')).rejects.toThrow(/--household/);
    await expect(findPlayer(s.db, 'Nobody', h.id)).rejects.toThrow(/no active player/);
    const other = await newHousehold(s, 'Other');
    await expect(findPlayer(s.db, a.join.playerId, other.id)).rejects.toThrow(/no active player/); // id and household must agree
  });
});

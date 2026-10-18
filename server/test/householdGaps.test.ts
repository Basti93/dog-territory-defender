// Household sync gap-closers: player.rename, manual-log walks, walk.delete feed + "Range never shrinks".
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandResponse, EventsResponse, SnapshotResponse, WalkUploadRequest, WalkUploadResponse } from '@game/sync/apiContract';
import { buddyTreatsPerWalk, manualLogBloomMultiplier, xpAwardForWalk } from '@game/economy/formulas';
import { NOW, joinNew, makeServer, newHousehold, straightWalk, type Member, type TestServer } from './helpers';

let s: TestServer;
beforeEach(async () => {
  s = await makeServer();
});
afterEach(async () => {
  await s.close();
});

const cmd = (m: Member, clientId: string, command: object) =>
  s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: { clientId, command } });
const upload = (m: Member, body: WalkUploadRequest) => s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: body });
const snapshot = async (m: Member) => (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
const events = async (m: Member, after = 0) =>
  (await s.app.inject({ method: 'GET', url: `/v1/events?after=${after}`, headers: m.auth })).json<EventsResponse>();

const manual = (id: string, refreshRouteWalkId?: string): WalkUploadRequest => ({
  id,
  startTime: NOW,
  startSource: 'manual-log',
  locations: [],
  ...(refreshRouteWalkId ? { refreshRouteWalkId } : {}),
});

describe('player.rename', () => {
  it('trims, updates the player and emits member.updated; replay is idempotent', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id, 'Sam');
    const b = await joinNew(s, h.id, 'Sam', '10.0.0.2');

    const res = await cmd(b, 'client-rename-0001', { kind: 'player.rename', name: '  Anna ' });
    expect(res.statusCode).toBe(200);
    expect(res.json<CommandResponse>().ok).toBe(true);
    const replay = await cmd(b, 'client-rename-0001', { kind: 'player.rename', name: '  Anna ' });
    expect(replay.json<CommandResponse>().replayed).toBe(true);

    const snap = await snapshot(a);
    expect(snap.players.map((p) => p.displayName).sort()).toEqual(['Anna', 'Sam']);
    expect(snap.me.displayName).toBe('Sam');

    const updated = (await events(a)).events.filter((e) => e.kind === 'member.updated');
    expect(updated).toHaveLength(1);
    expect(updated[0].payload).toMatchObject({ player: { id: b.join.playerId, displayName: 'Anna' } });
    expect(updated[0].actorPlayerId).toBe(b.join.playerId);
  });

  it('rejects empty, whitespace-only and over-long names', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    for (const [i, name] of ['', '   ', 'x'.repeat(25)].entries()) {
      const res = await cmd(a, `client-rename-bad${i}`, { kind: 'player.rename', name });
      expect(res.statusCode).toBe(400);
    }
    expect((await cmd(a, 'client-rename-ok24', { kind: 'player.rename', name: 'x'.repeat(24) })).statusCode).toBe(200);
  });
});

describe('manual-log walks', () => {
  it('earns the flat treats/XP, paints nothing, and shows up in the feed', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    const before = await snapshot(a);

    const res = await upload(a, manual('manual-1700000000001'));
    expect(res.statusCode).toBe(200);
    const body = res.json<WalkUploadResponse>();
    expect(body.reward).toMatchObject({ qualifies: true, cellsPainted: 0, bloomMultiplier: 1, dailyMultiplier: 1, routeRefreshed: false });
    expect(body.reward.treatsEarned).toBe(buddyTreatsPerWalk(1, 1));
    expect(body.reward.xpEarned).toBe(xpAwardForWalk(0, 0, 1));
    expect(body.den.treats).toBe(before.den.treats + buddyTreatsPerWalk(1, 1));

    const snap = await snapshot(a);
    expect(snap.cells).toHaveLength(0);
    expect(snap.territories).toHaveLength(0);
    expect(snap.walks[0]).toMatchObject({ startSource: 'manual-log', closed: true, treatsEarned: body.reward.treatsEarned });
    const kinds = (await events(a)).events.map((e) => e.kind);
    expect(kinds).toContain('walk.added');
    expect(kinds).not.toContain('cells.changed');
  });

  it('shares the daily manual-log quota across the household (2/day) and counts deleted logs', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id, 'Sam');
    const b = await joinNew(s, h.id, 'Anna', '10.0.0.2');
    expect((await upload(a, manual('manual-1700000000001'))).statusCode).toBe(200);
    expect((await upload(b, manual('manual-1700000000002'))).statusCode).toBe(200);
    await cmd(a, 'client-del-0000001', { kind: 'walk.delete', walkId: 'manual-1700000000001' });
    const third = await upload(a, manual('manual-1700000000003'));
    expect(third.statusCode).toBe(422);
    expect(third.json()).toEqual({ error: 'walk_rejected', reason: 'manual-log-quota' });
    // idempotent re-upload of an accepted log is still fine
    expect((await upload(b, manual('manual-1700000000002'))).json<WalkUploadResponse>().duplicate).toBe(true);
    // next day the quota is fresh
    s.setNow(NOW + 24 * 3600_000);
    expect((await upload(a, { ...manual('manual-1700000000004'), startTime: NOW + 24 * 3600_000 })).statusCode).toBe(200);
  });

  it('rejects a manual log that carries a route', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    const res = await upload(a, { ...straightWalk('manual-1700000000009', NOW - 1000), startSource: 'manual-log' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ reason: 'unsupported-source' });
  });

  it('refreshes a tracked route household-wide once per day, with the manual-log bloom', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id, 'Sam');
    const b = await joinNew(s, h.id, 'Anna', '10.0.0.2');
    await upload(a, straightWalk('walk-aaaaaaaa-0001', NOW - 3600_000));
    const painted = await snapshot(b);
    const oldest = Math.max(...painted.cells.map((c) => c.lastRefreshed));
    expect(oldest).toBeLessThan(NOW);
    const seqBefore = painted.seq;

    const first = (await upload(b, manual('manual-1700000000001', 'walk-aaaaaaaa-0001'))).json<WalkUploadResponse>();
    expect(first.reward.routeRefreshed).toBe(true);
    expect(first.reward.bloomMultiplier).toBeCloseTo(manualLogBloomMultiplier(), 6);
    expect(first.reward.treatsEarned).toBe(Math.round(buddyTreatsPerWalk(painted.den.level, painted.den.sniffGardenLevel) * manualLogBloomMultiplier()));

    const after = await snapshot(a);
    expect(after.cells).toHaveLength(painted.cells.length);
    for (const c of after.cells) {
      const was = painted.cells.find((p) => p.ix === c.ix && p.iy === c.iy)!;
      expect(c.lastRefreshed).toBe(NOW);
      expect(c.lastTracked).toBe(was.lastTracked); // freshness only
      expect(c.visits).toBe(was.visits);
      expect(c.territoryId).toBe(was.territoryId);
    }
    expect((await events(a, seqBefore)).events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['walk.added', 'cells.changed', 'den.updated'])
    );

    // second refresh the same day, by the partner: still logged and rewarded, but no refresh / no bloom
    const second = (await upload(a, manual('manual-1700000000002', 'walk-aaaaaaaa-0001'))).json<WalkUploadResponse>();
    expect(second.reward.routeRefreshed).toBe(false);
    expect(second.reward.bloomMultiplier).toBe(1);
  });

  it('ignores a refresh request for an unknown or deleted route', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    const res = (await upload(a, manual('manual-1700000000001', 'walk-does-not-exist'))).json<WalkUploadResponse>();
    expect(res.reward.routeRefreshed).toBe(false);
    expect(res.reward.bloomMultiplier).toBe(1);
  });
});

describe('walk.delete', () => {
  it('emits walk.deleted, keeps the cells (the Range never shrinks) and is not-found the second time', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    await upload(a, straightWalk('walk-aaaaaaaa-0001', NOW - 3600_000));
    const cellsBefore = (await snapshot(a)).cells.length;

    const del = (await cmd(a, 'client-del-0000001', { kind: 'walk.delete', walkId: 'walk-aaaaaaaa-0001' })).json<CommandResponse>();
    expect(del.ok).toBe(true);
    const deleted = (await events(a)).events.filter((e) => e.kind === 'walk.deleted');
    expect(deleted).toHaveLength(1);
    expect(deleted[0].payload).toEqual({ walkId: 'walk-aaaaaaaa-0001' });
    expect((await snapshot(a)).cells).toHaveLength(cellsBefore);

    const again = (await cmd(a, 'client-del-0000002', { kind: 'walk.delete', walkId: 'walk-aaaaaaaa-0001' })).json<CommandResponse>();
    expect(again).toMatchObject({ ok: false, error: 'not-found' });
  });
});

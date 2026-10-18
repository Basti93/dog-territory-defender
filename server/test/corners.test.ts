// "Unsere Ecken": the corner.name command, the snapshot's names and the corner.updated event.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandResponse, EventsResponse, SnapshotResponse } from '@game/sync/apiContract';
import { joinNew, makeServer, newHousehold, type Member, type TestServer } from './helpers';

let s: TestServer;
beforeEach(async () => {
  s = await makeServer();
});
afterEach(async () => {
  await s.close();
});

const cmd = (m: Member, clientId: string, command: object) =>
  s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: { clientId, command } });
const snapshot = async (m: Member) => (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
const events = async (m: Member, after = 0) =>
  (await s.app.inject({ method: 'GET', url: `/v1/events?after=${after}`, headers: m.auth })).json<EventsResponse>();

describe('corner.name', () => {
  it('stores the trimmed name, returns it in the snapshot and emits corner.updated; replay is idempotent', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id, 'Sam');
    const b = await joinNew(s, h.id, 'Anna', '10.0.0.2');

    const res = await cmd(a, 'client-corner-0001', { kind: 'corner.name', cornerId: '1234567,6543210', name: '  Kiosk-Ecke ' });
    expect(res.statusCode).toBe(200);
    expect(res.json<CommandResponse>().ok).toBe(true);
    const replay = await cmd(a, 'client-corner-0001', { kind: 'corner.name', cornerId: '1234567,6543210', name: '  Kiosk-Ecke ' });
    expect(replay.json<CommandResponse>().replayed).toBe(true);

    const snap = await snapshot(b);
    expect(snap.corners).toEqual([{ id: '1234567,6543210', name: 'Kiosk-Ecke', updatedBy: a.join.playerId, updatedAt: s.now }]);

    const updated = (await events(b)).events.filter((e) => e.kind === 'corner.updated');
    expect(updated).toHaveLength(1); // the replay emitted nothing
    expect(updated[0].payload).toMatchObject({ corner: { id: '1234567,6543210', name: 'Kiosk-Ecke', updatedBy: a.join.playerId } });
    expect(updated[0].actorPlayerId).toBe(a.join.playerId);
  });

  it('last writer wins: the other member renames, one row stays', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id, 'Sam');
    const b = await joinNew(s, h.id, 'Anna', '10.0.0.2');
    await cmd(a, 'client-corner-0002', { kind: 'corner.name', cornerId: '-5,77', name: 'Bank am Park' });
    s.setNow(s.now + 60_000);
    await cmd(b, 'client-corner-0003', { kind: 'corner.name', cornerId: '-5,77', name: 'Unsere Bank' });

    const snap = await snapshot(a);
    expect(snap.corners).toHaveLength(1);
    expect(snap.corners![0]).toMatchObject({ name: 'Unsere Bank', updatedBy: b.join.playerId });
    expect((await events(a)).events.filter((e) => e.kind === 'corner.updated')).toHaveLength(2);
  });

  it('keeps corners per household', async () => {
    const h1 = await newHousehold(s);
    const h2 = await newHousehold(s);
    const a = await joinNew(s, h1.id);
    const c = await joinNew(s, h2.id, 'Other', '10.0.0.3');
    await cmd(a, 'client-corner-0004', { kind: 'corner.name', cornerId: '1,2', name: 'Meine Ecke' });
    expect((await snapshot(c)).corners).toEqual([]);
  });

  it('rejects empty, whitespace-only, over-long names and malformed ids', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    const bad = [
      { cornerId: '1,2', name: '' },
      { cornerId: '1,2', name: '   ' },
      { cornerId: '1,2', name: 'x'.repeat(25) },
      { cornerId: 'nope', name: 'Ok' },
      { cornerId: '1,2,3', name: 'Ok' },
    ];
    for (const [i, c] of bad.entries()) {
      expect((await cmd(a, `client-corner-bad${i}x`, { kind: 'corner.name', ...c })).statusCode).toBe(400);
    }
    expect((await cmd(a, 'client-corner-ok24', { kind: 'corner.name', cornerId: '1,2', name: 'x'.repeat(24) })).statusCode).toBe(200);
  });

  it('counts characters, not bytes or UTF-16 units: 24 multi-byte characters pass, 25 do not', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    expect((await cmd(a, 'client-corner-eur24', { kind: 'corner.name', cornerId: '1,2', name: '€'.repeat(24) })).statusCode).toBe(200);
    expect((await cmd(a, 'client-corner-dog24', { kind: 'corner.name', cornerId: '1,3', name: '🐕'.repeat(24) })).statusCode).toBe(200);
    expect((await cmd(a, 'client-corner-eur25', { kind: 'corner.name', cornerId: '1,4', name: '€'.repeat(25) })).statusCode).toBe(400);
    const snap = await snapshot(a);
    expect(snap.corners!.map((c) => Array.from(c.name).length).sort()).toEqual([24, 24]);
  });

  it('refuses a name with a NUL character (Postgres text cannot hold it) instead of failing with a 500', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    const res = await cmd(a, 'client-corner-nul00', { kind: 'corner.name', cornerId: '1,2', name: 'a\u0000b' });
    expect(res.statusCode).toBe(400);
  });

  it('keeps injection-looking text as plain text in the name', async () => {
    const h = await newHousehold(s);
    const a = await joinNew(s, h.id);
    const name = "x'); DROP TABLE a;--";
    expect((await cmd(a, 'client-corner-sqli0', { kind: 'corner.name', cornerId: '1,2', name })).statusCode).toBe(200);
    expect((await snapshot(a)).corners![0].name).toBe(name);
  });
});

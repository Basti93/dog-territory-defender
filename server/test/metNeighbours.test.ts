// Neighbour dogs met on a walk: derived at upload from the dogs' planned walk times, stored on the walk.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { SnapshotResponse, WalkUploadResponse } from '@game/sync/apiContract';
import * as schema from '../src/db/schema';
import { NOW, joinNew, makeServer, newHousehold, straightWalk, type Member, type TestServer } from './helpers';

let s: TestServer;
beforeEach(async () => {
  s = await makeServer({}, { enabled: true });
});
afterEach(async () => {
  await s.close();
});

async function post(m: Member, id: string, startTime: number) {
  const res = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: straightWalk(id, startTime) });
  expect(res.statusCode).toBe(200);
  return res.json<WalkUploadRequestResponse>();
}
type WalkUploadRequestResponse = WalkUploadResponse;

async function planFor(hostId: string, archetype: string, plannedStart: number, status = 'planned') {
  const [bot] = await s.db.select().from(schema.botProfiles).where(eq(schema.botProfiles.hostHouseholdId, hostId));
  const profiles = await s.db.select().from(schema.botProfiles).where(eq(schema.botProfiles.hostHouseholdId, hostId));
  const p = profiles.find((x) => x.archetype === archetype) ?? bot;
  await s.db.insert(schema.botSchedules).values({ householdId: p.householdId, hostHouseholdId: hostId, day: '2026-10-18', slot: `t-${archetype}-${plannedStart}`, plannedStart, targetM: 1500, status });
}

describe('metNeighbourIds', () => {
  it('lists the dogs whose walk overlapped ours, stores it, and returns it on replay and in the snapshot', async () => {
    const h = await newHousehold(s, 'Muster', 'Europe/Berlin');
    const m = await joinNew(s, h.id);
    const first = await post(m, 'walk-aaaaaaaa-0001', NOW - 4 * 3600_000); // creates the bots, nobody met yet
    expect(first.metNeighbourIds ?? []).toEqual([]);

    const start = NOW - 2 * 3600_000;
    await planFor(h.id, 'momo', start + 60_000); // starts during our walk (it lasts ~5 min)
    await planFor(h.id, 'keks', start - 1_500_000); // out for about 15 min, back before we started
    await planFor(h.id, 'pfote', start + 30_000, 'skipped'); // skipped dogs were never out
    await planFor(h.id, 'lotte', start + 10 * 60_000); // after we finished
    const second = await post(m, 'walk-aaaaaaaa-0002', start);
    expect(second.metNeighbourIds).toEqual(['momo']);

    const again = await post(m, 'walk-aaaaaaaa-0002', start);
    expect(again.duplicate).toBe(true);
    expect(again.metNeighbourIds).toEqual(['momo']);

    const snap = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
    expect(snap.walks.find((w) => w.id === 'walk-aaaaaaaa-0002')!.metNeighbourIds).toEqual(['momo']);
    expect(snap.walks.find((w) => w.id === 'walk-aaaaaaaa-0001')!.metNeighbourIds).toBeUndefined();
  });

  it('keeps at most three, the longest overlap first', async () => {
    const h = await newHousehold(s, 'Muster', 'Europe/Berlin');
    const m = await joinNew(s, h.id);
    await post(m, 'walk-aaaaaaaa-0001', NOW - 4 * 3600_000);
    const start = NOW - 2 * 3600_000;
    for (const [dog, offset] of [['momo', 200_000], ['pfote', 0], ['bruno', 250_000], ['keks', 100_000]] as const) await planFor(h.id, dog, start + offset);
    const res = await post(m, 'walk-aaaaaaaa-0002', start);
    expect(res.metNeighbourIds).toHaveLength(3);
    expect(res.metNeighbourIds![0]).toBe('pfote');
  });
});

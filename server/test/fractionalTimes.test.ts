// iOS (expo-location) sends fractional-millisecond timestamps; Postgres refuses those for bigint columns, which was a
// 500 on POST /v1/walks (Alex's phone, Oct 2026). The HTTP layer rounds every client ms time (http/clientTimes.ts).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PresenceResponse, SnapshotResponse, WalkUploadRequest } from '@game/sync/apiContract';
import { cells, deviceLogs, denState, walkPresence, walks } from '../src/db/schema';
import { joinNew, makeServer, newHousehold, NOW, straightWalk, type TestServer } from './helpers';

let s: TestServer;
beforeEach(async () => {
  s = await makeServer();
});
afterEach(() => s.close());

const FRACTION = 0.5527;

function fractionalWalk(id: string): WalkUploadRequest {
  const w = straightWalk(id, NOW - 3600_000);
  return { ...w, startTime: w.startTime + FRACTION, locations: w.locations.map((l) => ({ ...l, timestamp: l.timestamp + FRACTION })) };
}

describe('fractional client timestamps', () => {
  it('accepts a walk upload and stores integer times everywhere', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const walk = fractionalWalk('walk-frac-00000001');

    const res = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: walk });
    expect(res.statusCode).toBe(200);

    const [row] = await s.db.select().from(walks).where(eq(walks.id, walk.id));
    expect(row.startTime).toBe(Math.round(walk.startTime));
    const route = row.route as Array<{ timestamp: number }>;
    expect(route).toHaveLength(walk.locations.length);
    expect(route.every((l) => Number.isInteger(l.timestamp))).toBe(true);
    const lastT = Math.round(walk.locations[walk.locations.length - 1].timestamp);
    const painted = await s.db.select().from(cells).where(eq(cells.householdId, h.id));
    expect(painted.length).toBeGreaterThan(0);
    expect(painted.every((c) => c.lastRefreshed === lastT && c.lastTracked === lastT)).toBe(true);

    // retry of the same walk is a duplicate, not a second row
    const again = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: walk });
    expect(again.json().duplicate).toBe(true);
  });

  it('keeps float treats and xp in double columns and integers in integer columns', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: fractionalWalk('walk-frac-00000002') });
    const [row] = await s.db.select().from(walks).where(eq(walks.id, 'walk-frac-00000002'));
    expect(Number.isInteger(row.treatsEarned)).toBe(true);
    const [den] = await s.db.select().from(denState).where(eq(denState.householdId, h.id));
    expect(Number.isFinite(den.xp)).toBe(true); // xp is double precision: fractional values are legitimate
  });

  it('accepts presence beats with fractional times', async () => {
    const h = await newHousehold(s);
    const alex = await joinNew(s, h.id, 'Alex', '10.0.0.2');
    const sam = await joinNew(s, h.id, 'Sam', '10.0.0.1');
    const points = [0, 1, 2].map((i) => ({ lat: 48.137 + i * 0.00005, lon: 11.575, t: NOW + i * 5000 + FRACTION }));
    const res = await s.app.inject({
      method: 'POST',
      url: '/v1/presence',
      headers: alex.auth,
      payload: { walkId: 'walk-alex-frac', startedAt: NOW + FRACTION, points },
    });
    expect(res.statusCode).toBe(200);
    const [row] = await s.db.select().from(walkPresence).where(eq(walkPresence.walkId, 'walk-alex-frac'));
    expect(row.startedAt).toBe(NOW + 1);
    const seen = await s.app.inject({ method: 'GET', url: '/v1/presence', headers: sam.auth });
    expect(seen.json<PresenceResponse>().presence[0].points.map((p) => p.t)).toEqual([NOW + 1, NOW + 5001, NOW + 10_001]);
  });

  it('accepts device logs with fractional times', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const res = await s.app.inject({
      method: 'POST',
      url: '/v1/logs',
      headers: m.auth,
      payload: { deviceSeq: 1, entries: [{ t: 1792359406662.5527, event: 'GPS_UPDATE', payload: {}, appState: 'active' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stored: 1 });
    const [row] = await s.db.select().from(deviceLogs).where(eq(deviceLogs.householdId, h.id));
    expect(row.t).toBe(1792359406663);
  });

  it('accepts a founding import with fractional times', async () => {
    const h = await newHousehold(s, 'Muster', 'Europe/Berlin', true);
    const m = await joinNew(s, h.id);
    const walk = fractionalWalk('old-walk-frac-001');
    const res = await s.app.inject({
      method: 'POST',
      url: '/v1/households/import',
      headers: m.auth,
      payload: {
        importId: 'import-frac-0001',
        walks: [{ ...walk, closed: true, treatsEarned: 70 }],
        cells: [{ ix: 100, iy: 200, lastRefreshed: NOW - 1000 + FRACTION, lastTracked: NOW - 1000 + FRACTION, visits: 1, territoryId: null }],
        territories: [],
        den: { treats: 120.5, doghouseLevel: 1, bakeryLevel: 1, sniffGardenLevel: 1, lastTickAt: NOW + FRACTION, xp: 423.6000427340933, level: 2 },
        dog: { name: 'Buddy', appearance: {} },
      },
    });
    expect(res.statusCode).toBe(200);
    const snap = res.json<SnapshotResponse>();
    expect(snap.cells[0].lastRefreshed).toBe(NOW - 999);
    expect(Number.isInteger(snap.den.lastTickAt)).toBe(true);
    expect(snap.den.xp).toBeCloseTo(423.6000427340933, 10);
  });
});

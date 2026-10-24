// Territories (docs/specs/home-range.md "Reviere"): one home territory, far patches promoted after 2 walks and 40
// cells, the territory.name command, and the start-up fold of small territories.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { CommandResponse, SnapshotResponse, WalkUploadRequest, WalkUploadResponse } from '@game/sync/apiContract';
import { cells, territories } from '../src/db/schema';
import { foldSmallTerritories } from '../src/services/territoryFold';
import { joinNew, makeServer, newHousehold, straightWalk, type Member, type TestServer } from './helpers';

let s: TestServer;
beforeEach(async () => {
  s = await makeServer();
});
afterEach(async () => {
  await s.close();
});

const HOUR = 3600_000;
const upload = async (m: Member, payload: WalkUploadRequest) => {
  s.setNow(payload.startTime + 30 * 60_000); // the upload comes in after the walk
  const res = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload });
  expect(res.statusCode).toBe(200);
  return res.json<WalkUploadResponse>();
};
const snapshot = async (m: Member) => (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();

// 4.4 km north of the home walk: far beyond the 1000 m birth distance.
const FAR = { lat: 48.137 + 0.04, meters: 700 };

describe('walk ingest', () => {
  it('gives the household one home territory; a far walk stays home ground until a second walk and 40 cells', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);

    await upload(m, { ...straightWalk('walk-home-0001', s.now), territoryNameHint: "Rex's territory on Home Street" });
    expect((await snapshot(m)).territories.map((t) => t.name)).toEqual(["Rex's territory on Home Street"]);

    const first = await upload(m, { ...straightWalk('walk-far-00001', s.now + HOUR, FAR), territoryNameHint: 'Too early' });
    expect(first.reward.newTerritoryName).toBeNull();
    expect((await snapshot(m)).territories).toHaveLength(1);

    const second = await upload(m, { ...straightWalk('walk-far-00002', s.now + 2 * HOUR, FAR), territoryNameHint: "Rex's territory on Far Lane" });
    expect(second.reward.newTerritoryName).toBe("Rex's territory on Far Lane");
    expect(second.reward.newTerritoryId).toBeTruthy();

    const snap = await snapshot(m);
    expect(snap.territories).toHaveLength(2);
    const far = snap.territories.find((t) => t.id === second.reward.newTerritoryId)!;
    expect(far.walksHere).toBe(2);
    const farCells = snap.cells.filter((c) => c.territoryId === far.id);
    expect(farCells.length).toBeGreaterThanOrEqual(40);
    // every cell has a territory and the home walk's cells stayed home
    expect(snap.cells.every((c) => c.territoryId !== null)).toBe(true);
  });

  it('territory.name renames by the promoting walk id and tells the household', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    await upload(m, straightWalk('walk-home-0001', s.now));
    await upload(m, straightWalk('walk-far-00001', s.now + HOUR, FAR));
    const second = await upload(m, straightWalk('walk-far-00002', s.now + 2 * HOUR, FAR));
    const res = await s.app.inject({
      method: 'POST',
      url: '/v1/commands',
      headers: m.auth,
      payload: { clientId: 'client-terr-0001', command: { kind: 'territory.name', fromWalkId: 'walk-far-00002', name: '  Omas Garten ' } },
    });
    expect(res.json<CommandResponse>().ok).toBe(true);
    const snap = await snapshot(m);
    expect(snap.territories.find((t) => t.id === second.reward.newTerritoryId)?.name).toBe('Omas Garten');

    const unknown = await s.app.inject({
      method: 'POST',
      url: '/v1/commands',
      headers: m.auth,
      payload: { clientId: 'client-terr-0002', command: { kind: 'territory.name', fromWalkId: 'walk-home-0001', name: 'Nope' } },
    });
    expect(unknown.json<CommandResponse>().ok).toBe(false); // the home walk promoted nothing
  });
});

describe('foldSmallTerritories (start-up data migration)', () => {
  it('folds territories with fewer than 2 walks into the nearest kept one, emits events, and is idempotent', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const home = 't000000000000001-home';
    const ghost = 't000000000000002-ghos';
    await s.db.insert(territories).values([
      { householdId: h.id, id: home, name: 'Linden', createdAt: 1, walksHere: 24, treatsEarnedHere: 100 },
      { householdId: h.id, id: ghost, name: 'Birkenweg', createdAt: 2, walksHere: 0, treatsEarnedHere: 0 },
    ]);
    await s.db.insert(cells).values([
      { householdId: h.id, ix: 1, iy: 1, lastRefreshed: 1, lastTracked: 1, baselineVisits: 0, visits: 1, territoryId: home },
      { householdId: h.id, ix: 900, iy: 900, lastRefreshed: 1, lastTracked: 1, baselineVisits: 0, visits: 1, territoryId: ghost },
    ]);

    expect(await foldSmallTerritories(s.db)).toBe(1);
    expect(await foldSmallTerritories(s.db)).toBe(0);

    const snap = await snapshot(m);
    expect(snap.territories.map((t) => t.id)).toEqual([home]);
    expect(snap.cells.every((c) => c.territoryId === home)).toBe(true);
    const rows = await s.db.select().from(territories).where(eq(territories.householdId, h.id));
    expect(rows[0].walksHere).toBe(24);
  });

  it('one failing household does not stop the others', async () => {
    const h1 = await newHousehold(s, 'Eins');
    const h2 = await newHousehold(s, 'Zwei');
    for (const h of [h1, h2]) {
      await s.db.insert(territories).values([
        { householdId: h.id, id: 't000000000000001-home', name: 'Home', createdAt: 1, walksHere: 5 },
        { householdId: h.id, id: 't000000000000002-ghos', name: 'Ghost', createdAt: 2, walksHere: 0 },
      ]);
    }
    let calls = 0;
    const flaky = new Proxy(s.db, {
      get(target, key) {
        if (key === 'transaction') return (fn: never) => (calls++ === 0 ? Promise.reject(new Error('boom')) : target.transaction(fn));
        const v = Reflect.get(target, key) as unknown;
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const errors: string[] = [];
    expect(await foldSmallTerritories(flaky, undefined, (hid) => errors.push(hid))).toBe(1);
    expect(errors).toHaveLength(1);
  });
});

describe('territory.name limits', () => {
  it('accepts a 60-character name and rejects 61', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const send = (clientId: string, name: string) =>
      s.app.inject({ method: 'POST', url: '/v1/commands', headers: m.auth, payload: { clientId, command: { kind: 'territory.name', territoryId: 'nope', name } } });
    expect((await send('client-len-0001', 'x'.repeat(60))).statusCode).toBe(200);
    expect((await send('client-len-0002', 'x'.repeat(61))).statusCode).toBe(400);
  });
});

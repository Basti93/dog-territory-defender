// Walk-statistics hygiene (docs/specs/walk-lifecycle.md): the upload stamps the statistics view, the startup fold repairs
// older walks (idle tail cut in the numbers, tiny walks excluded) and corrects each player's stored lifetime figures once.
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiMyStats, EventsResponse, SnapshotResponse, WalkUploadRequest } from '@game/sync/apiContract';
import type { Location } from '@game/types';
import { walkDistanceMeters } from '@game/utils/geometry';
import { WALK_STATS_VERSION } from '@game/walks/walkRepair';
import { playerStats, walks } from '../src/db/schema';
import { correctPlayerStats, foldWalkStats } from '../src/services/walkStats';
import { joinNew, makeServer, newHousehold, straightWalk, type Member, type TestServer } from './helpers';

let s: TestServer;
beforeEach(async () => {
  s = await makeServer();
});
afterEach(async () => {
  await s.close();
});

const MIN = 60_000;
const START = Date.UTC(2026, 9, 20, 7, 0, 0);

/** 20 minutes of walking north (a fix every 5 s, 7 m a step), then `benchMin` minutes of a phone jittering on a bench. */
function walkWithBench(benchMin: number, startTime = START): Location[] {
  const moving = straightWalk('x', startTime, { meters: 1500 }).locations as Location[];
  const last = moving[moving.length - 1];
  const bench = Array.from({ length: benchMin * 12 }, (_, i) => ({
    latitude: last.latitude + Math.sin(i * 1.7) * 0.00002,
    longitude: last.longitude + Math.cos(i * 2.3) * 0.00002,
    timestamp: last.timestamp + (i + 1) * 5000,
    accuracy: 10,
  }));
  return [...moving, ...bench];
}

/** Inserts a walk the way the server stored them before this change: no statistics columns. */
async function insertOldWalk(m: Member, id: string, startTime: number, locations: Location[], closed = true) {
  await s.db.insert(walks).values({
    householdId: m.householdId,
    id,
    playerId: m.join.playerId,
    startTime,
    startSource: 'button',
    route: locations,
    closed,
    treatsEarned: closed ? 100 : null,
    reward: { qualifies: closed, cellsPainted: 100, treatsEarned: closed ? 100 : 0 },
  });
}
const rowOf = async (m: Member, id: string) => (await s.db.select().from(walks).where(and(eq(walks.householdId, m.householdId), eq(walks.id, id))))[0];
const snapshot = async (m: Member) => (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
const eventsOf = async (m: Member) => (await s.app.inject({ method: 'GET', url: '/v1/events?after=0', headers: m.auth })).json<EventsResponse>();
const put = (m: Member, payload: unknown) => s.app.inject({ method: 'PUT', url: '/v1/me/stats', headers: m.auth, payload: payload as object });
const stats = (o: Partial<ApiMyStats['stats']> = {}): ApiMyStats['stats'] => ({ totalWalksClosed: 0, lifetimeDistanceMeters: 0, lifetimeTerritoryAreaM2: 0, biggestTerritoryAreaM2: 0, longestWalkDistanceM: 0, totalTreatsEarnedLifetime: 0, firstWalkAt: null, statsBasis: 0, ...o });

describe('upload', () => {
  it('stamps the statistics view (idle tail cut) and the snapshot carries it, rewards computed from the full route as before', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const locations = walkWithBench(90);
    const req: WalkUploadRequest = { id: 'walk-bench-0001', startTime: START, startSource: 'button', locations };
    s.setNow(START + 4 * 60 * MIN);
    const res = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: req });
    expect(res.statusCode).toBe(200);
    expect(res.json().reward.qualifies).toBe(true);

    const row = await rowOf(m, 'walk-bench-0001');
    expect(row.statsVersion).toBe(WALK_STATS_VERSION);
    expect(row.statsExcluded).toBeNull();
    expect(row.statsEndTime!).toBeLessThan(START + 25 * MIN); // not the 110 minutes of the full route
    expect((row.route as Location[]).length).toBe(locations.length); // the route is never edited
    const meta = (await snapshot(m)).walks.find((w) => w.id === 'walk-bench-0001')!;
    expect(meta).toMatchObject({ statsVersion: WALK_STATS_VERSION, statsEndTime: row.statsEndTime });
    expect(meta.statsExcluded).toBeUndefined();
  });

  it('marks a tiny walk too_short and reports it in the meta', async () => {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    s.setNow(START + 60 * MIN);
    const tiny = straightWalk('walk-tiny-00001', START, { meters: 450 });
    tiny.locations = tiny.locations.slice(0, 12); // 1 minute
    expect((await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: tiny })).statusCode).toBe(200);
    expect((await snapshot(m)).walks.find((w) => w.id === 'walk-tiny-00001')).toMatchObject({ statsExcluded: 'too_short' });
  });
});

describe('foldWalkStats', () => {
  async function fixture() {
    const h = await newHousehold(s);
    const m = await joinNew(s, h.id);
    const stuck = walkWithBench(120);
    const fine = straightWalk('x', START + 86400_000, { meters: 1200 }).locations as Location[];
    const tiny = (straightWalk('x', START + 2 * 86400_000, { meters: 450 }).locations as Location[]).slice(0, 10);
    await insertOldWalk(m, 'walk-stuck-0001', START, stuck);
    await insertOldWalk(m, 'walk-fine-00001', START + 86400_000, fine);
    await insertOldWalk(m, 'walk-tiny-00001', START + 2 * 86400_000, tiny, false);
    const rawStuck = walkDistanceMeters({ startTime: START, locations: stuck });
    const rawFine = walkDistanceMeters({ startTime: START + 86400_000, locations: fine });
    // the player's stored figures, as the phone accumulated them: raw distances, the stuck walk is the record
    await s.db.insert(playerStats).values({
      playerId: m.join.playerId,
      state: stats({ totalWalksClosed: 2, lifetimeDistanceMeters: rawStuck + rawFine, longestWalkDistanceM: Math.max(rawStuck, rawFine), statsBasis: undefined as unknown as number }),
      updatedAt: 1,
    });
    return { m, rawStuck, rawFine };
  }

  it('stamps every walk, cuts the idle tail in the numbers, excludes the tiny walk and tells the household', async () => {
    const { m } = await fixture();
    const before = (await eventsOf(m)).events.length;
    const report = await foldWalkStats(s.db, undefined, (_h, err) => { throw err; }, START);
    expect(report).toMatchObject({ walksChecked: 3, trimmed: 1, excluded: { too_short: 1 }, resent: 2 });

    expect((await rowOf(m, 'walk-stuck-0001')).statsEndTime!).toBeLessThan(START + 25 * MIN);
    expect(await rowOf(m, 'walk-fine-00001')).toMatchObject({ statsVersion: WALK_STATS_VERSION, statsExcluded: null });
    expect((await rowOf(m, 'walk-fine-00001')).statsEndTime).toBe(((await rowOf(m, 'walk-fine-00001')).route as Location[]).at(-1)!.timestamp);
    expect((await rowOf(m, 'walk-tiny-00001')).statsExcluded).toBe('too_short');
    // rewards untouched
    expect(await rowOf(m, 'walk-stuck-0001')).toMatchObject({ closed: true, treatsEarned: 100 });

    const added = (await eventsOf(m)).events.slice(before).filter((e) => e.kind === 'walk.added').map((e) => (e.payload as { walk: { id: string; statsExcluded?: string } }).walk.id);
    expect(added.sort()).toEqual(['walk-stuck-0001', 'walk-tiny-00001']); // the normal walk needs no re-send
  });

  it('corrects the player once: lifetime loses the idle tail, the stuck record is rebuilt, basis moves; a second run changes nothing', async () => {
    const { m, rawStuck, rawFine } = await fixture();
    const report = await foldWalkStats(s.db, undefined, (_h, err) => { throw err; }, START);
    expect(report.players).toHaveLength(1);
    const [row] = await s.db.select().from(playerStats).where(eq(playerStats.playerId, m.join.playerId));
    const after = row.state as ApiMyStats['stats'];
    expect(after.statsBasis).toBe(WALK_STATS_VERSION);
    expect(after.lifetimeDistanceMeters).toBeLessThan(rawStuck + rawFine);
    expect(after.lifetimeDistanceMeters).toBeGreaterThan(rawFine); // the real 20 minutes of the stuck walk stay
    expect(after.longestWalkDistanceM).toBeLessThan(rawStuck);
    expect(after.totalWalksClosed).toBe(2); // counts are not touched

    const again = await foldWalkStats(s.db, undefined, undefined, START + 1);
    expect(again).toMatchObject({ walksChecked: 0, resent: 0, players: [] });
    expect(((await s.db.select().from(playerStats).where(eq(playerStats.playerId, m.join.playerId)))[0].state as ApiMyStats['stats'])).toEqual(after);
  });

  it('a phone that still holds the old figures cannot raise the corrected ones back (basis wins the merge)', async () => {
    const { m, rawStuck, rawFine } = await fixture();
    await foldWalkStats(s.db, undefined, undefined, START);
    const res = await put(m, { stats: stats({ totalWalksClosed: 2, lifetimeDistanceMeters: rawStuck + rawFine, longestWalkDistanceM: rawStuck }), achievements: [] });
    expect(res.statusCode).toBe(200);
    expect(res.json<ApiMyStats>().stats.statsBasis).toBe(WALK_STATS_VERSION);
    expect(res.json<ApiMyStats>().stats.lifetimeDistanceMeters).toBeLessThan(rawStuck + rawFine);
    // an app from before sends no statsBasis at all: accepted, same outcome
    const { statsBasis: _omit, ...legacy } = stats({ lifetimeDistanceMeters: rawStuck + rawFine });
    const old = await put(m, { stats: legacy, achievements: [] });
    expect(old.statusCode).toBe(200);
    expect(old.json<ApiMyStats>().stats.lifetimeDistanceMeters).toBeLessThan(rawStuck + rawFine);
  });
});

describe('correctPlayerStats', () => {
  it('leaves a figure alone when the record walk did not change, and skips a player already at the basis', () => {
    const fine = straightWalk('x', START, { meters: 1200 }).locations as Location[];
    const raw = walkDistanceMeters({ startTime: START, locations: fine });
    const w = { closed: true, startTime: START, startSource: 'button' as const, locations: fine };
    const r = correctPlayerStats(stats({ lifetimeDistanceMeters: raw, longestWalkDistanceM: raw }), [w]);
    expect(r).toMatchObject({ lifetimeDeltaM: 0, longestChanged: false });
    expect(r.stats.statsBasis).toBe(WALK_STATS_VERSION);
    expect(correctPlayerStats(r.stats, [w]).stats).toBe(r.stats);
  });
});

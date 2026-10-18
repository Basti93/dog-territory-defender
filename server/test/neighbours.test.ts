// Track B (Nachbarhunde) server tests. PGlite, no network: Overpass is a fake grid of streets.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { BUDDY_ACCENTS, BUDDY_COATS, BUDDY_EAR_STYLES, BUDDY_MARKINGS, BUDDY_SIZES, BUDDY_TAIL_STYLES } from '@game/buddy/buddyAppearance';
import { NEIGHBOUR_CONFIG, coopGoalKm, coopPlayerShareKm, sprinkleTreats } from '@game/economy/neighbourConfig';
import type { CommandResponse, CoopWeekResponse, EventsResponse, GiftsResponse, NearbyResponse, SnapshotResponse, WalkUploadResponse } from '@game/sync/apiContract';
import { NEIGHBOUR_LINE_KEYS } from '@game/sync/apiContract';
import { cellForLocation } from '@game/utils/grid';
import type { Location } from '@game/types';
import * as schema from '../src/db/schema';
import { addDays, dayKeyInZone, localToUtcMs, weekStartOf } from '../src/lib/time';
import { ARCHETYPES, LINES } from '../src/neighbours/archetypes';
import { botHome, hostAnchor } from '../src/neighbours/bots';
import { ensureCoopWeek } from '../src/neighbours/coop';
import { hashSeed } from '../src/neighbours/rng';
import { distanceM } from '../src/neighbours/geo';
import { canPlan, planDay } from '../src/neighbours/planner';
import { runTick } from '../src/neighbours/tick';
import { EventBus } from '../src/services/events';
import { NOW, joinNew, makeServer, newHousehold, straightWalk, testConfig, denRevOf, type Member, type TestServer } from './helpers';

const TZ = 'Europe/Berlin';
const ANCHOR: [number, number] = [48.137, 11.575];
const DAY0 = dayKeyInZone(NOW, TZ); // 2026-10-18, the introduction day

/** Overpass stand-in: a street grid (every ~222 m by ~223 m) with globally consistent node ids. */
function fakeOverpass(counter?: { calls: number }): typeof fetch {
  return (async (_url: unknown, init: { body: string }) => {
    if (counter) counter.calls++;
    const q = decodeURIComponent(init.body.slice('data='.length));
    const [s, w, n, e] = (q.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/) as RegExpMatchArray).slice(1).map(Number);
    const LAT = 0.002;
    const LON = 0.003;
    const j0 = Math.round(s / LAT);
    const j1 = Math.round(n / LAT);
    const i0 = Math.round(w / LON);
    const i1 = Math.round(e / LON);
    const id = (i: number, j: number) => j * 1_000_000 + i + 500_000;
    const ways: unknown[] = [];
    for (let j = j0; j <= j1; j++) {
      const nodes: number[] = [];
      const geometry: Array<{ lat: number; lon: number }> = [];
      for (let i = i0; i <= i1; i++) {
        nodes.push(id(i, j));
        geometry.push({ lat: j * LAT, lon: i * LON });
      }
      ways.push({ type: 'way', id: 1000 + j, nodes, geometry });
    }
    for (let i = i0; i <= i1; i++) {
      const nodes: number[] = [];
      const geometry: Array<{ lat: number; lon: number }> = [];
      for (let j = j0; j <= j1; j++) {
        nodes.push(id(i, j));
        geometry.push({ lat: j * LAT, lon: i * LON });
      }
      ways.push({ type: 'way', id: 900_000 + i, nodes, geometry });
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ elements: ways }) } as Response;
  }) as unknown as typeof fetch;
}

let s: TestServer;
beforeEach(async () => {
  s = await makeServer({}, { enabled: true });
});
afterEach(async () => {
  await s.close();
});

const bus = new EventBus();
const cfgOn = (overpassUrl = '') => testConfig({}, { enabled: true, overpassUrl, overpassPauseMs: 0 });

async function household(name = 'Muster'): Promise<Member> {
  const h = await newHousehold(s, name, TZ);
  return joinNew(s, h.id, 'Sam', `10.0.0.${Math.floor(Math.random() * 200) + 1}`);
}

async function postWalk(m: Member, id: string, opts: Parameters<typeof straightWalk>[2] = {}, startTime = NOW - 3600_000) {
  const res = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: straightWalk(id, startTime, opts) });
  expect(res.statusCode).toBe(200);
  return res.json<WalkUploadResponse>();
}

const botProfiles = (hostId: string) => s.db.select().from(schema.botProfiles).where(eq(schema.botProfiles.hostHouseholdId, hostId));
const hostEvents = async (hostId: string) => s.db.select().from(schema.neighbourEvents).where(eq(schema.neighbourEvents.hostHouseholdId, hostId)).orderBy(asc(schema.neighbourEvents.dueAt));
const day = (n: number) => addDays(DAY0, n);
const noonUtc = (n: number) => localToUtcMs(day(n), 12 * 60, TZ);
const tick = (now: number, fetchImpl?: typeof fetch, url = '') => runTick({ db: s.db, bus, config: cfgOn(url), now, fetchImpl });

describe('time helpers', () => {
  it('converts local wall-clock to UTC across DST', () => {
    expect(localToUtcMs('2026-10-19', 6 * 60 + 15, TZ)).toBe(Date.UTC(2026, 9, 19, 4, 15)); // CEST, +2
    expect(localToUtcMs('2026-11-02', 6 * 60 + 15, TZ)).toBe(Date.UTC(2026, 10, 2, 5, 15)); // CET, +1
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12');
  });
});

describe('bot creation', () => {
  it('creates six bot households on the first tracked walk, never on a manual log, and only once', async () => {
    const m = await household();
    const manual = await s.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: { id: 'manual-aaaaaaaa', startTime: NOW - 1000, startSource: 'manual-log', locations: [] } });
    expect(manual.statusCode).toBe(200);
    expect(await botProfiles(m.householdId)).toHaveLength(0);

    await postWalk(m, 'walk-aaaaaaaa-0001');
    const profiles = await botProfiles(m.householdId);
    expect(profiles.map((p) => p.archetype).sort()).toEqual(['bruno', 'keks', 'lotte', 'momo', 'nebel', 'pfote']);
    const bots = await s.db.select().from(schema.households).where(eq(schema.households.isBot, true));
    expect(bots).toHaveLength(6);
    expect(await s.db.select().from(schema.devices).where(eq(schema.devices.householdId, bots[0].id))).toHaveLength(0);

    await postWalk(m, 'walk-aaaaaaaa-0002');
    expect(await botProfiles(m.householdId)).toHaveLength(6);
  });

  it('is deterministic per household and archetype: same seed and home every time, other households differ', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001');
    const profiles = await botProfiles(m.householdId);
    const anchor = (await hostAnchor(s.db, m.householdId))!;
    expect(anchor[0]).toBeCloseTo(ANCHOR[0], 4);
    for (const p of profiles) {
      const a = ARCHETYPES.find((x) => x.id === p.archetype)!;
      const again = botHome(m.householdId, a, anchor);
      expect(p.seed).toBe(hashSeed(m.householdId, p.archetype));
      expect([p.homeLat, p.homeLng]).toEqual(again.home);
      const away = distanceM(anchor, again.home);
      expect(away).toBeGreaterThanOrEqual(NEIGHBOUR_CONFIG.geo.botHomeMinM - 5);
      expect(away).toBeLessThanOrEqual(NEIGHBOUR_CONFIG.geo.botHomeMaxM + 5);
    }
    const other = botHome('00000000-0000-0000-0000-000000000000', ARCHETYPES[0], anchor);
    expect(other.home).not.toEqual(botHome(m.householdId, ARCHETYPES[0], anchor).home);
  });

  it('uses only valid Buddy appearance ids and keeps the 12 lines in step with the contract', () => {
    for (const a of ARCHETYPES) {
      expect(BUDDY_COATS).toContain(a.appearance.coat);
      expect(BUDDY_MARKINGS).toContain(a.appearance.markings);
      expect(BUDDY_EAR_STYLES).toContain(a.appearance.earStyle);
      expect(BUDDY_TAIL_STYLES).toContain(a.appearance.tailStyle);
      expect(BUDDY_SIZES).toContain(a.appearance.size);
      expect(BUDDY_ACCENTS).toContain(a.appearance.accentColour);
    }
    expect(LINES.map((l) => l.key).sort()).toEqual([...NEIGHBOUR_LINE_KEYS].sort());
  });

  it('does nothing while the feature flag is off', async () => {
    const off = await makeServer();
    try {
      const h = await newHousehold(off, 'Off', TZ);
      const m = await joinNew(off, h.id);
      await off.app.inject({ method: 'POST', url: '/v1/walks', headers: m.auth, payload: straightWalk('walk-offoffoff', NOW - 3600_000) });
      expect(await off.db.select().from(schema.botProfiles)).toHaveLength(0);
      const nearby = await off.app.inject({ method: 'GET', url: '/v1/nearby', headers: m.auth });
      expect(nearby.json<NearbyResponse>().items).toEqual([]);
    } finally {
      await off.close();
    }
  });
});

describe('planner: escalation and caps', () => {
  it('plans nothing on the introduction day, a Momo sniff the morning after, and honours every cap over 5 weeks', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001');
    expect((await planDay(s.db, m.householdId, day(0))).planned).toBe(false);

    for (let n = 1; n <= 35; n++) await planDay(s.db, m.householdId, day(n));
    const events = await hostEvents(m.householdId);
    const profiles = new Map((await botProfiles(m.householdId)).map((p) => [p.householdId, p.archetype] as const));

    // M2: first morning after, Momo sniffed at our corner
    const first = events.find((e) => e.day === day(1))!;
    expect(first.lineKey).toBe('neighbours.line.sniffCorner');
    expect(profiles.get(first.botHouseholdId!)).toBe('momo');

    // escalation by weeks since the first walk
    const archetypesBefore = (lastDay: number) => new Set(events.filter((e) => e.day <= day(lastDay)).map((e) => profiles.get(e.botHouseholdId!)));
    expect([...archetypesBefore(6)].every((a) => a === 'momo' || a === 'pfote')).toBe(true);
    const sched = await s.db.select().from(schema.botSchedules);
    const schedBots = (from: number, to: number) => new Set(sched.filter((x) => x.day >= day(from) && x.day <= day(to)).map((x) => [...profiles].find(([id]) => id === x.householdId)![1]));
    expect([...schedBots(1, 6)].sort()).toEqual(['momo', 'pfote']);
    expect(schedBots(7, 13).has('bruno')).toBe(true);
    expect(schedBots(7, 13).has('keks')).toBe(false);
    expect(schedBots(14, 20).has('keks') || schedBots(14, 20).has('lotte')).toBe(true);
    expect(schedBots(14, 20).has('nebel')).toBe(false);
    expect(schedBots(21, 35).has('nebel')).toBe(true);
    expect(events.some((e) => e.kind === 'neighbour.invitation' && e.day < day(7))).toBe(false);
    const weird = events.filter((e) => profiles.get(e.botHouseholdId!) === 'nebel');
    if (weird.length) expect(weird[0].lineKey).toBe('neighbours.line.moonHello');
    expect(events.some((e) => (e.lineKey.endsWith('moonHello') || e.lineKey.endsWith('sockLeft')) && e.day < day(21))).toBe(false);

    // caps
    const perDay = new Map<string, typeof events>();
    for (const e of events) perDay.set(e.day, [...(perDay.get(e.day) ?? []), e]);
    for (const list of perDay.values()) {
      expect(list.length).toBeLessThanOrEqual(NEIGHBOUR_CONFIG.caps.eventsPerDay);
      expect(list.filter((e) => e.kind === 'neighbour.gift').length).toBeLessThanOrEqual(NEIGHBOUR_CONFIG.caps.giftsPerDay);
    }
    const perWeek = new Map<string, typeof events>();
    for (const e of events) perWeek.set(weekStartOf(e.day), [...(perWeek.get(weekStartOf(e.day)) ?? []), e]);
    for (const list of perWeek.values()) {
      expect(list.filter((e) => e.kind === 'neighbour.invitation').length).toBeLessThanOrEqual(NEIGHBOUR_CONFIG.caps.invitationsPerWeek);
      expect(list.filter((e) => e.kind === 'neighbour.reaction').length).toBeLessThanOrEqual(NEIGHBOUR_CONFIG.caps.reactionsPerWeek);
    }
    for (const e of events) {
      const repeats = events.filter((o) => o !== e && o.lineKey === e.lineKey && Math.abs(Date.parse(o.day) - Date.parse(e.day)) < NEIGHBOUR_CONFIG.caps.lineRepeatDays * 86_400_000);
      expect(repeats).toHaveLength(0);
    }
    // average stays well below the 2/day ceiling
    expect(events.length / 35).toBeLessThanOrEqual(1.2);
  });

  it('is idempotent: planning a day twice changes nothing', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001');
    await planDay(s.db, m.householdId, day(1));
    const before = [(await s.db.select().from(schema.botSchedules)).length, (await hostEvents(m.householdId)).length];
    expect((await planDay(s.db, m.householdId, day(1))).planned).toBe(false);
    expect([(await s.db.select().from(schema.botSchedules)).length, (await hostEvents(m.householdId)).length]).toEqual(before);
  });

  it('canPlan enforces the cap table on plain rows', () => {
    const row = (d: string, kind: string, lineKey: string) => ({ day: d, kind, lineKey, botHouseholdId: null });
    const gift = LINES.find((l) => l.key === 'neighbours.line.collarGift')!;
    const invite = LINES.find((l) => l.key === 'neighbours.line.invitation')!;
    const sniff = LINES.find((l) => l.key === 'neighbours.line.sniffCorner')!;
    expect(canPlan([row('2026-10-20', 'neighbour.gift', 'x'), row('2026-10-20', 'neighbour.sniffed', 'y')], sniff, '2026-10-20')).toBe(false); // 2 per day
    expect(canPlan([row('2026-10-20', 'neighbour.gift', 'x')], gift, '2026-10-20')).toBe(false); // 1 gift per day
    expect(canPlan([row('2026-10-19', 'neighbour.invitation', 'z')], invite, '2026-10-22')).toBe(false); // same ISO week
    expect(canPlan([row('2026-10-19', 'neighbour.invitation', 'z')], invite, '2026-10-27')).toBe(true);
    expect(canPlan([row('2026-10-12', 'neighbour.sniffed', sniff.key)], sniff, '2026-10-21')).toBe(false); // 9 days: still a repeat
    expect(canPlan([row('2026-10-12', 'neighbour.sniffed', sniff.key)], sniff, '2026-10-22')).toBe(true); // 10 days: fine
  });
});

describe('walk generation', () => {
  async function runWeek(m: Member, url: string, fetchImpl?: typeof fetch, days = 3) {
    for (let n = 1; n <= days; n++) await tick(noonUtc(n), fetchImpl, url);
  }

  it('osm generator: loops stay out of the home block and off the real Range, host cells never change, bot cells are generated', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 800 });
    const hostCellsBefore = await s.db.select().from(schema.cells).where(eq(schema.cells.householdId, m.householdId));
    const counter = { calls: 0 };
    await runWeek(m, 'https://overpass.test/api', fakeOverpass(counter), 8);
    expect(counter.calls).toBeGreaterThan(0);

    const tiles = await s.db.select().from(schema.streetTiles);
    expect(tiles.some((t) => t.status === 'ok' && t.graph && t.graph.length > 0)).toBe(true);

    const done = await s.db.select().from(schema.botSchedules).where(eq(schema.botSchedules.status, 'done'));
    expect(done.length).toBeGreaterThan(3);
    expect(done.some((d) => d.generator === 'osm')).toBe(true);

    const anchor = (await hostAnchor(s.db, m.householdId))!;
    const rangeKeys = new Set(hostCellsBefore.map((c) => `${c.ix},${c.iy}`));
    const botWalks = await s.db.select().from(schema.walks).where(eq(schema.walks.generated, true));
    expect(botWalks.length).toBe(done.length);
    for (const w of botWalks) {
      expect(w.playerId).toBeNull();
      const route = w.route as Location[];
      expect(route.length).toBeGreaterThan(20);
      for (const l of route) {
        expect(distanceM(anchor, [l.latitude, l.longitude])).toBeGreaterThan(NEIGHBOUR_CONFIG.geo.homeBlockRadiusM);
        const c = cellForLocation(l.latitude, l.longitude);
        expect(rangeKeys.has(`${c.ix},${c.iy}`)).toBe(false);
      }
      // written only once it is over, never ahead of the clock
      expect(route[route.length - 1].timestamp).toBeLessThanOrEqual(noonUtc(8));
    }
    for (const d of done) {
      expect(d.distanceM!).toBeGreaterThanOrEqual(NEIGHBOUR_CONFIG.geo.loopMinM * (1 - NEIGHBOUR_CONFIG.geo.lengthTolerance) - 1);
      expect(d.distanceM!).toBeLessThanOrEqual(NEIGHBOUR_CONFIG.geo.loopMaxM * (1 + NEIGHBOUR_CONFIG.geo.lengthTolerance) + 1);
    }

    // bot Ranges exist, are flagged, and the host's cells are byte-for-byte unchanged
    const botCells = await s.db.select().from(schema.cells).where(eq(schema.cells.generated, true));
    expect(botCells.length).toBeGreaterThan(40);
    const hostCellsAfter = await s.db.select().from(schema.cells).where(eq(schema.cells.householdId, m.householdId));
    expect(hostCellsAfter).toEqual(hostCellsBefore);
    expect(hostCellsAfter.every((c) => !c.generated)).toBe(true);

    // human snapshot never contains a generated row
    const snap = (await s.app.inject({ method: 'GET', url: '/v1/snapshot', headers: m.auth })).json<SnapshotResponse>();
    expect(snap.cells).toHaveLength(hostCellsBefore.length);
    expect(snap.walks.every((w) => w.playerId === m.join.playerId)).toBe(true);
  });

  it('offset fallback when Overpass is not configured: jittered copies of the household routes, outside the home block', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 2000 });
    await postWalk(m, 'walk-aaaaaaaa-0002', { meters: 1800, lon: 11.5805 }, NOW - 7200_000);
    await runWeek(m, '', undefined, 6);
    const done = await s.db.select().from(schema.botSchedules).where(eq(schema.botSchedules.status, 'done'));
    expect(done.length).toBeGreaterThan(0);
    expect(done.every((d) => d.generator === 'offset')).toBe(true);
    const anchor = (await hostAnchor(s.db, m.householdId))!;
    for (const w of await s.db.select().from(schema.walks).where(eq(schema.walks.generated, true))) {
      for (const l of w.route as Location[]) expect(distanceM(anchor, [l.latitude, l.longitude])).toBeGreaterThan(NEIGHBOUR_CONFIG.geo.homeBlockRadiusM);
    }
  });

  it('falls back to offset when Overpass fails, marks the tile failed and does not retry before the backoff', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 2000 });
    const requested: string[] = [];
    const broken = (async (_url: unknown, init: { body: string }) => {
      requested.push(init.body);
      throw new Error('network down');
    }) as unknown as typeof fetch;
    for (let i = 0; i < 4; i++) await tick(noonUtc(1) + i * 15 * 60_000, broken, 'https://overpass.test/api');
    expect(requested.length).toBeGreaterThan(0);
    expect(new Set(requested).size).toBe(requested.length); // a failed tile is not hammered again within the backoff
    expect((await s.db.select().from(schema.streetTiles)).every((t) => t.status === 'failed')).toBe(true);
    const done = await s.db.select().from(schema.botSchedules).where(eq(schema.botSchedules.status, 'done'));
    expect(done.every((d) => d.generator === 'offset')).toBe(true);
  });

  it('never writes a walk before it is over, and a repeated tick is a no-op', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 2000 });
    const dayOne = await (async () => {
      await tick(localToUtcMs(day(1), 6 * 60 + 20, TZ)); // just after the planner time, before any walk
      return (await s.db.select().from(schema.botSchedules)).sort((a, b) => a.plannedStart - b.plannedStart);
    })();
    expect(dayOne.length).toBeGreaterThan(0);
    expect(await s.db.select().from(schema.walks).where(eq(schema.walks.generated, true))).toHaveLength(0);
    const momoAm = dayOne.find((d) => d.slot === 'am')!;
    await tick(momoAm.plannedStart + 60_000);
    expect((await s.db.select().from(schema.walks).where(eq(schema.walks.generated, true))).length).toBe(0);
    await tick(noonUtc(1));
    const walks1 = (await s.db.select().from(schema.walks).where(eq(schema.walks.generated, true))).length;
    expect(walks1).toBeGreaterThan(0);
    const ev1 = (await s.db.select().from(schema.events).where(eq(schema.events.householdId, m.householdId))).length;
    const second = await tick(noonUtc(1));
    expect(second.walksWritten + second.eventsEmitted).toBe(0);
    expect((await s.db.select().from(schema.walks).where(eq(schema.walks.generated, true))).length).toBe(walks1);
    expect((await s.db.select().from(schema.events).where(eq(schema.events.householdId, m.householdId))).length).toBe(ev1);
  });
});

describe('events feed', () => {
  it('delivers the morning-after sniff through the normal cursor with the new kinds', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 1500 });
    const cursor0 = (await s.app.inject({ method: 'GET', url: '/v1/events?after=0&limit=100', headers: m.auth })).json<EventsResponse>().cursor;
    const r = await tick(noonUtc(1));
    expect(r.eventsEmitted).toBeGreaterThan(0);
    const feed = (await s.app.inject({ method: 'GET', url: `/v1/events?after=${cursor0}`, headers: m.auth })).json<EventsResponse>();
    const neighbour = feed.events.filter((e) => e.kind.startsWith('neighbour.') || e.kind === 'coop.progress');
    expect(neighbour.length).toBe(r.eventsEmitted);
    const sniff = neighbour.find((e) => e.kind === 'neighbour.sniffed')!;
    expect(sniff.payload).toMatchObject({ botName: 'Momo', line: 'neighbours.line.sniffCorner', params: { bot: 'Momo' } });
    expect(sniff.actorPlayerId).toBeNull();
    // cursor order == emission order, and paging with a limit of 1 walks through everything exactly once
    expect(feed.events.map((e) => e.seq)).toEqual([...feed.events.map((e) => e.seq)].sort((a, b) => a - b));
    let after = cursor0;
    const seen: number[] = [];
    for (let i = 0; i < 20; i++) {
      const page = (await s.app.inject({ method: 'GET', url: `/v1/events?after=${after}&limit=1`, headers: m.auth })).json<EventsResponse>();
      seen.push(...page.events.map((e) => e.seq));
      after = page.cursor;
      if (!page.hasMore) break;
    }
    expect(seen).toEqual(feed.events.map((e) => e.seq));
  });

  it('a second household never sees the first one’s neighbours', async () => {
    const a = await household('A');
    await postWalk(a, 'walk-aaaaaaaa-0001', { meters: 1500 });
    const other = await newHousehold(s, 'B', TZ);
    const b = await joinNew(s, other.id, 'Bea', '10.0.9.9');
    await tick(noonUtc(1));
    const feed = (await s.app.inject({ method: 'GET', url: '/v1/events?after=0&limit=100', headers: b.auth })).json<EventsResponse>();
    expect(feed.events.some((e) => e.kind.startsWith('neighbour.'))).toBe(false);
    expect((await s.app.inject({ method: 'GET', url: '/v1/nearby', headers: b.auth })).json<NearbyResponse>().items).toEqual([]);
  });
});

describe('reactions', () => {
  it('about one in three walks with new ground schedules a Momo reaction walk through the new ground, within the caps', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 800 });
    // find walk ids the hash picks / skips
    const ids = Array.from({ length: 60 }, (_, i) => `walk-react-${String(i).padStart(4, '0')}`);
    const picked = ids.find((id) => hashSeed(id) % NEIGHBOUR_CONFIG.reactionOneInN === 0)!;
    const skipped = ids.find((id) => hashSeed(id) % NEIGHBOUR_CONFIG.reactionOneInN !== 0)!;
    await postWalk(m, skipped, { lon: 11.62, meters: 800 }, NOW - 1800_000);
    expect((await hostEvents(m.householdId)).filter((e) => e.kind === 'neighbour.reaction')).toHaveLength(0);
    await postWalk(m, picked, { lon: 11.64, meters: 800 }, NOW - 1700_000);
    const reactions = (await hostEvents(m.householdId)).filter((e) => e.kind === 'neighbour.reaction');
    expect(reactions).toHaveLength(1);
    expect(reactions[0].lineKey).toBe('neighbours.line.followedPath');
    expect((reactions[0].params as { pawCells: unknown[] }).pawCells.length).toBeGreaterThan(0);
    expect((reactions[0].params as { pawCells: unknown[] }).pawCells.length).toBeLessThanOrEqual(NEIGHBOUR_CONFIG.maxPawCells);
    expect(reactions[0].dueAt).toBeGreaterThan(NOW);
    const sched = (await s.db.select().from(schema.botSchedules)).filter((x) => x.slot.startsWith('reaction-'));
    expect(sched).toHaveLength(1);
    expect(sched[0].via).toBeTruthy();

    // emitted once the reaction walk is over: payload carries paw cells, not params clutter
    const r = await tick(reactions[0].dueAt + 3600_000);
    expect(r.eventsEmitted).toBeGreaterThan(0);
    const feed = (await s.app.inject({ method: 'GET', url: '/v1/events?after=0&limit=100', headers: m.auth })).json<EventsResponse>();
    const ev = feed.events.find((e) => e.kind === 'neighbour.reaction')!;
    expect((ev.payload as { pawCells?: unknown[] }).pawCells?.length).toBeGreaterThan(0);
    expect((ev.payload as { params: Record<string, unknown> }).params).toEqual({ bot: 'Momo' });
  });
});

describe('gifts', () => {
  it('sprinkle math: 5 % of the mean of the last 14 walks, at least 1, none without walks', () => {
    expect(sprinkleTreats([])).toBeNull();
    expect(sprinkleTreats([0, 0])).toBeNull();
    expect(sprinkleTreats([100, 200])).toBe(8); // mean 150 x 5 % = 7.5 -> 8
    expect(sprinkleTreats([5])).toBe(1); // 0.25 -> floor of 1
    expect(sprinkleTreats([...Array(14).fill(100), 100000])).toBe(5); // only the newest 14 count
  });

  async function setupWithGiftEvents() {
    const m = await household();
    const walk = await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 1500 });
    const profiles = await botProfiles(m.householdId);
    const pfote = profiles.find((p) => p.archetype === 'pfote')!;
    // two gift events on the same day (bypassing the planner on purpose): only the first may carry a sprinkle
    for (const [i, line] of ['stickLeft', 'collarGift'].entries()) {
      await s.db.insert(schema.neighbourEvents).values({
        hostHouseholdId: m.householdId,
        botHouseholdId: pfote.householdId,
        kind: 'neighbour.gift',
        lineKey: `neighbours.line.${line}`,
        params: { bot: 'Pfote' },
        day: day(1),
        slotKey: `test-${i}`,
        dueAt: noonUtc(1) - 1000 + i,
      });
    }
    await tick(noonUtc(1));
    return { m, walk };
  }

  it('creates gifts with cosmetics and at most one sprinkle per day, listed newest first', async () => {
    const { m, walk } = await setupWithGiftEvents();
    const list = (await s.app.inject({ method: 'GET', url: '/v1/gifts', headers: m.auth })).json<GiftsResponse>();
    expect(list.gifts.length).toBeGreaterThanOrEqual(2);
    const sprinkled = list.gifts.filter((g) => g.sprinkleTreats !== null);
    expect(sprinkled).toHaveLength(1);
    expect(sprinkled[0].sprinkleTreats).toBe(sprinkleTreats([walk.reward.treatsEarned]));
    expect(list.gifts.every((g) => g.openedAt === null && g.botName === 'Pfote')).toBe(true);
    expect(new Set(list.gifts.map((g) => g.cosmeticId)).size).toBe(list.gifts.length); // never the same cosmetic twice
    const giftEvents = (await s.app.inject({ method: 'GET', url: '/v1/events?after=0&limit=100', headers: m.auth })).json<EventsResponse>().events.filter((e) => e.kind === 'neighbour.gift');
    expect(giftEvents.map((e) => (e.payload as { giftId: string }).giftId).sort()).toEqual(list.gifts.map((g) => g.id).sort());
  });

  it('opens once: credits the sprinkle straight into the Den (no multipliers), replays and second opens credit nothing', async () => {
    const { m } = await setupWithGiftEvents();
    const list = (await s.app.inject({ method: 'GET', url: '/v1/gifts', headers: m.auth })).json<GiftsResponse>();
    const gift = list.gifts.find((g) => g.sprinkleTreats !== null)!;
    const before = await denRevOf(s, m.householdId);
    const open = (clientId: string, id = gift.id) => s.app.inject({ method: 'POST', url: `/v1/gifts/${id}/open`, headers: m.auth, payload: { clientId } });

    const first = (await open('open-aaaaaaaa-0001')).json<CommandResponse>();
    expect(first.ok).toBe(true);
    expect(first.den.treats - before.treats).toBe(gift.sprinkleTreats); // server clock did not move: no accrual in between
    expect(first.den.rev).toBe(before.rev + 1);

    const replay = (await open('open-aaaaaaaa-0001')).json<CommandResponse>();
    expect(replay.replayed).toBe(true);
    expect(replay.den.treats).toBe(first.den.treats);
    const again = (await open('open-aaaaaaaa-0002')).json<CommandResponse>();
    expect(again.ok).toBe(true);
    expect(again.den.treats).toBe(first.den.treats);

    const after = (await s.app.inject({ method: 'GET', url: '/v1/gifts', headers: m.auth })).json<GiftsResponse>();
    expect(after.gifts.find((g) => g.id === gift.id)!.openedAt).toBe(NOW);

    // unknown gift, and another household's gift, are not-found
    expect((await open('open-aaaaaaaa-0003', '00000000-0000-4000-8000-000000000000')).json<CommandResponse>().error).toBe('not-found');
    const other = await newHousehold(s, 'Other', TZ);
    const o = await joinNew(s, other.id, 'Olli', '10.0.8.8');
    const stolen = await s.app.inject({ method: 'POST', url: `/v1/gifts/${gift.id}/open`, headers: o.auth, payload: { clientId: 'open-bbbbbbbb-0001' } });
    expect(stolen.json<CommandResponse>().error).toBe('not-found');
  });

  it('the exclusive cosmetic comes after the dog was met three distinct days', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 1500 });
    const pfote = (await botProfiles(m.householdId)).find((p) => p.archetype === 'pfote')!;
    for (let n = 1; n <= 4; n++) {
      await s.db.insert(schema.neighbourEvents).values({
        hostHouseholdId: m.householdId,
        botHouseholdId: pfote.householdId,
        kind: 'neighbour.gift',
        lineKey: 'neighbours.line.stickLeft',
        params: { bot: 'Pfote' },
        day: day(n),
        slotKey: 'test',
        dueAt: noonUtc(n),
      });
    }
    await tick(noonUtc(5));
    const list = (await s.app.inject({ method: 'GET', url: '/v1/gifts', headers: m.auth })).json<GiftsResponse>();
    expect(list.gifts.filter((g) => g.cosmeticId === 'stick-pfote')).toHaveLength(1);
    expect((await botProfiles(m.householdId)).find((p) => p.archetype === 'pfote')!.metCount).toBeGreaterThanOrEqual(3);
  });
});

describe('Viertel-Runde', () => {
  it('goal math: player share from the recent pace, bots capped at 60 % of the goal', () => {
    expect(coopPlayerShareKm([])).toBe(4);
    expect(coopPlayerShareKm([10, 12, 8, 10])).toBeCloseTo(6); // median 10 x 0.6
    expect(coopPlayerShareKm([100, 100, 100])).toBe(12);
    expect(coopPlayerShareKm([1, 1])).toBe(4);
    const capped = coopGoalKm(80, 4);
    expect(capped.botKm / capped.goalKm).toBeCloseTo(0.6);
    expect(capped.goalKm).toBeCloseTo(10);
    const small = coopGoalKm(2, 4);
    expect(small).toEqual({ goalKm: 6, botKm: 2 });
  });

  it('is inactive before W3, then fixes a goal, completes with a yard decoration and announces it once', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 1500 });
    s.setNow(noonUtc(3));
    const w1 = (await s.app.inject({ method: 'GET', url: '/v1/coop/week', headers: m.auth })).json<CoopWeekResponse>();
    expect(w1.active).toBe(false);

    s.setNow(noonUtc(15)); // W3
    const w3 = (await s.app.inject({ method: 'GET', url: '/v1/coop/week', headers: m.auth })).json<CoopWeekResponse>();
    expect(w3).toMatchObject({ active: true, completed: false, rewardId: null, yardDecorations: [] });
    expect(w3.goalKm).toBeGreaterThanOrEqual(NEIGHBOUR_CONFIG.coop.minPlayerKm);
    expect(Object.keys(w3).sort()).toEqual(['active', 'completed', 'goalKm', 'ratio', 'rewardId', 'totalKm', 'weekStart', 'yardDecorations']); // no human/bot split

    // walk far enough in this week
    const start = noonUtc(15) - 3600_000;
    let id = 0;
    let ratio = 0;
    while (ratio < 1 && id < 6) {
      id++;
      await postWalk(m, `walk-coop-${id}0000`, { meters: 5000 }, start - id * 4000_000);
      const g = (await s.app.inject({ method: 'GET', url: '/v1/coop/week', headers: m.auth })).json<CoopWeekResponse>();
      ratio = g.ratio;
    }
    expect(ratio).toBe(1);
    await tick(noonUtc(15));
    const done = (await s.app.inject({ method: 'GET', url: '/v1/coop/week', headers: m.auth })).json<CoopWeekResponse>();
    expect(done.completed).toBe(true);
    expect(done.rewardId).toBe('yard-flowerbed');
    expect(done.yardDecorations).toEqual(['yard-flowerbed']);
    // the announcement obeys the 2-events-a-day cap, so it may wait a day or two (but never repeats)
    for (let n = 15; n <= 20; n++) await tick(noonUtc(n));
    const announcements = (await hostEvents(m.householdId)).filter((e) => e.kind === 'coop.progress');
    expect(announcements).toHaveLength(1);
    expect(announcements[0].emittedSeq).not.toBeNull();
    expect(announcements[0].params).toMatchObject({ km: Math.round(done.goalKm) });
  });

  it('carries a missed week’s human km over as a head start (up to half of the next player share), no loss state', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 1500 });
    const prevWeek = weekStartOf(day(15));
    const lastWeek = addDays(prevWeek, -7);
    await s.db.insert(schema.coopWeeks).values({ hostHouseholdId: m.householdId, weekStart: lastWeek, goalKm: 20, plannedBotKm: 10 });
    // 3 km walked in the missed week
    s.setNow(noonUtc(15));
    await postWalk(m, 'walk-prevweek-1', { meters: 3000 }, localToUtcMs(addDays(lastWeek, 2), 10 * 60, TZ));
    const row = await ensureCoopWeek(s.db, m.householdId, prevWeek, TZ, 3);
    expect(row.carriedKm).toBeGreaterThan(0);
    expect(row.carriedKm).toBeLessThanOrEqual(NEIGHBOUR_CONFIG.coop.carryFraction * 12);
    expect(row.goalKm).toBeGreaterThanOrEqual(NEIGHBOUR_CONFIG.coop.minPlayerKm);
  });
});

describe('nearby', () => {
  it('lists active bots with a capped dotted Range, generated=true and no coordinates', async () => {
    const m = await household();
    await postWalk(m, 'walk-aaaaaaaa-0001', { meters: 1500 });
    const url = 'https://overpass.test/api';
    for (let n = 1; n <= 4; n++) await tick(noonUtc(n), fakeOverpass(), url);
    s.setNow(noonUtc(4));
    const res = (await s.app.inject({ method: 'GET', url: '/v1/nearby?radiusM=10000&include=cells', headers: m.auth })).json<NearbyResponse>();
    expect(res.items.map((i) => i.dogName).sort()).toEqual(['Momo', 'Pfote']); // W1 only
    for (const item of res.items) {
      expect(item).toMatchObject({ kind: 'bot', generated: true });
      expect(item.rangeCells!.length).toBeLessThanOrEqual(NEIGHBOUR_CONFIG.nearby.maxCellsPerBot);
      expect(JSON.stringify(item)).not.toMatch(/lat|home|route/i);
    }
    expect(res.items.find((i) => i.dogName === 'Momo')!.appearance).toMatchObject({ coat: 'cream', earStyle: 'floppy', tailStyle: 'curly' });
    expect(res.items.some((i) => i.rangeCells!.length > 0)).toBe(true);
    const plain = (await s.app.inject({ method: 'GET', url: '/v1/nearby', headers: m.auth })).json<NearbyResponse>();
    expect(plain.items.every((i) => i.rangeCells === undefined)).toBe(true);
    const tiny = (await s.app.inject({ method: 'GET', url: '/v1/nearby?radiusM=1', headers: m.auth })).json<NearbyResponse>();
    expect(tiny.items).toEqual([]);
    expect((await s.app.inject({ method: 'GET', url: '/v1/nearby?radiusM=20000', headers: m.auth })).statusCode).toBe(400);
    expect((await s.app.inject({ method: 'GET', url: '/v1/gifts' })).statusCode).toBe(401);
  });
});

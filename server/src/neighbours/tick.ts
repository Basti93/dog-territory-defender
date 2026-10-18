// The 15-minute tick (design Decision 19): plan the day, write due bot walks, update the Viertel-Runde, emit due
// events into the normal `events` feed. Each host is handled in its own short transaction behind a Postgres
// advisory lock, so a second api instance (not planned) could never double-run a host.
import { and, asc, desc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import { cellForLocation, paintedCells, parseCellKey } from '@game/utils/grid';
import type { Location } from '@game/types';
import type { NeighbourEventPayload, NeighbourLineKey } from '@game/sync/apiContract';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { botProfiles, botSchedules, cells, coopWeeks, households, neighbourEvents, walks } from '../db/schema';
import { addDays, dayKeyInZone, localMinutesOfDay } from '../lib/time';
import { paintCells } from '../services/cellPaint';
import { appendEvent, type EventBus } from '../services/events';
import { lockDen } from '../services/state';
import { ARCHETYPE_BY_ID, LINE_BY_KEY, type ArchetypeId } from './archetypes';
import { hostAnchor, profilesOf } from './bots';
import { updateCoop } from './coop';
import { generateLoop, generateOffsetRoute, resample } from './generator';
import { createGift } from './gifts';
import { distanceM, type LatLng } from './geo';
import { nearestNode } from './graph';
import { canPlan, planDay, recentEventRows, walkDurationMs } from './planner';
import { hashSeed, makeRng } from './rng';
import { ensureTiles, isQuietFetchHour, loadGraphAround, tilesAround, type OverpassDeps } from './streetTiles';

type NeighbourKind = 'neighbour.sniffed' | 'neighbour.gift' | 'neighbour.reaction' | 'neighbour.invitation' | 'coop.progress';

const SCHED = NEIGHBOUR_CONFIG.scheduler;
const GEO = NEIGHBOUR_CONFIG.geo;
/** Constant key for pg_try_advisory_xact_lock. */
const ADVISORY_KEY = 7_204_001;
const STALE_WALK_MS = 3 * 24 * 3600_000;

export interface TickDeps {
  db: Db;
  bus: EventBus;
  config: Config;
  now: number;
  /** Test hook for Overpass. */
  fetchImpl?: typeof fetch;
}

export interface TickResult {
  hosts: number;
  walksWritten: number;
  eventsEmitted: number;
  tilesFetched: number;
}

const overpassOf = (deps: TickDeps): OverpassDeps => ({
  url: deps.config.neighbours.overpassUrl,
  fetchImpl: deps.fetchImpl,
  pauseMs: deps.config.neighbours.overpassPauseMs,
});

/** One scheduler pass over every host that has neighbours. */
export async function runTick(deps: TickDeps): Promise<TickResult> {
  const result: TickResult = { hosts: 0, walksWritten: 0, eventsEmitted: 0, tilesFetched: 0 };
  if (!deps.config.neighbours.enabled) return result;
  const hostRows = await deps.db.selectDistinct({ id: botProfiles.hostHouseholdId }).from(botProfiles);
  let tileBudget = SCHED.maxTilesPerTick;
  for (const { id: hostId } of hostRows) {
    result.hosts++;
    // Street tiles first (network), outside any transaction. Never in the quiet hours, one at a time.
    const [host] = await deps.db.select({ tz: households.timezone }).from(households).where(eq(households.id, hostId));
    if (tileBudget > 0 && !isQuietFetchHour(deps.now, host.tz)) {
      const profiles = await profilesOf(deps.db, hostId);
      const ids = Array.from(new Set(profiles.flatMap((p) => tilesAround([p.homeLat, p.homeLng], 2200))));
      const fetched = await ensureTiles(deps.db, overpassOf(deps), ids, deps.now, tileBudget);
      tileBudget -= fetched;
      result.tilesFetched += fetched;
    }
    try {
      const r = await deps.db.transaction(async (tx) => {
        const dbx = tx as unknown as Db;
        // postgres.js returns rows as an array, PGlite as { rows }
        const res = (await dbx.execute(sql`select pg_try_advisory_xact_lock(${ADVISORY_KEY}) as locked`)) as unknown as
          | Array<{ locked: boolean }>
          | { rows: Array<{ locked: boolean }> };
        if (!(Array.isArray(res) ? res : res.rows)[0]?.locked) return null;
        return tickHost(dbx, deps, hostId);
      });
      if (r) {
        result.walksWritten += r.walks;
        result.eventsEmitted += r.events;
        if (r.events > 0) deps.bus.notify(hostId);
      }
    } catch (err) {
      // One broken host must not stop the others; the next tick retries (everything is idempotent).
      console.error('neighbour tick failed for a host:', err instanceof Error ? err.message : err);
    }
  }
  return result;
}

async function tickHost(dbx: Db, deps: TickDeps, hostId: string): Promise<{ walks: number; events: number }> {
  const [host] = await dbx.select().from(households).where(eq(households.id, hostId));
  const tz = host.timezone;
  const today = dayKeyInZone(deps.now, tz);

  // 1) plan: catch up the last days; today only once it is 06:15 locally
  const plannerMinute = SCHED.plannerLocalHour * 60 + SCHED.plannerLocalMinute;
  const plannable = localMinutesOfDay(deps.now, tz) >= plannerMinute;
  for (let back = SCHED.catchUpDays - 1; back >= 0; back--) {
    if (back === 0 && !plannable) continue;
    await planDay(dbx, hostId, addDays(today, -back));
  }

  // 2) due bot walks
  const walksWritten = await materialiseDueWalks(dbx, hostId, tz, deps.now);

  // 3) Viertel-Runde: progress, completion, one announcement (respects the daily event cap)
  const coop = await updateCoop(dbx, hostId, deps.now);
  if (coop?.completedAt && !coop.announcedAt) {
    const rows = await recentEventRows(dbx, hostId, today);
    const def = LINE_BY_KEY['neighbours.line.coopDone'];
    if (canPlan(rows, def, today)) {
      await dbx
        .insert(neighbourEvents)
        .values({
          hostHouseholdId: hostId,
          botHouseholdId: null,
          kind: def.kind,
          lineKey: def.key,
          params: { km: Math.round(coop.goalKm) },
          day: today,
          slotKey: `coop-${coop.weekStart}`,
          dueAt: deps.now,
        })
        .onConflictDoNothing();
      await dbx.update(coopWeeks).set({ announcedAt: deps.now }).where(and(eq(coopWeeks.hostHouseholdId, hostId), eq(coopWeeks.weekStart, coop.weekStart)));
    }
  }

  // 4) due events -> the events feed
  const events = await emitDueEvents(dbx, hostId, deps.now);
  return { walks: walksWritten, events };
}

// ------------------------------------------------------------------ materialise

async function hostRangeSet(dbx: Db, hostId: string): Promise<Set<string>> {
  const rows = await dbx.select({ ix: cells.ix, iy: cells.iy }).from(cells).where(and(eq(cells.householdId, hostId), eq(cells.generated, false)));
  return new Set(rows.map((r) => `${r.ix},${r.iy}`));
}

async function hostRoutes(dbx: Db, hostId: string): Promise<LatLng[][]> {
  const rows = await dbx
    .select({ route: walks.route })
    .from(walks)
    .where(and(eq(walks.householdId, hostId), eq(walks.generated, false), eq(walks.startSource, 'button'), isNull(walks.deletedAt)))
    .orderBy(desc(walks.startTime))
    .limit(10);
  return rows.map((r) => (r.route as Location[]).filter((_, i) => i % 3 === 0).map((l) => [l.latitude, l.longitude] as LatLng));
}

async function materialiseDueWalks(dbx: Db, hostId: string, tz: string, now: number): Promise<number> {
  // Cheap pre-filter: planned_start has begun. The precise end time is checked per walk below.
  const due = await dbx
    .select()
    .from(botSchedules)
    .where(and(eq(botSchedules.hostHouseholdId, hostId), eq(botSchedules.status, 'planned'), lte(botSchedules.plannedStart, now)))
    .orderBy(asc(botSchedules.plannedStart));
  if (due.length === 0) return 0;
  const profiles = new Map((await profilesOf(dbx, hostId)).map((p) => [p.householdId, p] as const));
  const anchor = await hostAnchor(dbx, hostId);
  if (!anchor) return 0;
  const range = await hostRangeSet(dbx, hostId);
  const routes = await hostRoutes(dbx, hostId);
  let written = 0;
  for (const s of due) {
    const bot = profiles.get(s.householdId);
    if (!bot) continue;
    const a = ARCHETYPE_BY_ID[bot.archetype as ArchetypeId];
    if (s.plannedStart + walkDurationMs(s.targetM, a.speedMs) > now) continue; // not finished yet: nothing is drawn ahead of the clock
    if (now - s.plannedStart > STALE_WALK_MS) {
      await dbx.update(botSchedules).set({ status: 'skipped' }).where(eq(botSchedules.id, s.id));
      continue;
    }
    const isReaction = s.slot.startsWith('reaction-');
    const excluded = (p: LatLng) => {
      if (distanceM(p, anchor) <= GEO.homeBlockRadiusM) return true; // the home block, always
      if (isReaction) return false; // reaction walks may visit the new ground
      const c = cellForLocation(p[0], p[1]);
      return range.has(`${c.ix},${c.iy}`); // ordinary walks stay off the real Range
    };
    const rng = makeRng(hashSeed(bot.seed, s.day, s.slot));
    let points: LatLng[] | null = null;
    let generator: 'osm' | 'offset' = 'osm';

    const graph = await loadGraphAround(dbx, [bot.homeLat, bot.homeLng], 2200);
    const homeNode = graph.adj.size ? nearestNode(graph, [bot.homeLat, bot.homeLng], (id) => !excluded(graph.nodes.get(id)!)) : null;
    if (homeNode && homeNode.distM <= 400) {
      const loop = generateLoop({
        graph,
        homeNode: homeNode.id,
        targetM: s.targetM,
        rng,
        excluded,
        via: s.via ? ([(s.via as number[])[0], (s.via as number[])[1]] as LatLng) : undefined,
      });
      if (loop) {
        points = loop.points;
        const snapped = graph.nodes.get(homeNode.id)!;
        if (snapped[0] !== bot.homeLat || snapped[1] !== bot.homeLng) {
          await dbx.update(botProfiles).set({ homeLat: snapped[0], homeLng: snapped[1] }).where(eq(botProfiles.householdId, bot.householdId));
          bot.homeLat = snapped[0];
          bot.homeLng = snapped[1];
        }
      }
    }
    if (!points) {
      generator = 'offset';
      points = generateOffsetRoute(routes, s.targetM, rng, excluded)?.points ?? null;
    }
    if (!points) {
      await dbx.update(botSchedules).set({ status: 'skipped' }).where(eq(botSchedules.id, s.id)); // a missing walk is invisible, a bad one is not
      continue;
    }

    const locations = resample(points, s.plannedStart, a.speedMs, rng);
    const walkEnd = locations[locations.length - 1].timestamp;
    if (walkEnd > now) continue; // slower than planned: try again next tick
    const distanceMeters = Math.round(points.reduce((sum, p, i) => (i ? sum + distanceM(points![i - 1], p) : 0), 0));
    const walkId = `gen-${s.id}`;
    await dbx.insert(walks).values({
      householdId: bot.householdId,
      id: walkId,
      playerId: null,
      startTime: s.plannedStart,
      startSource: 'button',
      route: locations,
      closed: true,
      newGroundCellIds: [],
      treatsEarned: null,
      reward: {},
      generated: true,
    });
    // The SAME paint + merge code as human walks, into the BOT household only.
    await paintCells(
      dbx,
      bot.householdId,
      Array.from(paintedCells(locations)).map((id) => {
        const { ix, iy } = parseCellKey(id);
        return [ix, iy, null] as [number, number, string | null];
      }),
      dayKeyInZone(s.plannedStart, tz),
      walkEnd,
      true
    );
    await dbx.update(botSchedules).set({ status: 'done', walkId, generator, distanceM: distanceMeters }).where(eq(botSchedules.id, s.id));
    written++;
  }
  return written;
}

// ------------------------------------------------------------------ emit

async function emitDueEvents(dbx: Db, hostId: string, now: number): Promise<number> {
  const due = await dbx
    .select()
    .from(neighbourEvents)
    .where(and(eq(neighbourEvents.hostHouseholdId, hostId), isNull(neighbourEvents.emittedSeq), lte(neighbourEvents.dueAt, now)))
    .orderBy(asc(neighbourEvents.dueAt), asc(neighbourEvents.slotKey));
  if (due.length === 0) return 0;
  // Same den lock as walks/commands: keeps events.seq monotonic per household.
  await lockDen(dbx, hostId);
  const profiles = new Map((await profilesOf(dbx, hostId)).map((p) => [p.householdId, p] as const));
  let emitted = 0;
  for (const ev of due) {
    const bot = ev.botHouseholdId ? profiles.get(ev.botHouseholdId) : undefined;
    const def = LINE_BY_KEY[ev.lineKey];
    if (!def) continue;
    const payload: NeighbourEventPayload = {
      botName: bot?.name ?? null,
      botId: bot?.householdId ?? null,
      line: ev.lineKey as NeighbourLineKey,
      params: ev.params as Record<string, string | number>,
    };
    if (ev.kind === 'neighbour.reaction' && Array.isArray((ev.params as { pawCells?: unknown }).pawCells)) {
      const { pawCells, ...rest } = ev.params as { pawCells: Array<{ ix: number; iy: number }> } & Record<string, string | number>;
      payload.params = rest;
      payload.pawCells = pawCells;
    }
    if (bot) {
      // "Met" = a distinct day on which this dog's event was emitted.
      const [{ n }] = await dbx
        .select({ n: sql<number>`count(*)::int` })
        .from(neighbourEvents)
        .where(and(eq(neighbourEvents.botHouseholdId, bot.householdId), eq(neighbourEvents.day, ev.day), isNotNull(neighbourEvents.emittedSeq)));
      if (n === 0) {
        bot.metCount += 1;
        await dbx.update(botProfiles).set({ metCount: bot.metCount }).where(eq(botProfiles.householdId, bot.householdId));
      }
    }
    if (ev.kind === 'neighbour.gift' && bot) {
      const exclusiveDue = bot.metCount >= NEIGHBOUR_CONFIG.gifts.metCountForExclusive && bot.exclusiveGiftSentAt === null;
      const gift = await createGift(dbx, hostId, bot, def, ev.day, now, exclusiveDue);
      if (exclusiveDue && gift.cosmeticId) {
        bot.exclusiveGiftSentAt = now;
        await dbx.update(botProfiles).set({ exclusiveGiftSentAt: now }).where(eq(botProfiles.householdId, bot.householdId));
      }
      payload.giftId = gift.id;
    }
    const seq = await appendEvent(dbx, hostId, ev.kind as NeighbourKind, null, payload);
    await dbx.update(neighbourEvents).set({ emittedSeq: seq }).where(eq(neighbourEvents.id, ev.id));
    emitted++;
  }
  return emitted;
}

// Walk ingest: the one place a tracked walk becomes cells + territories + reward on the server.
// Mirrors src/app/finishTrackedWalk.ts using the shared pure functions (design Decisions 1, 3, 6).
import { and, between, eq, isNull, sql } from 'drizzle-orm';
import { MIN_CELLS_FOR_REWARD, newGroundCells, paintedCells, parseCellKey } from '@game/utils/grid';
import { walkDistanceMeters } from '@game/utils/geometry';
import { bloomMultiplier, manualLogBloomMultiplier } from '@game/economy/formulas';
import { BALANCE } from '@game/economy/balanceConfig';
import type { Location } from '@game/types';
import { confirmPromotions, findPromotionCandidates, homeCentreCell, resolveCelebrationTerritoryBeat, resolveTerritoryChanges } from '@game/utils/territoryCluster';
import { generateTerritoryId } from '@game/storage/TerritoryRepository';
import type { Cell } from '@game/storage/HomeRangeRepository';
import type {
  ApiCell,
  ApiWalkFull,
  WalkRejectedReason,
  WalkReward,
  WalkUploadRequest,
  WalkUploadResponse,
} from '@game/sync/apiContract';
import { API_LIMITS } from '@game/sync/apiContract';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { cells, households, territories, walks } from '../db/schema';
import { applyPassiveAccrual, awardWalkTreats, awardWalkXp, dailyRewardMultiplier } from '../economy/denTransitions';
import { dayKeyInZone, sameLocalDay } from '../lib/time';
import { onHostWalkAccepted } from '../neighbours/reactions';
import { paintCells } from './cellPaint';
import { appendEvent, currentSeq, type EventBus } from './events';
import { endPresenceForWalk, presenceChannel } from './presence';
import { cellFromRow, denFromRow, lockDen, saveDen, stripRev, territoryFromRow, walkMetaFromRow } from './state';

export interface AuthCtx {
  householdId: string;
  playerId: string;
  deviceId: string;
}

export type WalkResult =
  | { kind: 'ok'; response: WalkUploadResponse }
  | { kind: 'rejected'; reason: WalkRejectedReason }
  | { kind: 'capped' };

const DEFAULT_TERRITORY_NAME = 'New territory';

function cleanName(raw: string | undefined): string {
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, API_LIMITS.maxTerritoryNameLength);
  return trimmed.length > 0 ? trimmed : DEFAULT_TERRITORY_NAME;
}

export async function ingestWalk(
  db: Db,
  bus: EventBus,
  config: Config,
  auth: AuthCtx,
  req: WalkUploadRequest,
  now: number
): Promise<WalkResult> {
  const result = await db.transaction(async (tx): Promise<WalkResult> => {
    const dbx = tx as unknown as Db;
    const hid = auth.householdId;
    const denRow = await lockDen(dbx, hid); // serialises this household

    const [existing] = await dbx.select().from(walks).where(and(eq(walks.householdId, hid), eq(walks.id, req.id)));
    if (existing) {
      return {
        kind: 'ok',
        response: {
          walkId: existing.id,
          duplicate: true,
          reward: existing.reward as WalkReward,
          den: denFromRow(denRow),
          serverTime: now,
          seq: await currentSeq(dbx, hid),
        },
      };
    }

    // A manual log ("Log a walk we missed") has no route by definition; a tracked walk must have one.
    const isManual = req.startSource === 'manual-log';
    if (isManual && req.locations.length > 0) return { kind: 'rejected', reason: 'unsupported-source' };
    if (!isManual && req.locations.length === 0) return { kind: 'rejected', reason: 'no-locations' };
    if (req.startTime > now + API_LIMITS.maxWalkFutureSkewMs) return { kind: 'rejected', reason: 'start-in-future' };
    if (req.startTime < now - API_LIMITS.maxWalkAgeMs) return { kind: 'rejected', reason: 'too-old' };

    const [household] = await dbx.select().from(households).where(eq(households.id, hid));
    const tz = household.timezone;

    // Daily cap counts the household-local calendar day (same day key as the reward multiplier).
    const [{ recent }] = await dbx
      .select({ recent: sql<number>`count(*)::int` })
      .from(walks)
      .where(and(eq(walks.householdId, hid), sameLocalDay(walks.createdAt, tz, now)));
    if (recent >= config.limits.walksPerDayPerHousehold) return { kind: 'capped' };

    // ---- manual-log quota, household-wide (src/economy/balanceConfig.ts freshGround; the app enforces
    // the same per device in denEconomy.ts evaluateManualLogQuota). Counted by the day the server
    // received the log, because a manual log's startTime is only "today" or "yesterday". Soft-deleted
    // logs still count: deleting a walk must not hand out a fresh quota.
    // Over-quota is a permanent 422: the phone has already paid out its local copy, and the shared Den
    // state that comes back in the next pull silently corrects the balance.
    let refreshRoute: Location[] | null = null;
    if (isManual) {
      const [{ logsToday }] = await dbx
        .select({ logsToday: sql<number>`count(*)::int` })
        .from(walks)
        .where(and(eq(walks.householdId, hid), eq(walks.startSource, 'manual-log'), sameLocalDay(walks.createdAt, tz, now)));
      if (logsToday >= BALANCE.freshGround.maxManualLogsPerDay) return { kind: 'rejected', reason: 'manual-log-quota' };

      if (req.refreshRouteWalkId) {
        const [{ refreshesToday }] = await dbx
          .select({ refreshesToday: sql<number>`count(*)::int` })
          .from(walks)
          .where(
            and(
              eq(walks.householdId, hid),
              eq(walks.startSource, 'manual-log'),
              sql`${walks.reward}->>'routeRefreshed' = 'true'`,
              sameLocalDay(walks.createdAt, tz, now)
            )
          );
        if (refreshesToday < BALANCE.freshGround.maxRouteRefreshesPerDay) {
          const [routeWalk] = await dbx
            .select({ route: walks.route })
            .from(walks)
            .where(
              and(
                eq(walks.householdId, hid),
                eq(walks.id, req.refreshRouteWalkId),
                eq(walks.startSource, 'button'),
                isNull(walks.deletedAt)
              )
            );
          const route = (routeWalk?.route ?? []) as Location[];
          if (paintedCells(route).size > 0) refreshRoute = route;
        }
      }
    }

    // ---- compute from the route and the server's own cell state
    // A manual log paints nothing and always earns (identical to the app: closed, 0 distance, 0 cells).
    const painted = isManual ? new Set<string>() : paintedCells(req.locations);
    const qualifies = isManual || painted.size >= MIN_CELLS_FOR_REWARD;
    const distanceMeters = walkDistanceMeters({ startTime: req.startTime, locations: req.locations });
    const rangeRows = await dbx.select().from(cells).where(and(eq(cells.householdId, hid), eq(cells.generated, false)));
    const rangeBefore: Cell[] = rangeRows.map((r) => ({
      ix: r.ix,
      iy: r.iy,
      lastRefreshed: r.lastRefreshed,
      lastTracked: r.lastTracked,
      visits: r.visits,
      territoryId: r.territoryId,
    }));
    const rangeSet = new Set(rangeRows.map((r) => `${r.ix},${r.iy}`));
    const lastRefreshed = new Map(rangeRows.map((r) => [`${r.ix},${r.iy}`, r.lastRefreshed] as const));
    const newGround = newGroundCells(painted, rangeSet);
    const bloom = isManual ? (refreshRoute ? manualLogBloomMultiplier() : 1) : bloomMultiplier(painted, lastRefreshed, now);

    // Cell timestamps come from the walk itself, never the receive time: keeps the merge order-independent.
    let walkEnd = req.startTime;
    for (const l of req.locations) if (l.timestamp > walkEnd) walkEnd = l.timestamp;
    walkEnd = Math.min(walkEnd, now + API_LIMITS.maxWalkFutureSkewMs);
    const day = dayKeyInZone(req.startTime, tz);

    const sameDayCandidates = await dbx
      .select({ startTime: walks.startTime })
      .from(walks)
      .where(
        and(
          eq(walks.householdId, hid),
          eq(walks.closed, true),
          isNull(walks.deletedAt),
          between(walks.startTime, req.startTime - 36 * 3600 * 1000, req.startTime + 36 * 3600 * 1000)
        )
      );
    const walkOrderToday = sameDayCandidates.filter((w) => dayKeyInZone(w.startTime, tz) === day).length + 1;
    const dailyMultiplier = dailyRewardMultiplier(walkOrderToday);

    // ---- territories (server-authoritative; the client only supplies a name hint)
    const existingTerritories = await dbx.select().from(territories).where(eq(territories.householdId, hid));
    const territoryNames = new Map(existingTerritories.map((t) => [t.id, t.name] as const));
    let creditedTerritoryId: string | null = null;
    let newTerritoryName: string | null = null;
    let newTerritoryId: string | null = null;
    let homeCentre: ReturnType<typeof homeCentreCell> = null;
    let mergedTerritoryNames: [string, string] | null = null;
    const assignment = new Map<string, string>();
    const reassigned: Array<{ from: string; to: string }> = [];
    const touchedTerritoryIds = new Set<string>();
    const removedTerritoryIds: string[] = [];
    let merges: Array<{ survivorId: string; loserId: string }> = [];

    if (painted.size > 0) {
      // Home = where the first tracked walks started (only each walk's first fix is read); this walk counts too.
      const startRows = await dbx
        .select({ id: walks.id, startTime: walks.startTime, first: sql<Location | null>`${walks.route}->0` })
        .from(walks)
        .where(and(eq(walks.householdId, hid), eq(walks.startSource, 'button'), eq(walks.generated, false)));
      homeCentre = homeCentreCell([
        ...startRows.filter((r) => r.first).map((r) => ({ id: r.id, startTime: r.startTime, startSource: 'button' as const, locations: [r.first as Location] })),
        { id: req.id, startTime: req.startTime, startSource: req.startSource, locations: req.locations.slice(0, 1) },
      ]);
      const plan = resolveTerritoryChanges(
        rangeBefore,
        painted,
        now,
        new Map(existingTerritories.map((t) => [t.id, t.createdAt] as const)),
        homeCentre
      );
      const provisionalToReal = new Map<string, string>();
      // Only the household's very first territory is born here; later ones are promotions (below).
      for (const birth of plan.births) {
        const realId = generateTerritoryId(now);
        const name = cleanName(req.territoryNameHint);
        provisionalToReal.set(birth.provisionalId, realId);
        territoryNames.set(realId, name);
        await dbx.insert(territories).values({ householdId: hid, id: realId, name, createdAt: now });
        touchedTerritoryIds.add(realId);
      }
      const real = (id: string) => provisionalToReal.get(id) ?? id;
      for (const [cellId, id] of plan.newCellAssignments) assignment.set(cellId, real(id));
      creditedTerritoryId = real(plan.creditedTerritoryId) || null;
      mergedTerritoryNames = resolveCelebrationTerritoryBeat(plan, null, territoryNames).mergedTerritoryNames;
      merges = plan.merges;
    }

    // ---- paint cells: day-set union, then visits = baseline + distinct days (design Decision 3)
    let touchedCells: ApiCell[] = [];
    if (painted.size > 0) {
      const cellsJson = JSON.stringify(
        Array.from(painted).map((id) => {
          const { ix, iy } = parseCellKey(id);
          return [ix, iy, assignment.get(id) ?? null];
        })
      );
      await paintCells(
        dbx,
        hid,
        Array.from(painted).map((id) => {
          const { ix, iy } = parseCellKey(id);
          return [ix, iy, assignment.get(id) ?? null] as [number, number, string | null];
        }),
        day,
        walkEnd
      );

      // merges run after the new cells exist, as in finishTrackedWalk
      for (const merge of merges) {
        await dbx.execute(sql`
          update cells set territory_id = ${merge.survivorId}
          where household_id = ${hid}::uuid and territory_id = ${merge.loserId}`);
        const [loser] = await dbx
          .select()
          .from(territories)
          .where(and(eq(territories.householdId, hid), eq(territories.id, merge.loserId)));
        if (loser) {
          await dbx
            .update(territories)
            .set({
              walksHere: sql`${territories.walksHere} + ${loser.walksHere}`,
              treatsEarnedHere: sql`${territories.treatsEarnedHere} + ${loser.treatsEarnedHere}`,
            })
            .where(and(eq(territories.householdId, hid), eq(territories.id, merge.survivorId)));
          await dbx.delete(territories).where(and(eq(territories.householdId, hid), eq(territories.id, merge.loserId)));
        }
        reassigned.push({ from: merge.loserId, to: merge.survivorId });
        touchedTerritoryIds.add(merge.survivorId);
        removedTerritoryIds.push(merge.loserId);
        touchedTerritoryIds.delete(merge.loserId);
        if (creditedTerritoryId === merge.loserId) creditedTerritoryId = merge.survivorId;
      }

      // ---- promotion: a far patch walked on 2+ walks with 40+ cells becomes a territory of its own
      const territoryCreatedAtNow = new Map(
        (await dbx.select().from(territories).where(eq(territories.householdId, hid))).map((t) => [t.id, t.createdAt] as const)
      );
      const afterRows = await dbx.select().from(cells).where(and(eq(cells.householdId, hid), eq(cells.generated, false)));
      const candidates = findPromotionCandidates(
        afterRows.map((r) => ({ ix: r.ix, iy: r.iy, lastRefreshed: r.lastRefreshed, lastTracked: r.lastTracked, visits: r.visits, territoryId: r.territoryId })),
        territoryCreatedAtNow,
        painted,
        homeCentre
      );
      if (candidates.length > 0) {
        const earlierRoutes = await dbx
          .select({ route: walks.route })
          .from(walks)
          .where(and(eq(walks.householdId, hid), eq(walks.generated, false), isNull(walks.deletedAt), sql`${walks.startSource} <> 'manual-log'`));
        const earlier = earlierRoutes.map((w) => paintedCells((w.route ?? []) as Location[]));
        const [promotion] = confirmPromotions(candidates, painted, earlier);
        if (promotion) {
          const promotedId = generateTerritoryId(now);
          const promotedName = cleanName(req.territoryNameHint);
          await dbx.insert(territories).values({ householdId: hid, id: promotedId, name: promotedName, createdAt: now, walksHere: promotion.walks });
          const promotedJson = JSON.stringify(promotion.cellIds.map((id) => parseCellKey(id)).map(({ ix, iy }) => [ix, iy]));
          await dbx.execute(sql`
            update cells c set territory_id = ${promotedId}
            from jsonb_array_elements(${promotedJson}::jsonb) e
            where c.household_id = ${hid}::uuid and c.ix = (e->>0)::int and c.iy = (e->>1)::int`);
          touchedTerritoryIds.add(promotedId);
          newTerritoryName = promotedName;
          newTerritoryId = promotedId;
        }
      }

      touchedCells = (
        await dbx
          .select()
          .from(cells)
          .where(
            and(
              eq(cells.householdId, hid),
              sql`(${cells.ix}, ${cells.iy}) in (select (e->>0)::int, (e->>1)::int from jsonb_array_elements(${cellsJson}::jsonb) e)`
            )
          )
      ).map(cellFromRow);
    }

    // ---- Den reward (same sequence as awardWalkRewards: treats first, then XP)
    let denApi = denFromRow(denRow);
    let treatsEarned = 0;
    let xpEarned = 0;
    let leveledUpTo: number | null = null;
    if (qualifies) {
      // accrual uses the world mass from BEFORE this walk's paint
      const mass = { cellCount: rangeRows.length, visitsSum: rangeRows.reduce((s, r) => s + r.visits, 0) };
      const accrued = applyPassiveAccrual(stripRev(denApi), now, mass);
      const treats = awardWalkTreats(accrued, dailyMultiplier, bloom);
      treatsEarned = treats.treatsAwarded;
      const xp = awardWalkXp(treats.state, distanceMeters, painted.size, dailyMultiplier);
      xpEarned = xp.xpGained;
      leveledUpTo = xp.leveledUp ? xp.state.level : null;
      denApi = await saveDen(dbx, hid, denRow.rev, xp.state, now);
    }

    // ---- manual-log route refresh: freshness only (lastRefreshed), never lastTracked, no new cells,
    // no visits, no territory change. Only cells the Range already has; household-wide like all cells.
    if (refreshRoute) {
      const refreshJson = JSON.stringify(
        Array.from(paintedCells(refreshRoute)).map((id) => {
          const { ix, iy } = parseCellKey(id);
          return [ix, iy];
        })
      );
      await dbx.execute(sql`
        update cells c set last_refreshed = greatest(c.last_refreshed, ${now}::bigint)
        from jsonb_array_elements(${refreshJson}::jsonb) e
        where c.household_id = ${hid}::uuid and c.ix = (e->>0)::int and c.iy = (e->>1)::int`);
      touchedCells = (
        await dbx
          .select()
          .from(cells)
          .where(
            and(
              eq(cells.householdId, hid),
              sql`(${cells.ix}, ${cells.iy}) in (select (e->>0)::int, (e->>1)::int from jsonb_array_elements(${refreshJson}::jsonb) e)`
            )
          )
      ).map(cellFromRow);
    }

    if (creditedTerritoryId) {
      await dbx
        .update(territories)
        .set({
          walksHere: sql`${territories.walksHere} + 1`,
          treatsEarnedHere: sql`${territories.treatsEarnedHere} + ${treatsEarned}`,
        })
        .where(and(eq(territories.householdId, hid), eq(territories.id, creditedTerritoryId)));
      touchedTerritoryIds.add(creditedTerritoryId);
    }

    const reward: WalkReward = {
      qualifies,
      cellsPainted: painted.size,
      newGroundCellCount: newGround.size,
      bloomMultiplier: bloom,
      walkOrderToday,
      dailyMultiplier,
      treatsEarned,
      xpEarned,
      leveledUpTo,
      territoryId: creditedTerritoryId,
      newTerritoryName,
      ...(newTerritoryId ? { newTerritoryId } : {}),
      mergedTerritoryNames,
      ...(isManual ? { routeRefreshed: refreshRoute !== null } : {}),
    };

    const [stored] = await dbx
      .insert(walks)
      .values({
        householdId: hid,
        id: req.id,
        playerId: auth.playerId,
        startTime: req.startTime,
        startSource: req.startSource,
        route: req.locations,
        closed: qualifies,
        newGroundCellIds: Array.from(newGround),
        treatsEarned: qualifies ? treatsEarned : null,
        reward,
        createdAt: new Date(now), // the quota queries compare created_at with `now`; the DB clock would break tests with a fixed clock
      })
      .returning();

    // The upload proves the walk is over: close its live presence even if the `ended` heartbeat never arrived.
    await endPresenceForWalk(dbx, auth.playerId, req.id, now);

    // ---- change feed
    const { route: _route, ...meta } = stored;
    await appendEvent(dbx, hid, 'walk.added', auth.playerId, { walk: walkMetaFromRow(meta), cellsPainted: painted.size });
    if (touchedCells.length > 0 || reassigned.length > 0) {
      await appendEvent(dbx, hid, 'cells.changed', auth.playerId, { cells: touchedCells, reassigned });
    }
    if (touchedTerritoryIds.size > 0 || removedTerritoryIds.length > 0) {
      const upserted = (await dbx.select().from(territories).where(eq(territories.householdId, hid)))
        .filter((t) => touchedTerritoryIds.has(t.id))
        .map(territoryFromRow);
      await appendEvent(dbx, hid, 'territory.changed', auth.playerId, { upserted, removedIds: removedTerritoryIds });
    }
    if (qualifies) await appendEvent(dbx, hid, 'den.updated', auth.playerId, { den: denApi });

    // Track B: first tracked walk creates the neighbours; new ground may trigger a reaction walk. Never fails the walk.
    await onHostWalkAccepted(dbx, config, {
      hostId: hid,
      walkId: req.id,
      startSource: req.startSource,
      qualifies,
      newGroundCellIds: Array.from(newGround),
      now,
    });

    return {
      kind: 'ok',
      response: { walkId: req.id, duplicate: false, reward, den: denApi, serverTime: now, seq: await currentSeq(dbx, hid) },
    };
  });

  if (result.kind === 'ok' && !result.response.duplicate) {
    bus.notify(auth.householdId);
    bus.notify(presenceChannel(auth.householdId));
  }
  return result;
}

export async function getWalk(db: Db, householdId: string, walkId: string): Promise<ApiWalkFull | null> {
  const [row] = await db.select().from(walks).where(and(eq(walks.householdId, householdId), eq(walks.id, walkId)));
  if (!row) return null;
  const { route, ...meta } = row;
  return { ...walkMetaFromRow(meta), locations: route as ApiWalkFull['locations'] };
}

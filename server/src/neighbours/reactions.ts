// Hook called by walk ingest (design Decisions 17, 19): creates the neighbours on the first accepted tracked walk and
// schedules a reaction walk for about 1 in 3 walks that found new ground.
import { eq } from 'drizzle-orm';
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import { cellCentre, NEW_GROUND_MIN_CELLS, parseCellKey } from '@game/utils/grid';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { botSchedules, households, neighbourEvents } from '../db/schema';
import { dayKeyInZone } from '../lib/time';
import { ARCHETYPE_BY_ID, LINE_BY_KEY } from './archetypes';
import { ensureBots, hostAnchor, profilesOf } from './bots';
import { distanceM, type LatLng } from './geo';
import { canPlan, recentEventRows, walkDurationMs } from './planner';
import { hashSeed, makeRng } from './rng';

const REACTION_TARGET_M = 1800;

export interface AcceptedWalk {
  hostId: string;
  walkId: string;
  startSource: 'button' | 'manual-log';
  qualifies: boolean;
  newGroundCellIds: string[];
  now: number;
}

/** Best effort and isolated in a savepoint: a neighbour problem must never fail a real walk upload. */
export async function onHostWalkAccepted(dbx: Db, config: Config, walk: AcceptedWalk): Promise<void> {
  if (!config.neighbours.enabled || walk.startSource !== 'button' || !walk.qualifies) return;
  try {
    await dbx.transaction(async (tx) => {
      const sp = tx as unknown as Db;
      if (await ensureBots(sp, walk.hostId, walk.now)) return; // brand-new neighbours: their first day is tomorrow
      await maybeScheduleReaction(sp, walk);
    });
  } catch (err) {
    console.error('neighbour hook failed:', err instanceof Error ? err.message : err);
  }
}

async function maybeScheduleReaction(dbx: Db, walk: AcceptedWalk): Promise<void> {
  if (walk.newGroundCellIds.length < NEW_GROUND_MIN_CELLS) return;
  if (hashSeed(walk.walkId) % NEIGHBOUR_CONFIG.reactionOneInN !== 0) return;
  const profiles = await profilesOf(dbx, walk.hostId);
  const momo = profiles.find((p) => p.archetype === 'momo');
  const anchor = await hostAnchor(dbx, walk.hostId);
  if (!momo || !anchor) return;
  const [host] = await dbx.select({ tz: households.timezone }).from(households).where(eq(households.id, walk.hostId));
  const rng = makeRng(hashSeed(walk.walkId, 'reaction'));
  const { min, max } = NEIGHBOUR_CONFIG.reactionDelayHours;
  const dueAt = walk.now + Math.round(rng.range(min, max) * 3600_000);
  const dueDay = dayKeyInZone(dueAt, host.tz);
  const def = LINE_BY_KEY['neighbours.line.followedPath'];
  if (!canPlan(await recentEventRows(dbx, walk.hostId, dueDay), def, dueDay)) return;

  // new ground away from the home block, in a stable order
  const spots = [...walk.newGroundCellIds].sort().filter((id) => {
    const { ix, iy } = parseCellKey(id);
    return distanceM(cellCentre(ix, iy) as LatLng, anchor) > NEIGHBOUR_CONFIG.geo.homeBlockRadiusM + 50;
  });
  if (spots.length === 0) return;
  const via = cellCentre(...(Object.values(parseCellKey(spots[rng.int(0, spots.length - 1)])) as [number, number]));
  const paws = spots
    .filter((_, i) => i % Math.max(1, Math.ceil(spots.length / NEIGHBOUR_CONFIG.maxPawCells)) === 0)
    .slice(0, NEIGHBOUR_CONFIG.maxPawCells)
    .map((id) => parseCellKey(id))
    .map(({ ix, iy }) => ({ ix, iy }));

  const speed = ARCHETYPE_BY_ID.momo.speedMs;
  const plannedStart = dueAt - walkDurationMs(REACTION_TARGET_M, speed);
  await dbx
    .insert(botSchedules)
    .values({
      householdId: momo.householdId,
      hostHouseholdId: walk.hostId,
      day: dayKeyInZone(plannedStart, host.tz),
      slot: `reaction-${walk.walkId}`,
      plannedStart,
      targetM: REACTION_TARGET_M,
      via: [via[0], via[1]],
    })
    .onConflictDoNothing();
  await dbx
    .insert(neighbourEvents)
    .values({
      hostHouseholdId: walk.hostId,
      botHouseholdId: momo.householdId,
      kind: def.kind,
      lineKey: def.key,
      params: { bot: momo.name, pawCells: paws },
      day: dueDay,
      slotKey: `reaction-${walk.walkId}`,
      dueAt,
    })
    .onConflictDoNothing();
}

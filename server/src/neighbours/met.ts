// Which neighbour dogs were out while a human walk was going on ("we met"): derived once at upload from the dogs'
// own walk schedule (their walks are drawn later, so the plan is the only record that exists at upload time).
// Stored on the walk as archetype ids; postcards show up to MAX_MET_NEIGHBOURS of them.
import { and, eq, inArray } from 'drizzle-orm';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { botProfiles, botSchedules } from '../db/schema';
import { ARCHETYPE_BY_ID, type ArchetypeId } from './archetypes';
import { walkDurationMs } from './planner';

export const MAX_MET_NEIGHBOURS = 3;

export async function metNeighbourIds(dbx: Db, config: Config, hostId: string, walkStart: number, walkEnd: number): Promise<ArchetypeId[]> {
  if (!config.neighbours.enabled) return [];
  const rows = await dbx
    .select({ archetype: botProfiles.archetype, plannedStart: botSchedules.plannedStart, targetM: botSchedules.targetM })
    .from(botSchedules)
    .innerJoin(botProfiles, eq(botProfiles.householdId, botSchedules.householdId))
    .where(and(eq(botSchedules.hostHouseholdId, hostId), inArray(botSchedules.status, ['planned', 'done'])));
  const overlap = new Map<ArchetypeId, number>();
  for (const r of rows) {
    const a = ARCHETYPE_BY_ID[r.archetype as ArchetypeId];
    if (!a) continue;
    const end = r.plannedStart + walkDurationMs(r.targetM, a.speedMs);
    const ms = Math.min(end, walkEnd) - Math.max(r.plannedStart, walkStart);
    if (ms > 0) overlap.set(a.id, (overlap.get(a.id) ?? 0) + ms);
  }
  // Longest shared time first; the id breaks ties so the answer is stable.
  return [...overlap.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, MAX_MET_NEIGHBOURS)
    .map(([id]) => id);
}

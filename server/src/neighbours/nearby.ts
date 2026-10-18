// GET /v1/nearby: the household's active neighbour dogs with their dotted-Range summary (design Decisions 11, 22, 23).
import { and, desc, eq, sql } from 'drizzle-orm';
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import type { NearbyItem, NearbyResponse } from '@game/sync/apiContract';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { botSchedules, cells, households } from '../db/schema';
import { dayKeyInZone } from '../lib/time';
import { hostAnchor, isActive, escalationWeek, profilesOf } from './bots';
import type { ArchetypeId } from './archetypes';
import { distanceM } from './geo';

function bucket(lastWalkEnd: number | null, now: number, tz: string): string {
  if (lastWalkEnd === null) return 'none';
  const days = Math.round((Date.parse(`${dayKeyInZone(now, tz)}T00:00:00Z`) - Date.parse(`${dayKeyInZone(lastWalkEnd, tz)}T00:00:00Z`)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? 'this-week' : 'earlier';
}

export async function getNearby(db: Db, config: Config, hostId: string, radiusM: number, withCells: boolean, now: number): Promise<NearbyResponse> {
  if (!config.neighbours.enabled) return { items: [] };
  const profiles = await profilesOf(db, hostId);
  if (profiles.length === 0) return { items: [] };
  const [host] = await db.select({ tz: households.timezone }).from(households).where(eq(households.id, hostId));
  const anchor = await hostAnchor(db, hostId);
  const week = escalationWeek(Math.min(...profiles.map((p) => p.introducedAt)), dayKeyInZone(now, host.tz), host.tz);
  const items: NearbyItem[] = [];
  for (const p of profiles) {
    if (!isActive(p.archetype as ArchetypeId, week)) continue;
    const away = anchor ? distanceM(anchor, [p.homeLat, p.homeLng]) : 0;
    if (away > radiusM) continue;
    const [last] = await db
      .select({ at: sql<number>`max(${botSchedules.plannedStart})::float8` })
      .from(botSchedules)
      .where(and(eq(botSchedules.householdId, p.householdId), eq(botSchedules.status, 'done')));
    const item: NearbyItem = {
      id: p.householdId,
      kind: 'bot',
      generated: true,
      archetype: p.archetype,
      dogName: p.name,
      appearance: p.appearance as Record<string, unknown>,
      traitKey: p.personality,
      areaLabel: away < 1000 ? 'near' : away < 2000 ? 'around' : 'further',
      lastActiveBucket: bucket(last?.at ?? null, now, host.tz),
      metCount: p.metCount,
    };
    if (withCells) {
      const rows = await db
        .select({ ix: cells.ix, iy: cells.iy })
        .from(cells)
        .where(and(eq(cells.householdId, p.householdId), eq(cells.generated, true)))
        .orderBy(desc(cells.lastTracked), cells.ix, cells.iy)
        .limit(NEIGHBOUR_CONFIG.nearby.maxCellsPerBot);
      item.rangeCells = rows;
    }
    items.push(item);
  }
  return { items };
}

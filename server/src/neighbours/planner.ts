// Daily planner (design Decision 19): per host and local day, decides which bots walk when and which neighbour
// events happen. Deterministic given (seed, day) and the rows that already exist; idempotent through unique keys.
import { and, eq, gte, sql } from 'drizzle-orm';
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import type { Db } from '../db/client';
import { botSchedules, households, neighbourEvents } from '../db/schema';
import { addDays, dayKeyInZone, localToUtcMs, weekdayIndex, weekStartOf } from '../lib/time';
import { ARCHETYPE_BY_ID, LINES, type ArchetypeId, type LineDef } from './archetypes';
import { escalationWeek, profilesOf, type BotProfile } from './bots';
import { hashSeed, makeRng } from './rng';

const CAPS = NEIGHBOUR_CONFIG.caps;
const DAY_MS = 24 * 3600_000;

type EventRow = Pick<typeof neighbourEvents.$inferSelect, 'day' | 'kind' | 'lineKey' | 'botHouseholdId'>;

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export function walkDurationMs(targetM: number, speedMs: number): number {
  return Math.round((targetM / speedMs) * 1000);
}

export function formatLocalTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

/** Cap check shared by the daily planner and the reaction scheduler. `rows` are everything planned or emitted. */
export function canPlan(rows: EventRow[], def: LineDef, day: string): boolean {
  const onDay = rows.filter((r) => r.day === day);
  if (onDay.length >= CAPS.eventsPerDay) return false;
  if (def.kind === 'neighbour.gift' && onDay.some((r) => r.kind === 'neighbour.gift')) return false;
  const week = weekStartOf(day);
  const inWeek = rows.filter((r) => weekStartOf(r.day) === week);
  if (def.kind === 'neighbour.invitation' && inWeek.some((r) => r.kind === 'neighbour.invitation')) return false;
  if (def.kind === 'neighbour.reaction' && inWeek.filter((r) => r.kind === 'neighbour.reaction').length >= CAPS.reactionsPerWeek) return false;
  const repeatDays = def.key === 'neighbours.line.sockLeft' ? CAPS.sockRepeatDays : CAPS.lineRepeatDays;
  if (rows.some((r) => r.lineKey === def.key && Math.abs(daysBetween(r.day, day)) < repeatDays)) return false;
  return true;
}

export async function recentEventRows(db: Db, hostId: string, day: string): Promise<EventRow[]> {
  return db
    .select({ day: neighbourEvents.day, kind: neighbourEvents.kind, lineKey: neighbourEvents.lineKey, botHouseholdId: neighbourEvents.botHouseholdId })
    .from(neighbourEvents)
    .where(and(eq(neighbourEvents.hostHouseholdId, hostId), gte(neighbourEvents.day, addDays(day, -CAPS.sockRepeatDays - 1))));
}

/**
 * Plans one local day for a host. No-op when the day was already planned, or is not after the introduction day
 * (the neighbours show up "the morning after the first walk", never retroactively).
 */
export async function planDay(dbx: Db, hostId: string, day: string): Promise<{ planned: boolean }> {
  const [host] = await dbx.select().from(households).where(eq(households.id, hostId));
  const profiles = await profilesOf(dbx, hostId);
  if (profiles.length === 0) return { planned: false };
  const introducedAt = Math.min(...profiles.map((p) => p.introducedAt));
  const tz = host.timezone;
  const introDay = dayKeyInZone(introducedAt, tz);
  if (daysBetween(introDay, day) < 1) return { planned: false };
  const [already] = await dbx
    .select({ n: sql<number>`count(*)::int` })
    .from(botSchedules)
    .where(and(eq(botSchedules.hostHouseholdId, hostId), eq(botSchedules.day, day)));
  if (already.n > 0) return { planned: false };

  const week = escalationWeek(introducedAt, day, tz);
  const firstDay = daysBetween(introDay, day) === 1;
  const active = profiles.filter((p) => ARCHETYPE_BY_ID[p.archetype as ArchetypeId].introWeek <= week);
  const weekend = weekdayIndex(day) >= 5;

  // ---- walks
  const walkEnds = new Map<string, number>(); // bot household id -> end of its first planned walk of the day
  const walkStarts = new Map<string, number>();
  for (const p of active) {
    const a = ARCHETYPE_BY_ID[p.archetype as ArchetypeId];
    for (const slot of a.slots) {
      const rng = makeRng(hashSeed(p.seed, day, slot.slot));
      const goes = (firstDay && p.archetype === 'momo' && slot.slot === 'am') || rng.next() < slot.probability;
      if (!goes) continue;
      const jitter = rng.int(-NEIGHBOUR_CONFIG.geo.startJitterMin, NEIGHBOUR_CONFIG.geo.startJitterMin);
      const shift = weekend ? NEIGHBOUR_CONFIG.geo.weekendShiftMin : 0;
      const plannedStart = localToUtcMs(day, toMinutes(slot.at) + jitter + shift, tz);
      const targetM = Math.round(slot.lengthM * rng.range(0.92, 1.08));
      await dbx
        .insert(botSchedules)
        .values({ householdId: p.householdId, hostHouseholdId: hostId, day, slot: slot.slot, plannedStart, targetM })
        .onConflictDoNothing();
      const end = plannedStart + walkDurationMs(targetM, a.speedMs);
      if (!walkEnds.has(p.householdId) || plannedStart < walkStarts.get(p.householdId)!) {
        walkEnds.set(p.householdId, end);
        walkStarts.set(p.householdId, plannedStart);
      }
    }
  }

  // ---- events
  const rows = await recentEventRows(dbx, hostId, day);
  const rng = makeRng(hashSeed(hostId, day, 'events'));
  let count = rng.weighted(CAPS.eventCountWeights);
  if (firstDay) count = Math.max(count, 1);
  const byArchetype = new Map(active.map((p) => [p.archetype as ArchetypeId, p]));
  const hasNebelEvent = rows.some((r) => r.botHouseholdId && byArchetype.get('nebel')?.householdId === r.botHouseholdId);

  const candidates = (): Array<{ def: LineDef; bot: BotProfile }> => {
    const out: Array<{ def: LineDef; bot: BotProfile }> = [];
    for (const def of LINES) {
      if (!def.planned || !def.bot) continue;
      const bot = byArchetype.get(def.bot);
      if (!bot || !walkEnds.has(bot.householdId)) continue; // a dog only leaves a trace on a day it walked
      if (def.kind === 'neighbour.invitation' && week < NEIGHBOUR_CONFIG.escalation.invitationsFromWeek) continue;
      if (def.weird && week < NEIGHBOUR_CONFIG.escalation.weirdFromWeek) continue;
      if (def.bot === 'nebel' && !hasNebelEvent && def.key !== 'neighbours.line.moonHello') continue; // the first weird event is the moon
      if (!canPlan(rows, def, day)) continue;
      out.push({ def, bot });
    }
    return out;
  };

  for (let i = 0; i < count; i++) {
    let pool = candidates();
    if (firstDay && i === 0) pool = pool.filter((c) => c.def.key === 'neighbours.line.sniffCorner'); // milestone M2
    if (pool.length === 0) break;
    const pick = pool[rng.int(0, pool.length - 1)];
    const walkEnd = walkEnds.get(pick.bot.householdId)!;
    const walkStart = walkStarts.get(pick.bot.householdId)!;
    const params: Record<string, string | number> = { bot: pick.bot.name };
    let dueAt = walkEnd + 2 * 60_000;
    if (pick.def.kind === 'neighbour.invitation') {
      params.at = formatLocalTime(walkStart, tz);
      dueAt = Math.min(localToUtcMs(day, 9 * 60, tz), walkStart - 60 * 60_000); // a morning heads-up, before the walk
    }
    const dueDay = dayKeyInZone(dueAt, tz);
    const row = {
      hostHouseholdId: hostId,
      botHouseholdId: pick.bot.householdId,
      kind: pick.def.kind,
      lineKey: pick.def.key,
      params,
      day: dueDay,
      slotKey: `daily-${i}`,
      dueAt,
    };
    await dbx.insert(neighbourEvents).values(row).onConflictDoNothing();
    rows.push({ day: dueDay, kind: row.kind, lineKey: row.lineKey, botHouseholdId: row.botHouseholdId });
  }
  return { planned: true };
}

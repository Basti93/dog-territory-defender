// Viertel-Runde: the weekly neighbourhood goal (design Decision 21). Server-computed, no loss state.
import { and, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { NEIGHBOUR_CONFIG, coopGoalKm, coopPlayerShareKm } from '@game/economy/neighbourConfig';
import { walkDistanceMeters } from '@game/utils/geometry';
import type { Location } from '@game/types';
import type { CoopWeekResponse } from '@game/sync/apiContract';
import type { Db } from '../db/client';
import { botSchedules, coopWeeks, households, walks } from '../db/schema';
import { addDays, dayKeyInZone, localToUtcMs, weekStartOf } from '../lib/time';
import { ARCHETYPES, YARD_DECORATIONS } from './archetypes';
import { escalationWeek, profilesOf } from './bots';

export const WEEK_KEYS = (weekStart: string) => ({ from: weekStart, to: addDays(weekStart, 6) });

/** Human km of the household in a local week: tracked, non-deleted walks (manual logs and generated walks excluded). */
export async function humanKmInWeek(db: Db, hostId: string, weekStart: string, tz: string): Promise<number> {
  const rows = await db
    .select({ route: walks.route, startTime: walks.startTime })
    .from(walks)
    .where(
      and(
        eq(walks.householdId, hostId),
        eq(walks.generated, false),
        eq(walks.startSource, 'button'),
        isNull(walks.deletedAt),
        gte(walks.startTime, localToUtcMs(weekStart, 0, tz)),
        lt(walks.startTime, localToUtcMs(addDays(weekStart, 7), 0, tz))
      )
    );
  return rows.reduce((s, r) => s + walkDistanceMeters({ startTime: r.startTime, locations: r.route as Location[] }), 0) / 1000;
}

export async function botKmInWeek(db: Db, hostId: string, weekStart: string): Promise<number> {
  const { from, to } = WEEK_KEYS(weekStart);
  const [row] = await db
    .select({ m: sql<number>`coalesce(sum(${botSchedules.distanceM}), 0)::float8` })
    .from(botSchedules)
    .where(and(eq(botSchedules.hostHouseholdId, hostId), eq(botSchedules.status, 'done'), gte(botSchedules.day, from), sql`${botSchedules.day} <= ${to}`));
  return row.m / 1000;
}

/** Expected bot km of a whole week from the archetypes' rhythms (what "planned at Monday planning" means here). */
export function expectedBotKmPerWeek(week: number): number {
  let m = 0;
  for (const a of ARCHETYPES) {
    if (a.introWeek > week) continue;
    for (const s of a.slots) m += s.lengthM * s.probability;
  }
  return (m * 7) / 1000;
}

export type CoopRow = typeof coopWeeks.$inferSelect;

/** Creates the week row when missing (goal fixed at creation, so the target never moves under the player). */
export async function ensureCoopWeek(dbx: Db, hostId: string, weekStart: string, tz: string, escalation: number): Promise<CoopRow> {
  const [have] = await dbx.select().from(coopWeeks).where(and(eq(coopWeeks.hostHouseholdId, hostId), eq(coopWeeks.weekStart, weekStart)));
  if (have) return have;
  const recent: number[] = [];
  for (let i = 1; i <= NEIGHBOUR_CONFIG.coop.paceWeeks; i++) recent.push(await humanKmInWeek(dbx, hostId, addDays(weekStart, -7 * i), tz));
  const nonEmpty = recent.some((km) => km > 0) ? recent : [];
  const share = coopPlayerShareKm(nonEmpty);
  const { goalKm, botKm } = coopGoalKm(expectedBotKmPerWeek(escalation), share);
  const [prev] = await dbx.select().from(coopWeeks).where(and(eq(coopWeeks.hostHouseholdId, hostId), eq(coopWeeks.weekStart, addDays(weekStart, -7))));
  const carriedKm = prev && !prev.completedAt ? Math.min(recent[0] ?? 0, NEIGHBOUR_CONFIG.coop.carryFraction * share) : 0;
  await dbx
    .insert(coopWeeks)
    .values({ hostHouseholdId: hostId, weekStart, goalKm, plannedBotKm: botKm, carriedKm })
    .onConflictDoNothing();
  const [row] = await dbx.select().from(coopWeeks).where(and(eq(coopWeeks.hostHouseholdId, hostId), eq(coopWeeks.weekStart, weekStart)));
  return row;
}

export interface CoopProgress {
  humanKm: number;
  botKm: number;
  totalKm: number;
  ratio: number;
  completed: boolean;
}

/** Bots count for at most their capped plan (and so at most 60 % of the goal); carried km are a head start. */
export function coopProgress(row: Pick<CoopRow, 'goalKm' | 'plannedBotKm' | 'carriedKm'>, humanKm: number, botKm: number): CoopProgress {
  const totalKm = humanKm + Math.min(botKm, row.plannedBotKm) + row.carriedKm;
  return { humanKm, botKm, totalKm, ratio: Math.min(1, totalKm / row.goalKm), completed: totalKm >= row.goalKm };
}

export async function yardDecorationsOf(db: Db, hostId: string): Promise<string[]> {
  const rows = await db
    .select({ r: coopWeeks.rewardId })
    .from(coopWeeks)
    .where(and(eq(coopWeeks.hostHouseholdId, hostId), isNotNull(coopWeeks.rewardId)))
    .orderBy(coopWeeks.weekStart);
  return rows.map((r) => r.r as string);
}

export function coopActive(introducedAt: number, day: string, tz: string): boolean {
  return escalationWeek(introducedAt, day, tz) >= NEIGHBOUR_CONFIG.escalation.coopFromWeek;
}

/** Tick side: refresh stored progress and mark completion (reward chosen here). Returns the row, or null when not active. */
export async function updateCoop(dbx: Db, hostId: string, now: number): Promise<CoopRow | null> {
  const [host] = await dbx.select().from(households).where(eq(households.id, hostId));
  const profiles = await profilesOf(dbx, hostId);
  if (profiles.length === 0) return null;
  const introducedAt = Math.min(...profiles.map((p) => p.introducedAt));
  const day = dayKeyInZone(now, host.timezone);
  if (!coopActive(introducedAt, day, host.timezone)) return null;
  const weekStart = weekStartOf(day);
  const row = await ensureCoopWeek(dbx, hostId, weekStart, host.timezone, escalationWeek(introducedAt, day, host.timezone));
  const human = await humanKmInWeek(dbx, hostId, weekStart, host.timezone);
  const bot = await botKmInWeek(dbx, hostId, weekStart);
  const p = coopProgress(row, human, bot);
  const patch: Partial<CoopRow> = { humanKm: human, botKm: bot };
  if (p.completed && !row.completedAt) {
    const earned = await yardDecorationsOf(dbx, hostId);
    patch.completedAt = now;
    patch.rewardId = YARD_DECORATIONS[earned.length % YARD_DECORATIONS.length];
  }
  await dbx.update(coopWeeks).set(patch).where(and(eq(coopWeeks.hostHouseholdId, hostId), eq(coopWeeks.weekStart, weekStart)));
  return { ...row, ...patch };
}

export const inactiveCoopWeek = (): CoopWeekResponse => ({ active: false, weekStart: null, goalKm: 0, totalKm: 0, ratio: 0, completed: false, rewardId: null, yardDecorations: [] });

/** GET /v1/coop/week */
export async function getCoopWeek(db: Db, hostId: string, now: number): Promise<CoopWeekResponse> {
  const none = inactiveCoopWeek();
  const [host] = await db.select().from(households).where(eq(households.id, hostId));
  const profiles = await profilesOf(db, hostId);
  if (profiles.length === 0) return none;
  const introducedAt = Math.min(...profiles.map((p) => p.introducedAt));
  const day = dayKeyInZone(now, host.timezone);
  const yard = await yardDecorationsOf(db, hostId);
  if (!coopActive(introducedAt, day, host.timezone)) return { ...none, yardDecorations: yard };
  const weekStart = weekStartOf(day);
  const row = await ensureCoopWeek(db, hostId, weekStart, host.timezone, escalationWeek(introducedAt, day, host.timezone));
  const p = coopProgress(row, await humanKmInWeek(db, hostId, weekStart, host.timezone), await botKmInWeek(db, hostId, weekStart));
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    active: true,
    weekStart,
    goalKm: r1(row.goalKm),
    totalKm: r1(Math.min(p.totalKm, row.goalKm)),
    ratio: Math.round(p.ratio * 1000) / 1000,
    completed: !!row.completedAt || p.completed,
    rewardId: row.rewardId,
    yardDecorations: yard,
  };
}

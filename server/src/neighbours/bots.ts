// Bot creation and the host's "home anchor" (design Decision 17). Bots are ordinary households flagged
// is_bot: one dogs row, one bot_profiles row, no players, no devices.
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { NEIGHBOUR_CONFIG } from '@game/economy/neighbourConfig';
import type { Db } from '../db/client';
import { botProfiles, dogs, households, walks } from '../db/schema';
import { dayKeyInZone } from '../lib/time';
import { ARCHETYPES, type Archetype, type ArchetypeId } from './archetypes';
import { pointAt, type LatLng } from './geo';
import { hashSeed, makeRng } from './rng';

export type BotProfile = typeof botProfiles.$inferSelect;

const WEEK_DAYS = 7;

/**
 * The host's home anchor, server-side only (never sent anywhere): start point of its first tracked walk, replaced
 * by the median start point once it has five. Null when the household has no tracked walk with a route yet.
 */
export async function hostAnchor(db: Db, hostId: string): Promise<LatLng | null> {
  const rows = await db
    .select({
      lat: sql<number>`(${walks.route}->0->>'latitude')::float8`,
      lon: sql<number>`(${walks.route}->0->>'longitude')::float8`,
    })
    .from(walks)
    .where(
      and(
        eq(walks.householdId, hostId),
        eq(walks.generated, false),
        eq(walks.startSource, 'button'),
        isNull(walks.deletedAt),
        sql`jsonb_array_length(${walks.route}) > 0`
      )
    )
    .orderBy(asc(walks.startTime))
    .limit(30);
  if (rows.length === 0) return null;
  if (rows.length < 5) return [rows[0].lat, rows[0].lon];
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return [median(rows.map((r) => r.lat)), median(rows.map((r) => r.lon))];
}

/** Synthetic home of a bot: a seeded bearing and a distance inside the archetype's band, from the host anchor. */
export function botHome(hostId: string, archetype: Archetype, anchor: LatLng): { seed: number; home: LatLng } {
  const seed = hashSeed(hostId, archetype.id);
  const rng = makeRng(hashSeed(seed, 'home'));
  const { botHomeMinM, botHomeMaxM } = NEIGHBOUR_CONFIG.geo;
  const [lo, hi] = archetype.homeBandM;
  const dist = rng.range(Math.max(lo, botHomeMinM), Math.min(hi, botHomeMaxM));
  return { seed, home: pointAt(anchor, dist, rng.range(0, Math.PI * 2)) };
}

/**
 * Creates all six bot households for a host, idempotently (unique key host+archetype). Same seed per
 * (host, archetype), so every phone of the household sees the same neighbours. Returns true when it created them.
 */
export async function ensureBots(dbx: Db, hostId: string, now: number): Promise<boolean> {
  const [existing] = await dbx.select({ id: botProfiles.householdId }).from(botProfiles).where(eq(botProfiles.hostHouseholdId, hostId)).limit(1);
  if (existing) return false;
  const anchor = await hostAnchor(dbx, hostId);
  if (!anchor) return false;
  const [host] = await dbx.select({ timezone: households.timezone }).from(households).where(eq(households.id, hostId));
  for (const a of ARCHETYPES) {
    const { seed, home } = botHome(hostId, a, anchor);
    const [bot] = await dbx
      .insert(households)
      .values({ name: a.name, timezone: host.timezone, isBot: true, foundedImportDone: true })
      .returning({ id: households.id });
    await dbx.insert(dogs).values({ householdId: bot.id, name: a.name, appearance: a.appearance, updatedAt: now });
    await dbx.insert(botProfiles).values({
      householdId: bot.id,
      hostHouseholdId: hostId,
      archetype: a.id,
      name: a.name,
      appearance: a.appearance,
      personality: a.traitKey,
      rhythm: { slots: a.slots, speedMs: a.speedMs },
      quirk: a.quirk,
      seed,
      homeLat: home[0],
      homeLng: home[1],
      introducedAt: now,
    });
  }
  return true;
}

export async function profilesOf(db: Db, hostId: string): Promise<BotProfile[]> {
  return db.select().from(botProfiles).where(eq(botProfiles.hostHouseholdId, hostId)).orderBy(asc(botProfiles.archetype));
}

/** 1-based escalation week of `day` (W1 = the first 7 local days from the introduction day). */
export function escalationWeek(introducedAt: number, day: string, tz: string): number {
  const introDay = dayKeyInZone(introducedAt, tz);
  // day keys are ISO dates: whole-day difference via UTC midnight
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${introDay}T00:00:00Z`)) / (24 * 3600_000));
  return Math.floor(diff / WEEK_DAYS) + 1;
}

export function isActive(archetype: ArchetypeId, week: number): boolean {
  return ARCHETYPES.find((a) => a.id === archetype)!.introWeek <= week;
}

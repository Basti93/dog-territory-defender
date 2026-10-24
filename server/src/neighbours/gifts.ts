// Gifts (design Decision 20): a cosmetic id and/or one small treat sprinkle. The sprinkle is credited when the
// gift is opened (commands.ts, gift.open), outside the reward formulas: no Beginner's Luck, no multipliers.
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { NEIGHBOUR_CONFIG, sprinkleTreats } from '@game/economy/neighbourConfig';
import { stickIdFor, type StickDogId } from '@game/economy/sticks';
import type { ApiGift, GiftsResponse } from '@game/sync/apiContract';
import type { Db } from '../db/client';
import { botProfiles, gifts, walks } from '../db/schema';
import { COSMETICS, type ArchetypeId, type LineDef } from './archetypes';
import type { BotProfile } from './bots';
import { hashSeed, makeRng } from './rng';

/** Treats of the household's last human walks (newest first), for the sprinkle mean. */
export async function recentWalkTreats(db: Db, hostId: string): Promise<number[]> {
  const rows = await db
    .select({ t: walks.treatsEarned })
    .from(walks)
    .where(and(eq(walks.householdId, hostId), eq(walks.generated, false), isNull(walks.deletedAt), eq(walks.closed, true), isNotNull(walks.treatsEarned)))
    .orderBy(desc(walks.startTime))
    .limit(NEIGHBOUR_CONFIG.gifts.sprinkleWalkWindow);
  return rows.map((r) => r.t as number);
}

/**
 * Creates the gift that belongs to a gift line. Stick: always that dog's own stick (a repeat is a duplicate the shelf
 * ignores, the pickup and the sprinkle still happen). Other cosmetics: the line's category, first one the household does
 * not own yet (seeded order); exclusive piece once the dog was met enough times; none left = sprinkle only. Sprinkle:
 * only for the first gift of a local day. Returns the new gift row.
 */
export async function createGift(dbx: Db, hostId: string, bot: BotProfile, def: LineDef, day: string, now: number, exclusiveDue: boolean) {
  const owned = new Set((await dbx.select({ c: gifts.cosmeticId }).from(gifts).where(eq(gifts.hostHouseholdId, hostId))).map((r) => r.c));
  let cosmeticId: string | null = null;
  const exclusive = COSMETICS.exclusive[bot.archetype as ArchetypeId];
  if (def.gift === 'stick') {
    cosmeticId = stickIdFor(bot.archetype as StickDogId);
  } else if (exclusiveDue && exclusive && !owned.has(exclusive)) {
    cosmeticId = exclusive;
  } else if (def.gift) {
    const rng = makeRng(hashSeed(bot.seed, day, 'cosmetic'));
    const pool = [...COSMETICS[def.gift]];
    const start = pool.length ? rng.int(0, pool.length - 1) : 0;
    for (let i = 0; i < pool.length && !cosmeticId; i++) {
      const candidate = pool[(start + i) % pool.length];
      if (!owned.has(candidate)) cosmeticId = candidate;
    }
  }
  const sameDay = await dbx.select({ id: gifts.id }).from(gifts).where(and(eq(gifts.hostHouseholdId, hostId), eq(gifts.day, day), isNotNull(gifts.sprinkleTreats)));
  const sprinkle = sameDay.length === 0 ? sprinkleTreats(await recentWalkTreats(dbx, hostId)) : null;
  const [row] = await dbx
    .insert(gifts)
    .values({ hostHouseholdId: hostId, botHouseholdId: bot.householdId, cosmeticId, sprinkleTreats: sprinkle, day, createdAt: now })
    .returning();
  return row;
}

export async function listGifts(db: Db, hostId: string): Promise<GiftsResponse> {
  const rows = await db
    .select({ g: gifts, botName: botProfiles.name })
    .from(gifts)
    .innerJoin(botProfiles, eq(botProfiles.householdId, gifts.botHouseholdId))
    .where(eq(gifts.hostHouseholdId, hostId))
    .orderBy(desc(gifts.createdAt));
  return {
    gifts: rows.map(
      ({ g, botName }): ApiGift => ({
        id: g.id,
        botId: g.botHouseholdId,
        botName,
        cosmeticId: g.cosmeticId,
        sprinkleTreats: g.sprinkleTreats,
        createdAt: g.createdAt,
        openedAt: g.openedAt,
      })
    ),
  };
}

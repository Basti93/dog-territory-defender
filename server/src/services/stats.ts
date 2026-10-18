// Personal stats per player (multiplayer-sync: "stats on the server"). The phone sends its full state, the server merges
// monotonically (src/sync/statsMerge.ts: max, earliest date, union) and answers with the result. Deliberately NOT an
// economy command: no events row (the feed is household-wide, this is personal) and no command log / daily cap.
import { eq, sql } from 'drizzle-orm';
import type { ApiAchievement, ApiMyStats, ApiPersonalStats } from '@game/sync/apiContract';
import { API_LIMITS } from '@game/sync/apiContract';
import { mergeAchievements, mergeStats } from '@game/sync/statsMerge';
import type { Db } from '../db/client';
import { playerAchievements, playerStats } from '../db/schema';
import type { AuthCtx } from './walks';

class TooManyAchievements extends Error {}

export type PutStatsResult = { kind: 'ok'; stats: ApiMyStats } | { kind: 'too-many' };

async function readAchievements(db: Db, playerId: string): Promise<ApiAchievement[]> {
  const rows = await db.select().from(playerAchievements).where(eq(playerAchievements.playerId, playerId));
  return rows.map((r) => ({ id: r.achievementId, unlockedAt: r.unlockedAt }));
}

/** The caller's own stats, or null when nothing was ever uploaded. */
export async function getMyStats(db: Db, playerId: string): Promise<ApiMyStats | null> {
  const [row] = await db.select().from(playerStats).where(eq(playerStats.playerId, playerId));
  if (!row) return null;
  return { stats: row.state as ApiPersonalStats, achievements: mergeAchievements(await readAchievements(db, playerId), []) };
}

export async function putMyStats(db: Db, auth: AuthCtx, req: ApiMyStats, now: number): Promise<PutStatsResult> {
  try {
    const merged = await db.transaction(async (tx) => {
      const dbx = tx as unknown as Db;
      // Seed + row lock: two phones of one player (or a retry racing its original) merge one after the other.
      await dbx.insert(playerStats).values({ playerId: auth.playerId, state: req.stats, updatedAt: now }).onConflictDoNothing();
      const [row] = await dbx.select().from(playerStats).where(eq(playerStats.playerId, auth.playerId)).for('update');
      const existing = await readAchievements(dbx, auth.playerId);
      const result = mergeStats<ApiPersonalStats>({ stats: row.state as ApiPersonalStats, achievements: existing }, req);
      if (result.achievements.length > API_LIMITS.maxAchievementsStored) throw new TooManyAchievements();

      await dbx.update(playerStats).set({ state: result.stats, updatedAt: now }).where(eq(playerStats.playerId, auth.playerId));
      const known = new Map(existing.map((a) => [a.id, a.unlockedAt]));
      const changed = result.achievements.filter((a) => known.get(a.id) !== a.unlockedAt);
      if (changed.length > 0) {
        await dbx
          .insert(playerAchievements)
          .values(changed.map((a) => ({ playerId: auth.playerId, achievementId: a.id, unlockedAt: a.unlockedAt })))
          .onConflictDoUpdate({ target: [playerAchievements.playerId, playerAchievements.achievementId], set: { unlockedAt: sql`excluded.unlocked_at` } });
      }
      return result;
    });
    return { kind: 'ok', stats: merged };
  } catch (err) {
    if (err instanceof TooManyAchievements) return { kind: 'too-many' };
    throw err;
  }
}

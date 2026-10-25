// Walk-statistics hygiene on the server (docs/specs/walk-lifecycle.md "Statistics hygiene"):
//  - statsColumns: the walks.stats_* values for a walk, used at upload (walks.ts) and by the fold.
//  - foldWalkStats: idempotent startup fold (like territoryFold.ts). Gives every tracked walk without the current statistics
//    view its stats_* columns, re-sends the walks that changed to the households (walk.added, applied by the app as a
//    metadata update), and corrects each player's stored lifetime figures once (stats_basis).
// It never touches rewards, treats, cells or territories, and never edits a route.
import { and, eq, isNull, or, lt, sql } from 'drizzle-orm';
import type { ApiPersonalStats } from '@game/sync/apiContract';
import type { Location, WalkStartSource } from '@game/types';
import { walkDistanceMeters } from '@game/utils/geometry';
import { analyseWalk, WALK_STATS_VERSION, type WalkStats } from '@game/walks/walkRepair';
import type { Db } from '../db/client';
import { denState, households, playerStats, players, walks } from '../db/schema';
import { appendEvent, type EventBus } from './events';
import { walkMetaFromRow } from './state';

export function statsColumns(stats: WalkStats) {
  return {
    statsVersion: stats.version,
    statsEndTime: stats.endTime,
    statsDistanceM: stats.distanceMeters,
    statsExcluded: stats.excluded,
  };
}

export interface CorrectionWalk {
  closed: boolean;
  startTime: number;
  startSource: WalkStartSource;
  locations: Location[];
}

export interface StatsCorrection {
  stats: ApiPersonalStats;
  /** Metres taken off the lifetime distance (idle tails that had been counted as walking). */
  lifetimeDeltaM: number;
  longestChanged: boolean;
}

const SAME_DISTANCE_M = 1;

/**
 * Corrects ONE player's stored personal stats from basis 0 to WALK_STATS_VERSION (a later version needs its own correction:
 * the figures then already contain this one). Lifetime distance loses what each closed walk's idle tail had added; the
 * longest-walk record is rebuilt from the player's meaningful walks only when it was set by a walk that has since changed.
 * Walk count, treats, area and every other figure are left alone.
 */
export function correctPlayerStats(stats: ApiPersonalStats, playerWalks: readonly CorrectionWalk[]): StatsCorrection {
  if ((stats.statsBasis ?? 0) >= WALK_STATS_VERSION) return { stats, lifetimeDeltaM: 0, longestChanged: false };
  let delta = 0;
  let longestSetByChangedWalk = false;
  let bestRepaired = 0;
  for (const w of playerWalks) {
    if (!w.closed || w.startSource === 'manual-log') continue;
    const raw = walkDistanceMeters(w);
    const view = analyseWalk(w);
    const repaired = view.distanceMeters ?? 0;
    const diff = Math.max(0, raw - repaired);
    delta += diff;
    if (diff > SAME_DISTANCE_M && Math.abs(stats.longestWalkDistanceM - raw) <= SAME_DISTANCE_M) longestSetByChangedWalk = true;
    if (!view.excluded) bestRepaired = Math.max(bestRepaired, repaired);
  }
  const longest = longestSetByChangedWalk ? Math.min(stats.longestWalkDistanceM, bestRepaired) : stats.longestWalkDistanceM;
  return {
    stats: { ...stats, lifetimeDistanceMeters: Math.max(0, stats.lifetimeDistanceMeters - delta), longestWalkDistanceM: longest, statsBasis: WALK_STATS_VERSION },
    lifetimeDeltaM: delta,
    longestChanged: longest !== stats.longestWalkDistanceM,
  };
}

export interface WalkStatsFoldReport {
  walksChecked: number;
  /** Walks whose idle tail was cut (end earlier than the last fix). */
  trimmed: number;
  /** Walks now kept out of averages and records, by reason. */
  excluded: Record<string, number>;
  /** Walks re-sent to the households (trimmed or excluded). */
  resent: number;
  /** Per player whose figures were corrected. */
  players: Array<{ playerId: string; before: Pick<ApiPersonalStats, 'lifetimeDistanceMeters' | 'longestWalkDistanceM'>; after: Pick<ApiPersonalStats, 'lifetimeDistanceMeters' | 'longestWalkDistanceM'> }>;
}

export async function foldWalkStats(
  db: Db,
  bus?: EventBus,
  onError: (hid: string, err: unknown) => void = () => undefined,
  now: number = Date.now()
): Promise<WalkStatsFoldReport> {
  const report: WalkStatsFoldReport = { walksChecked: 0, trimmed: 0, excluded: {}, resent: 0, players: [] };
  const all = await db.select({ id: households.id }).from(households);
  for (const { id: hid } of all) {
    const changedHousehold = await db
      .transaction(async (tx) => {
        const dbx = tx as unknown as Db;
        // Serialises with walk ingest of this household. Bot households have no den_state and no human walks: skipped.
        const [den] = await dbx.select({ id: denState.householdId }).from(denState).where(eq(denState.householdId, hid)).for('update');
        if (!den) return false;
        const todo = await dbx
          .select({ id: walks.id })
          .from(walks)
          .where(and(eq(walks.householdId, hid), eq(walks.generated, false), isNull(walks.deletedAt), or(isNull(walks.statsVersion), lt(walks.statsVersion, WALK_STATS_VERSION))));
        let any = false;
        for (const { id } of todo) {
          const [row] = await dbx.select().from(walks).where(and(eq(walks.householdId, hid), eq(walks.id, id)));
          const view = analyseWalk({ startTime: row.startTime, startSource: row.startSource as 'button' | 'manual-log', locations: row.route as Location[] });
          report.walksChecked += 1;
          if (view.trimmedFixCount > 0) report.trimmed += 1;
          if (view.excluded) report.excluded[view.excluded] = (report.excluded[view.excluded] ?? 0) + 1;
          const [updated] = await dbx.update(walks).set(statsColumns(view)).where(and(eq(walks.householdId, hid), eq(walks.id, id))).returning();
          if (view.trimmedFixCount > 0 || view.excluded) {
            const { route: _route, generated: _generated, ...meta } = updated;
            const cellsPainted = Number((row.reward as { cellsPainted?: number } | null)?.cellsPainted ?? 0);
            await appendEvent(dbx, hid, 'walk.added', null, { walk: walkMetaFromRow(meta), cellsPainted });
            report.resent += 1;
            any = true;
          }
        }
        await correctHouseholdPlayers(dbx, hid, now, report);
        return any;
      })
      .catch((err) => {
        onError(hid, err);
        return false;
      });
    if (changedHousehold) bus?.notify(hid);
  }
  return report;
}

async function correctHouseholdPlayers(dbx: Db, hid: string, now: number, report: WalkStatsFoldReport): Promise<void> {
  const members = await dbx.select({ id: players.id }).from(players).where(eq(players.householdId, hid));
  for (const { id: playerId } of members) {
    const [row] = await dbx.select().from(playerStats).where(eq(playerStats.playerId, playerId)).for('update');
    if (!row) continue;
    const before = row.state as ApiPersonalStats;
    const own = await dbx
      .select({ closed: walks.closed, startTime: walks.startTime, startSource: walks.startSource, route: walks.route })
      .from(walks)
      .where(and(eq(walks.householdId, hid), eq(walks.playerId, playerId), eq(walks.generated, false), isNull(walks.deletedAt), sql`${walks.startSource} <> 'manual-log'`));
    const result = correctPlayerStats(before, own.map((w) => ({ closed: w.closed, startTime: w.startTime, startSource: w.startSource as WalkStartSource, locations: w.route as Location[] })));
    if (result.stats === before) continue; // already at this basis
    await dbx.update(playerStats).set({ state: result.stats, updatedAt: now }).where(eq(playerStats.playerId, playerId));
    report.players.push({
      playerId,
      before: { lifetimeDistanceMeters: before.lifetimeDistanceMeters, longestWalkDistanceM: before.longestWalkDistanceM },
      after: { lifetimeDistanceMeters: result.stats.lifetimeDistanceMeters, longestWalkDistanceM: result.stats.longestWalkDistanceM },
    });
  }
}

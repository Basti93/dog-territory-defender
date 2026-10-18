// Personal stats on the server (multiplayer-sync: "stats on the server"), the app side. The phone keeps playing against its
// local PersonalStatsRepository; this module (a) merges the server's copy INTO the local one silently and (b) uploads the
// FULL local state when it differs from what the server last confirmed. No outbox row: a lost request costs nothing, the
// next upload carries everything. Merge rules live in statsMerge.ts (max / earliest / union, never lowers).
//
// "Dirty" is derived, not flagged at every write site: local state != the last state the server confirmed. That covers
// every writer (walk rewards, passive accrual, Den upgrades, backup restore) without touching any of them.

import { ACHIEVEMENTS, defaultPersonalStatsState, type AchievementId } from '../economy/personalStats';
import type { PersonalStatsRepository } from '../storage/PersonalStatsRepository';
import { log } from '../utils/log';
import { ApiError, type ApiClient } from './apiClient';
import { API_LIMITS, type ApiAchievement, type ApiMyStats, type ApiPersonalStats } from './apiContract';
import { mergeStats } from './statsMerge';

const STAT_KEYS = Object.keys(defaultPersonalStatsState()) as Array<keyof ApiPersonalStats>;

const EMPTY_DOC: ApiMyStats = { stats: { ...defaultPersonalStatsState() }, achievements: [] };

/** The app only stores badges it can draw; unknown ids stay on the server for a newer app. */
const isKnownAchievement = (id: string): boolean => Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, id);

/** The server stores whole milliseconds (iOS reports fractions), so compare and send rounded times. */
const wholeMs = (v: number | null): number | null => (v === null ? null : Math.round(v));

function pickStats(raw: Partial<Record<keyof ApiPersonalStats, number | null>>): ApiPersonalStats {
  const out = { ...defaultPersonalStatsState() } as ApiPersonalStats;
  for (const key of STAT_KEYS) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) (out as unknown as Record<string, number | null>)[key] = v;
  }
  out.firstWalkAt = wholeMs(out.firstWalkAt);
  return out;
}

const byId = (a: ApiAchievement, b: ApiAchievement) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function sameDoc(a: ApiMyStats, b: ApiMyStats): boolean {
  if (STAT_KEYS.some((key) => a.stats[key] !== b.stats[key])) return false;
  if (a.achievements.length !== b.achievements.length) return false;
  const x = [...a.achievements].sort(byId);
  const y = [...b.achievements].sort(byId);
  return x.every((item, i) => item.id === y[i].id && item.unlockedAt === y[i].unlockedAt);
}

export interface StatsSync {
  /** Merges the server's copy into the local stats and achievements: never lowers a local value, raises no celebration or homecoming. */
  applyRemote(remote: ApiMyStats | undefined): Promise<void>;
  /**
   * Uploads the full local state when it changed since the server last confirmed it, at most once per
   * `statsUploadMinIntervalMs` unless `foreground`. Offline and server errors are quiet (next try later); a server that
   * does not know the route (older deploy) stops the uploads until the next app start. Rethrows `unauthorized`.
   */
  upload(client: ApiClient, options: { foreground: boolean }): Promise<void>;
  /** A different household/player (join, leave): forget what the old server confirmed. */
  reset(): void;
}

export function createStatsSync(deps: { stats: PersonalStatsRepository; now: () => number }): StatsSync {
  let confirmed: ApiMyStats | null = null;
  let lastAttemptAt: number | null = null;
  let unsupported = false;

  async function readLocal(): Promise<ApiMyStats> {
    const [state, unlocked] = await Promise.all([deps.stats.getState(), deps.stats.getUnlockedAchievements()]);
    return { stats: pickStats(state), achievements: unlocked.map((a) => ({ id: a.id, unlockedAt: Math.round(a.unlockedAt) })) };
  }

  /** Merges `remote` into the local repository and returns the part of it this app understands. */
  async function mergeIntoLocal(remote: ApiMyStats): Promise<ApiMyStats> {
    const remoteKnown: ApiMyStats = {
      stats: pickStats(remote.stats),
      achievements: remote.achievements.filter((a) => isKnownAchievement(a.id)),
    };
    const local = await readLocal();
    const merged = mergeStats(local, remoteKnown);
    if (STAT_KEYS.some((key) => merged.stats[key] !== local.stats[key])) await deps.stats.saveState(merged.stats);
    const localDates = new Map(local.achievements.map((a) => [a.id, a.unlockedAt]));
    const changed = merged.achievements.filter((a) => localDates.get(a.id) !== a.unlockedAt);
    if (changed.length > 0) await deps.stats.mergeUnlockedAchievements(changed.map((a) => ({ id: a.id as AchievementId, unlockedAt: a.unlockedAt })));
    return remoteKnown;
  }

  return {
    async applyRemote(remote) {
      if (!remote) return;
      confirmed = await mergeIntoLocal(remote);
    },

    async upload(client, { foreground }) {
      if (unsupported) return;
      const local = await readLocal();
      if (sameDoc(local, confirmed ?? EMPTY_DOC)) return; // nothing new (also: a brand-new player with no progress sends nothing)
      const now = deps.now();
      if (!foreground && lastAttemptAt !== null && now - lastAttemptAt < API_LIMITS.statsUploadMinIntervalMs) return;
      lastAttemptAt = now;
      try {
        confirmed = await mergeIntoLocal(await client.putMyStats(local));
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        if (err.kind === 'unauthorized') throw err;
        if (err.kind === 'client' || err.kind === 'upgrade-required') {
          unsupported = true; // older server (404) or a refused body: not worth asking again this session
          log('STATS_SYNC_UNSUPPORTED', { status: err.status });
          return;
        }
        log('STATS_UPLOAD_FAILED', { error: err.message }); // offline / server hiccup: the next opportunity carries it
      }
    },

    reset() {
      confirmed = null;
      lastAttemptAt = null;
      unsupported = false;
    },
  };
}

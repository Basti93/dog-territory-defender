// Doorstep "household news" (multiplayer-sync design.md Decision 10): derived
// from walks a partner walked, never from counts, distances or comparisons.
// Silence is fine: nothing older than 48 h, and no line ever mentions the
// viewing player's own activity.

import { dogDisplayName } from '../economy/denEconomy';
import { t } from '../i18n';
import type { NeighbourLineEntry } from '../storage/SyncRepository';
import type { StoredWalk } from '../storage/WalkRepository';

export const HOUSEHOLD_NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;

export type WalkDayPart = 'morning' | 'afternoon' | 'evening' | 'yesterday';

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** null when the walk is too old (or in the future by more than a day). Uses the device's local time. */
export function walkDayPart(walkStart: number, now: number): WalkDayPart | null {
  if (now - walkStart > HOUSEHOLD_NEWS_WINDOW_MS) return null;
  const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(walkStart)) / (24 * 60 * 60 * 1000));
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff !== 0) return null;
  const hour = new Date(walkStart).getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

export interface HouseholdLineInput {
  walks: StoredWalk[];
  myPlayerId: string | null;
  dogName: string | null;
  lastMemberJoined: { playerName: string; at: number; playerId?: string } | null;
  /** playerId -> CURRENT display name (sync state). Wins over the name stored on a walk, so a rename shows up on old walks too. */
  players?: Record<string, string>;
  now: number;
}

/** 0-3 plain strings for the Doorstep away strip. Empty when not joined. */
export function resolveHouseholdLines(input: HouseholdLineInput): string[] {
  const { walks, myPlayerId, dogName, lastMemberJoined, now } = input;
  const players = input.players ?? {};
  const nameOf = (playerId: string | undefined, stored: string | undefined) => (playerId && players[playerId]) || stored;
  if (!myPlayerId) return [];
  const dog = dogDisplayName(dogName);
  const lines: string[] = [];

  // The most recent partner walk within the window.
  const partnerWalk = walks
    .filter((w) => w.playerId && w.playerId !== myPlayerId && nameOf(w.playerId, w.playerName))
    .sort((a, b) => b.startTime - a.startTime)[0];
  if (partnerWalk) {
    const part = walkDayPart(partnerWalk.startTime, now);
    if (part) lines.push(t(`household.walk.${part}`, { player: nameOf(partnerWalk.playerId, partnerWalk.playerName) ?? '', dog }));
  }

  if (lastMemberJoined && now - lastMemberJoined.at <= HOUSEHOLD_NEWS_WINDOW_MS) {
    lines.push(t('household.joined', { player: nameOf(lastMemberJoined.playerId, lastMemberJoined.playerName) ?? '', dog }));
  }
  return lines;
}

/** One neighbour line worded for display, with the dog it is about (null for the whole-neighbourhood co-op line). */
export interface NeighbourNote {
  /** Stable per event, so a dismissed note stays dismissed. */
  key: string;
  text: string;
  botId: string | null;
  at: number;
}

/** The line text, or null when this app has no copy for the key (a newer server). */
export function wordNeighbourLine(entry: NeighbourLineEntry): string | null {
  if (t(entry.line) === entry.line) return null;
  return t(entry.line, { ...entry.params, bot: entry.botName ?? '' });
}

/**
 * The ONE neighbour note for the fence: the newest line inside the 48 h window that this app can word.
 * Lower priority than partner news (those keep Buddy's speech bubble). Silence is fine.
 */
export function resolveNeighbourNote(neighbourLines: NeighbourLineEntry[] | undefined, now: number): NeighbourNote | null {
  for (const entry of [...(neighbourLines ?? [])].sort((a, b) => b.seq - a.seq)) {
    if (now - entry.at > HOUSEHOLD_NEWS_WINDOW_MS) continue;
    const text = wordNeighbourLine(entry);
    if (text) return { key: `neighbour-${entry.seq}`, text, botId: entry.botId ?? null, at: entry.at };
  }
  return null;
}

/** The last `limit` lines about one dog (newest first) that this app can word; no age limit. */
export function linesAboutBot(neighbourLines: NeighbourLineEntry[] | undefined, botId: string, limit = 2): string[] {
  const out: string[] = [];
  for (const entry of [...(neighbourLines ?? [])].sort((a, b) => b.seq - a.seq)) {
    if (entry.botId !== botId) continue;
    const text = wordNeighbourLine(entry);
    if (text) out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

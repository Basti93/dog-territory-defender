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
  /** Newest first. At most ONE neighbour line is shown per launch, ranked below partner and personal lines. */
  neighbourLines?: NeighbourLineEntry[];
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
  const neighbour = (input.neighbourLines ?? []).find((n) => now - n.at <= HOUSEHOLD_NEWS_WINDOW_MS && t(n.line) !== n.line);
  if (neighbour) lines.push(t(neighbour.line, { ...neighbour.params, bot: neighbour.botName ?? '' }));
  return lines;
}

// Pure helpers for the "Log a walk we missed" manual entry point.
// See openspec/changes/walk-start-notifications/design.md's look-back-window
// decision: a manually-logged walk must have started within the current or
// previous calendar day — not an open-ended backfill.

import { StoredWalk } from '../storage/WalkRepository';

export type MissedWalkTiming = 'today' | 'yesterday';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Approximate startTime for a manually-logged walk — no exact time is collected (zero-friction entry, no free-text date). */
export function startTimeForMissedWalk(timing: MissedWalkTiming, now: number = Date.now()): number {
  return timing === 'today' ? now : now - ONE_DAY_MS;
}

/** Local calendar-day key (year-month-day), used anywhere "which day did this happen on" needs to be compared — e.g. the look-back window below and the per-day reward multiplier in economy/walkRewards.ts. */
export function calendarDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Enforces the look-back-window decision: a manually-logged walk's startTime
 * must fall on today's or yesterday's local calendar date, regardless of
 * exact time-of-day. This is a defense-in-depth check — the UI only offers
 * "Earlier today" / "Yesterday" as options, but this keeps the rule real and
 * testable independent of the UI.
 */
export function isWithinManualLogWindow(startTime: number, now: number = Date.now()): boolean {
  const startKey = calendarDayKey(startTime);
  const todayKey = calendarDayKey(now);
  const yesterdayKey = calendarDayKey(now - ONE_DAY_MS);
  return startKey === todayKey || startKey === yesterdayKey;
}

/**
 * Walks eligible to be picked as a manual-log route refresh target (see
 * openspec/changes/home-range/design.md Decision 4, rule 1: "the cell set
 * of a previously-completed tracked walk, chosen from walk history"). A
 * manual log itself has `locations: []`, so filtering on a non-empty trail
 * is sufficient to exclude prior manual logs without needing to also check
 * `startSource` — kept as an explicit check anyway since it's the more
 * honest statement of intent and doesn't depend on that implementation
 * detail staying true. Most-recent-first, so the picker's default framing
 * favours the walk a player is most likely to actually recognise.
 */
export function eligibleRefreshRoutes(walks: StoredWalk[]): StoredWalk[] {
  return walks
    .filter((w) => w.startSource === 'button' && w.locations.length > 0)
    .sort((a, b) => b.startTime - a.startTime);
}

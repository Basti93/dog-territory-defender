// Pure helpers for the "Log a walk we missed" manual entry point.
// See docs/decisions/2026-08-21-walk-start-notifications.md's look-back-window
// decision: a manually-logged walk must have started within the current or
// previous calendar day — not an open-ended backfill.

import { StoredWalk } from '../storage/WalkRepository';
import { formatDate, t } from '../i18n';

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

/** Local calendar midnight (ms epoch) for the day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Whole local-calendar-day gap between two timestamps (0 = same calendar
 * day, 1 = yesterday vs. today, etc.) — extracted from
 * SomewhereWildCard.tsx's own private day-diff helper
 * (docs/decisions/home-dashboard.md Decision 3) since this file is
 * already the de facto calendar-utilities module in this codebase (see
 * calendarDayKey's own doc comment). Used by SomewhereWildCard's dayPhrase
 * and doorstepSession.ts's session-state resolution — the two places this
 * codebase currently need to answer "how many calendar days back was this."
 */
export function calendarDayGap(earlier: number, later: number): number {
  return Math.round((startOfLocalDay(later) - startOfLocalDay(earlier)) / (24 * 60 * 60 * 1000));
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
 * "Tuesday morning" / "yesterday evening" style phrase for the Walk
 * Portrait's metadata row (docs/decisions/walk-portrait.md Decision
 * 7) — this file is already the de facto calendar-utilities module (see
 * calendarDayKey's own doc comment), so this joins calendarDayKey/
 * startOfLocalDay/calendarDayGap here rather than starting a fifth home for
 * time-related helpers. Hour-bucket boundaries are an implementer-level
 * polish call, not a logged balance threshold.
 */
export function dayAndTimeOfDayPhrase(timestamp: number): string {
  const date = new Date(timestamp);
  const weekday = formatDate(date, { weekday: 'long' });
  const hour = date.getHours();

  let timeOfDay: 'night' | 'morning' | 'afternoon' | 'evening';
  if (hour < 5) {
    timeOfDay = 'night';
  } else if (hour < 12) {
    timeOfDay = 'morning';
  } else if (hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }

  // One key per part of day (not weekday + word) because German compounds
  // them: "Dienstagmorgen".
  return t(`phrase.dayAndTime.${timeOfDay}`, { weekday });
}

/**
 * Walks eligible to be picked as a manual-log route refresh target (see
 * docs/decisions/2026-08-21-home-range.md Decision 4, rule 1: "the cell set
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

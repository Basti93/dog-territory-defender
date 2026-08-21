// Pure helpers for the "Log a walk we missed" manual entry point.
// See openspec/changes/walk-start-notifications/design.md's look-back-window
// decision: a manually-logged walk must have started within the current or
// previous calendar day — not an open-ended backfill.

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

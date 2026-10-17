import { Walk } from '../types';
import { calendarDayKey, startOfLocalDay } from '../utils/manualWalkLog';
import type { NotificationBookkeepingState } from './notificationDecision';
import { t } from '../i18n';

// Pure decision logic for the opt-in daily walk reminder
// (openspec/changes/walk-reminder/design.md). Deliberately has no dependency
// on `expo-notifications` so it stays unit-testable without a native/dev-
// client build — mirrors notificationDecision.ts's own separation of pure
// logic from src/notifications/scheduler.ts's actual OS wiring.
//
// See design.md Decision 7 for the exact single-slot reconciliation this
// implements: every check first resolves whatever day a reminder was last
// scheduled for (if that day has fully passed) before deciding whether to
// schedule a fresh one today.

export function defaultWalkReminderFields(): Pick<
  NotificationBookkeepingState,
  | 'walkReminderEnabled'
  | 'walkReminderHour'
  | 'walkReminderMinute'
  | 'walkReminderConsecutiveIgnores'
  | 'walkReminderPendingDate'
  | 'walkReminderFiredCount'
  | 'walkReminderFollowedCount'
  | 'walkReminderExperimentStartedAt'
> {
  return {
    walkReminderEnabled: false,
    walkReminderHour: null,
    walkReminderMinute: null,
    walkReminderConsecutiveIgnores: 0,
    walkReminderPendingDate: null,
    walkReminderFiredCount: 0,
    walkReminderFollowedCount: 0,
    walkReminderExperimentStartedAt: null,
  };
}

/** Whether any walk (either `startSource`) exists on the given local calendar day. */
export function hasWalkOnDay(walks: Walk[], dayKey: string): boolean {
  return walks.some((walk) => calendarDayKey(walk.startTime) === dayKey);
}

/**
 * Single-slot reconciliation (design.md Decision 7): resolves the previous
 * day a reminder was scheduled for, if that day has fully passed, BEFORE any
 * decision about today is made.
 *
 * - A past pending day with a walk on it resets the ignore streak and counts
 *   as followed, regardless of whether the walk happened before or after the
 *   reminder's set time that day (this codebase has no "was the app already
 *   open" signal to check exact ordering against — see design.md's own
 *   rejection of that finer-grained alternative).
 * - A past pending day with no walk on it increments the ignore streak.
 * - Reaching 3 consecutive ignores turns the reminder off (`walkReminderEnabled
 *   = false`) — no message, no dialog; Settings simply shows it off next time
 *   it's opened.
 * - A day with no reminder ever scheduled for it (pendingDate null) is left
 *   untouched — it never counts toward the streak either way.
 */
export function reconcileWalkReminderIgnoreStreak(
  state: NotificationBookkeepingState,
  now: number,
  walks: Walk[]
): NotificationBookkeepingState {
  if (!state.walkReminderPendingDate) {
    return state;
  }

  const pendingStart = parseCalendarDayKey(state.walkReminderPendingDate);
  const todayStart = startOfLocalDay(now);
  if (pendingStart === null || pendingStart >= todayStart) {
    // Still today (or a future day) — not resolved yet.
    return state;
  }

  // Rolling window: several scheduled days may have passed since the last
  // app open. Resolve each one in order (capped at the window length — no
  // reminders beyond it were ever scheduled). Each resolved day was a
  // scheduled reminder, so it also counts toward the fired total.
  let ignores = state.walkReminderConsecutiveIgnores;
  let followed = state.walkReminderFollowedCount;
  let fired = state.walkReminderFiredCount;
  let enabled = state.walkReminderEnabled;
  const first = new Date(pendingStart);
  for (let i = 0; i < REMINDER_WINDOW_DAYS + 1; i++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    if (day.getTime() >= todayStart) break;
    fired += 1;
    if (hasWalkOnDay(walks, calendarDayKey(day.getTime()))) {
      ignores = 0;
      followed += 1;
    } else {
      ignores += 1;
      if (ignores >= 3) {
        // Auto-sleep (design.md Decision 7): flips the same persisted flag
        // the player's toggle controls, so Settings stays honest.
        enabled = false;
        break;
      }
    }
  }

  return {
    ...state,
    walkReminderPendingDate: null,
    walkReminderConsecutiveIgnores: ignores,
    walkReminderFollowedCount: followed,
    walkReminderFiredCount: fired,
    walkReminderEnabled: enabled,
  };
}

/**
 * Whether today's reminder should be scheduled — call only with an already-
 * reconciled state (i.e. after `reconcileWalkReminderIgnoreStreak`), per
 * design.md Decision 6: enabled, a time has actually been set, and no walk
 * (either `startSource`) exists yet today.
 */
export function shouldScheduleWalkReminderToday(state: NotificationBookkeepingState, now: number, walks: Walk[]): boolean {
  if (!state.walkReminderEnabled) return false;
  if (state.walkReminderHour === null || state.walkReminderMinute === null) return false;
  return !hasWalkOnDay(walks, calendarDayKey(now));
}

/**
 * The bookkeeping update for having just actually scheduled the window (call
 * only once the OS scheduling calls succeeded). Sets the pending date to the
 * first scheduled day, unless an earlier unresolved one is already pending
 * (today's reminder may already have fired). Fired counts are tallied when
 * days are resolved in `reconcileWalkReminderIgnoreStreak`, not here, so
 * re-planning the window on every app open can't inflate them.
 */
export function recordWalkReminderScheduled(state: NotificationBookkeepingState, firstScheduledAt: number): NotificationBookkeepingState {
  return {
    ...state,
    walkReminderPendingDate: state.walkReminderPendingDate ?? calendarDayKey(firstScheduledAt),
  };
}

/** Number of upcoming days a reminder is scheduled for in advance, so it still fires if the app stays closed for days. */
export const REMINDER_WINDOW_DAYS = 7;

/**
 * Pure planner for the rolling reminder window (design.md 2026-10-18
 * decision). Returns one local Date per day at hour:minute for the next
 * `days` calendar days starting today; today is skipped if a walk already
 * happened or the time has passed, in which case the window extends one day
 * so there are still `days` pending reminders. Dates are built from local calendar
 * fields (not +24h arithmetic) so DST changes can't shift the clock time.
 */
export function planReminderDates(now: number, hour: number, minute: number, walkedToday: boolean, days: number = REMINDER_WINDOW_DAYS): Date[] {
  const base = new Date(now);
  const dates: Date[] = [];
  // Always `days` entries: skipping today extends the window by one day.
  for (let i = 0; dates.length < days; i++) {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, hour, minute, 0, 0);
    if (i === 0 && (walkedToday || date.getTime() <= now)) continue;
    dates.push(date);
  }
  return dates;
}

/** Zero-padded local 'YYYY-MM-DD' for notification `data.day` and identifiers. */
export function reminderDayLabel(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// Inverse of calendarDayKey ('YYYY-M-D', month 0-based) -> local midnight ms.
function parseCalendarDayKey(key: string): number | null {
  const [y, m, d] = key.split('-').map(Number);
  if ([y, m, d].some((n) => Number.isNaN(n))) return null;
  return new Date(y, m, d).getTime();
}

// Approved copy (proposal.md's Open Questions, resolved 2026-08-22; design.md
// Decision 11), reused verbatim — not to be rephrased. Checked against the
// rejected-copy table: no order, no guilt mascot, no loss-framed number, no
// invented urgency.
export function walkReminderBody(): string {
  return t('notification.walkReminder.body');
}

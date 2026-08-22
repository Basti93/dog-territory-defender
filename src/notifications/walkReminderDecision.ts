import { Walk } from '../types';
import { calendarDayKey } from '../utils/manualWalkLog';
import type { NotificationBookkeepingState } from './notificationDecision';

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

  const todayKey = calendarDayKey(now);
  if (state.walkReminderPendingDate === todayKey) {
    // Still the same day the reminder was scheduled for — not resolved yet.
    return state;
  }

  const walked = hasWalkOnDay(walks, state.walkReminderPendingDate);
  const nextConsecutiveIgnores = walked ? 0 : state.walkReminderConsecutiveIgnores + 1;

  return {
    ...state,
    walkReminderPendingDate: null,
    walkReminderConsecutiveIgnores: nextConsecutiveIgnores,
    walkReminderFollowedCount: walked ? state.walkReminderFollowedCount + 1 : state.walkReminderFollowedCount,
    // Auto-sleep (design.md Decision 7): flips the same persisted flag the
    // player's manual toggle controls, so Settings stays honest — never a
    // separate silent bypass that leaves the toggle visually "on".
    walkReminderEnabled: nextConsecutiveIgnores >= 3 ? false : state.walkReminderEnabled,
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
 * The bookkeeping update for having just actually scheduled today's reminder
 * (design.md Decision 7, step 2) — call only once the OS scheduling call
 * itself has succeeded (see walkReminder.ts's checkAndScheduleWalkReminder),
 * never speculatively, so a denied-permission or failed schedule doesn't
 * falsely count toward the 4-week fired total or the ignore streak.
 */
export function recordWalkReminderScheduled(state: NotificationBookkeepingState, now: number): NotificationBookkeepingState {
  return {
    ...state,
    walkReminderPendingDate: calendarDayKey(now),
    walkReminderFiredCount: state.walkReminderFiredCount + 1,
  };
}

// Approved copy (proposal.md's Open Questions, resolved 2026-08-22; design.md
// Decision 11), reused verbatim — not to be rephrased. Checked against the
// rejected-copy table: no order, no guilt mascot, no loss-framed number, no
// invented urgency.
export const WALK_REMINDER_BODY = "There's a little more territory out there, whenever you two are ready for it.";

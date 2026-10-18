import { Walk } from '../types';
import { calendarDayKey, startOfLocalDay } from '../utils/manualWalkLog';
import type { NotificationBookkeepingState } from './notificationDecision';
import { t } from '../i18n';

// Pure decision logic for the opt-in daily walk reminder
// (docs/decisions/walk-reminder.md). Deliberately has no dependency
// on `expo-notifications` so it stays unit-testable without a native/dev-
// client build — mirrors notificationDecision.ts's own separation of pure
// logic from src/notifications/scheduler.ts's actual OS wiring.
//
// See design.md Decision 7 for the exact single-slot reconciliation this
// implements: every check first resolves whatever day a reminder was last
// scheduled for (if that day has fully passed) before deciding whether to
// schedule a fresh one today.

export type ReminderSlotId = 'morning' | 'noon' | 'evening';

export interface ReminderSlot {
  id: ReminderSlotId;
  enabled: boolean;
  hour: number;
  minute: number;
  /** Consecutive days this slot's reminder was followed by no walk in its window; 3 turns the slot off silently. Absent = 0. */
  consecutiveIgnores?: number;
  /** Local ISO day ('YYYY-MM-DD') the slot was last switched on; reconcile never counts earlier days. Absent = no lower bound. */
  enabledSince?: string;
}

export const REMINDER_SLOT_IDS: ReminderSlotId[] = ['morning', 'noon', 'evening'];

const SLOT_DEFAULT_TIMES: Record<ReminderSlotId, { hour: number; minute: number }> = {
  morning: { hour: 8, minute: 0 },
  noon: { hour: 13, minute: 0 },
  evening: { hour: 18, minute: 30 },
};

/** All three slots, off, at their default times. */
export function defaultReminderSlots(): ReminderSlot[] {
  return REMINDER_SLOT_IDS.map((id) => ({ id, enabled: false, ...SLOT_DEFAULT_TIMES[id], consecutiveIgnores: 0 }));
}

/**
 * Migration from the single-time reminder (walkReminderEnabled/Hour/Minute):
 * the old time lands in the slot it fits (before 11:00 morning, 11:00-15:59
 * noon, else evening) keeping its enabled flag; the others stay off at their
 * defaults. A never-set time (null) yields all defaults.
 */
export function migrateLegacyReminderToSlots(
  enabled: boolean,
  hour: number | null,
  minute: number | null,
  migrationDay: Date = new Date()
): ReminderSlot[] {
  const slots = defaultReminderSlots();
  if (hour === null || minute === null) return slots;
  const id: ReminderSlotId = hour < 11 ? 'morning' : hour < 16 ? 'noon' : 'evening';
  // An enabled legacy reminder counts from the migration day on (no history before it).
  return slots.map((slot) =>
    slot.id === id ? { ...slot, enabled, hour, minute, ...(enabled ? { enabledSince: reminderDayLabel(migrationDay) } : {}) } : slot
  );
}

export function isAnyReminderEnabled(slots: ReminderSlot[]): boolean {
  return slots.some((slot) => slot.enabled);
}

export function defaultWalkReminderFields(): Pick<
  NotificationBookkeepingState,
  | 'reminderSlots'
  | 'walkReminderPendingDate'
  | 'walkReminderFiredCount'
  | 'walkReminderFollowedCount'
  | 'walkReminderExperimentStartedAt'
> {
  return {
    reminderSlots: defaultReminderSlots(),
    walkReminderPendingDate: null,
    walkReminderFiredCount: 0,
    walkReminderFollowedCount: 0,
    walkReminderExperimentStartedAt: null,
  };
}

function slotMinuteOfDay(slot: ReminderSlot): number {
  return slot.hour * 60 + slot.minute;
}

/**
 * The window of "its" walk for a slot on a given local day (design.md
 * 2026-10-18): from the previous ENABLED slot's time that day (00:00 for the
 * first) up to this slot's time. [start, end) in ms. Null if the slot is off.
 */
export function slotWindow(slots: ReminderSlot[], slotId: ReminderSlotId, day: Date): { start: number; end: number } | null {
  const enabled = slots.filter((s) => s.enabled).sort((a, b) => slotMinuteOfDay(a) - slotMinuteOfDay(b));
  const index = enabled.findIndex((s) => s.id === slotId);
  if (index === -1) return null;
  const at = (s: ReminderSlot) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.hour, s.minute, 0, 0).getTime();
  const start = index === 0 ? new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() : at(enabled[index - 1]);
  return { start, end: at(enabled[index]) };
}

/**
 * A manual log made for "earlier today" has no real start time (it is stamped
 * with the moment of logging), so it is credited to the WHOLE day: it counts
 * as a walk in every window of that day.
 */
function isManualLogOnDay(walk: Walk, day: Date): boolean {
  return walk.startSource === 'manual-log' && calendarDayKey(walk.startTime) === calendarDayKey(day.getTime());
}

/**
 * Planner rule (a): whether a walk (tracked or manual) STARTED inside the
 * slot's pre-reminder window [previous enabled slot, slot) on that day — then
 * no reminder is needed (or was ever scheduled) for the slot that day.
 */
export function hasWalkInSlotWindow(walks: Walk[], slots: ReminderSlot[], slotId: ReminderSlotId, day: Date): boolean {
  const window = slotWindow(slots, slotId, day);
  if (!window) return false;
  return walks.some((walk) => isManualLogOnDay(walk, day) || (walk.startTime >= window.start && walk.startTime < window.end));
}

/**
 * Reconcile rule (b): a FIRED slot counts as followed when a walk STARTED in
 * [slot time, next enabled slot time that day, or 23:59:59]. Null if the slot is off.
 */
export function followWindow(slots: ReminderSlot[], slotId: ReminderSlotId, day: Date): { start: number; end: number } | null {
  const enabled = slots.filter((s) => s.enabled).sort((a, b) => slotMinuteOfDay(a) - slotMinuteOfDay(b));
  const index = enabled.findIndex((s) => s.id === slotId);
  if (index === -1) return null;
  const at = (s: ReminderSlot) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.hour, s.minute, 0, 0).getTime();
  const end =
    index === enabled.length - 1
      ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).getTime()
      : at(enabled[index + 1]) - 1;
  return { start: at(enabled[index]), end };
}

export function hasWalkInFollowWindow(walks: Walk[], slots: ReminderSlot[], slotId: ReminderSlotId, day: Date): boolean {
  const window = followWindow(slots, slotId, day);
  if (!window) return false;
  return walks.some((walk) => isManualLogOnDay(walk, day) || (walk.startTime >= window.start && walk.startTime <= window.end));
}

/** Whether any walk (either `startSource`) exists on the given local calendar day. */
export function hasWalkOnDay(walks: Walk[], dayKey: string): boolean {
  return walks.some((walk) => calendarDayKey(walk.startTime) === dayKey);
}

/**
 * Per-slot reconciliation (design.md Decision 7, extended by the 2026-10-18
 * slots decision): resolves every scheduled day that has fully passed, for
 * each enabled slot, BEFORE any decision about today is made.
 *
 * - Only days >= the slot's `enabledSince` and < today are counted; a day
 *   whose pre-reminder window already held a walk was never scheduled
 *   (planner rule) and is skipped too.
 * - A fired slot-day with a walk STARTED in [slot time, next enabled slot or
 *   end of day] resets that slot's ignore streak and counts as followed.
 * - A fired slot-day without one increments that slot's streak; at 3 the slot is
 *   switched off silently (no message) and not evaluated for later days.
 * - Windows use the slots' CURRENT times (a time edited mid-window is
 *   approximated, not tracked historically).
 * - pendingDate null = nothing was ever scheduled; left untouched.
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

  const originalSlots = state.reminderSlots;
  const resolved: ReminderSlot[] = originalSlots.map((s) => ({ ...s }));
  let followed = state.walkReminderFollowedCount;
  let fired = state.walkReminderFiredCount;
  const first = new Date(pendingStart);
  // Capped at the window length: no reminders beyond it were ever scheduled.
  for (let i = 0; i < REMINDER_WINDOW_DAYS + 1; i++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    if (day.getTime() >= todayStart) break;
    const dayLabel = reminderDayLabel(day);
    for (const slot of resolved) {
      if (!slot.enabled) continue;
      // Never scheduled for days before the slot was switched on ...
      if (slot.enabledSince && dayLabel < slot.enabledSince) continue;
      // ... nor for a day whose pre-reminder window already held a walk (the planner skipped it).
      if (hasWalkInSlotWindow(walks, originalSlots, slot.id, day)) continue;
      fired += 1;
      if (hasWalkInFollowWindow(walks, originalSlots, slot.id, day)) {
        slot.consecutiveIgnores = 0;
        followed += 1;
      } else {
        slot.consecutiveIgnores = (slot.consecutiveIgnores ?? 0) + 1;
        if (slot.consecutiveIgnores >= 3) {
          // Auto-sleep: flips the same persisted flag the switch controls.
          slot.enabled = false;
        }
      }
    }
  }

  return {
    ...state,
    reminderSlots: resolved,
    walkReminderPendingDate: null,
    walkReminderFollowedCount: followed,
    walkReminderFiredCount: fired,
  };
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

export interface PlannedReminder {
  date: Date;
  slotId: ReminderSlotId;
}

/**
 * Pure planner for the rolling reminder window (design.md 2026-10-18
 * decisions). For EACH enabled slot returns `days` future reminders, one per
 * local calendar day at the slot's time. Today is skipped for a slot when its
 * time has passed or a walk (in `walksToday`) started inside the slot's
 * window; skipping extends the window one day so a slot always has `days`
 * pending reminders. Dates use local calendar fields (not +24h arithmetic) so
 * DST can't shift the clock time. Sorted by date.
 */
export function planReminderDates(now: number, slots: ReminderSlot[], walksToday: Walk[], days: number = REMINDER_WINDOW_DAYS): PlannedReminder[] {
  const base = new Date(now);
  const planned: PlannedReminder[] = [];
  for (const slot of slots) {
    if (!slot.enabled) continue;
    let count = 0;
    for (let i = 0; count < days; i++) {
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, slot.hour, slot.minute, 0, 0);
      if (i === 0 && (date.getTime() <= now || hasWalkInSlotWindow(walksToday, slots, slot.id, base))) continue;
      planned.push({ date, slotId: slot.id });
      count += 1;
    }
  }
  return planned.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Notification identifier for one slot on one day. */
export function reminderIdentifier(date: Date, slotId: ReminderSlotId): string {
  return `walk-reminder-${reminderDayLabel(date)}-${slotId}`;
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

/** Slot-specific title ("Morning walk?" etc.); the body stays the approved warm copy. */
export function walkReminderTitle(slotId: ReminderSlotId): string {
  return t(`notification.walkReminder.title.${slotId}`);
}

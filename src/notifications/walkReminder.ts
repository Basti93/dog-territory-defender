import { Walk } from '../types';
import { NotificationRepository } from '../storage/NotificationRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { calendarDayKey } from '../utils/manualWalkLog';
import { log } from '../utils/log';
import {
  reconcileWalkReminderIgnoreStreak,
  recordWalkReminderScheduled,
  isAnyReminderEnabled,
  planReminderDates,
  reminderDayLabel,
  ReminderSlot,
  ReminderSlotId,
} from './walkReminderDecision';
import { cancelScheduledWalkReminder, requestNotificationPermission, scheduleWalkReminderWindow } from './scheduler';

export interface WalkReminderDeps {
  walkRepository: WalkRepository;
  notificationRepository: NotificationRepository;
}

// Single promise-chain mutex: every state-changing reminder operation runs one
// after another, so quick toggles and overlapping replans can't interleave
// (and resurrect reminders another call just cancelled). Each operation reads
// the latest state INSIDE the chain.
let chain: Promise<unknown> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Persists one slot's change and replans, atomically w.r.t. other reminder
 * operations. A manual change restarts that slot's ignore streak; switching a
 * slot on stamps `enabledSince` with today. Returns the saved slots.
 */
export function updateReminderSlot(
  deps: WalkReminderDeps,
  slotId: ReminderSlotId,
  patch: Partial<ReminderSlot>,
  now: number = Date.now()
): Promise<ReminderSlot[]> {
  return runExclusive(async () => {
    const current = await deps.notificationRepository.getState();
    const reminderSlots = current.reminderSlots.map((slot) => {
      if (slot.id !== slotId) return slot;
      const next = { ...slot, ...patch, consecutiveIgnores: 0 };
      if (patch.enabled && !slot.enabled) next.enabledSince = reminderDayLabel(new Date(now));
      return next;
    });
    await deps.notificationRepository.saveState({
      ...current,
      reminderSlots,
      // Set once, the first time any slot is ever turned on (design.md Decision 3).
      walkReminderExperimentStartedAt: patch.enabled ? current.walkReminderExperimentStartedAt ?? now : current.walkReminderExperimentStartedAt,
    });
    await replan(deps, now, []);
    return reminderSlots;
  });
}

/**
 * Recomputes and (re)schedules the opt-in daily walk reminder
 * (openspec/changes/walk-reminder/design.md). Call this at the three points
 * Decision 4 names: the app's merged mount effect, right after a tracked
 * walk finishes, and right after a walk is manually logged — not a single
 * always-on OS-repeating trigger (there's no backend to wake the app while
 * it's closed, so rescheduling on every one of these real events is the
 * honest limit of what's checkable, same as `checkAndScheduleEarnedTrigger
 * Notification`'s own doc comment already states for the overflow
 * notification).
 *
 * Always cancels any previously-scheduled reminder first (Decision 5, scoped
 * to this feature's own notification only), then reconciles yesterday's
 * outcome (Decision 7) before deciding whether to schedule today's.
 */
/**
 * `extraWalks` are walks not yet in the repository (a tracked walk that just
 * started), so a reminder doesn't fire in the middle of it.
 */
export function checkAndScheduleWalkReminder(deps: WalkReminderDeps, now: number = Date.now(), extraWalks: Walk[] = []): Promise<void> {
  return runExclusive(() => replan(deps, now, extraWalks));
}

async function replan(deps: WalkReminderDeps, now: number, extraWalks: Walk[]): Promise<void> {
  const { walkRepository, notificationRepository } = deps;

  const [state, storedWalks] = await Promise.all([notificationRepository.getState(), walkRepository.getWalks()]);
  const walks = [...storedWalks, ...extraWalks];

  const reconciled = reconcileWalkReminderIgnoreStreak(state, now, walks);
  if (reconciled !== state) {
    await notificationRepository.saveState(reconciled);

    if (reconciled.walkReminderFollowedCount > state.walkReminderFollowedCount) {
      log('WALK_REMINDER_FOLLOWED', { pendingDate: state.walkReminderPendingDate });
    } else {
      log('WALK_REMINDER_IGNORED', { pendingDate: state.walkReminderPendingDate });
    }
    for (const slot of reconciled.reminderSlots) {
      const before = state.reminderSlots.find((s) => s.id === slot.id);
      if (before?.enabled && !slot.enabled) {
        log('WALK_REMINDER_AUTO_SLEEP', { slot: slot.id });
      }
    }
  }

  // Cancel before deciding whether to schedule again — a player who just
  // disabled the reminder, changed their set time, or already walked today
  // must never be left with a stale scheduled notification (Decision 5).
  await cancelScheduledWalkReminder();

  // Rolling window: schedule the next REMINDER_WINDOW_DAYS days at once, so
  // reminders still fire if the app stays closed for days (no backend). Every
  // app open / saved walk replans the whole window from scratch.
  if (!isAnyReminderEnabled(reconciled.reminderSlots)) {
    return;
  }
  const todayKey = calendarDayKey(now);
  const walksToday = walks.filter((walk) => calendarDayKey(walk.startTime) === todayKey);
  const entries = planReminderDates(now, reconciled.reminderSlots, walksToday);
  if (entries.length === 0) {
    return;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    log('NOTIFICATION_PERMISSION_DENIED', { context: 'walk-reminder' });
    return;
  }

  await scheduleWalkReminderWindow(entries);
  await notificationRepository.saveState(recordWalkReminderScheduled(reconciled, entries[0].date.getTime()));
}

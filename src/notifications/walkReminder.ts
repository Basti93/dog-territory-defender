import { NotificationRepository } from '../storage/NotificationRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { calendarDayKey } from '../utils/manualWalkLog';
import { log } from '../utils/log';
import {
  reconcileWalkReminderIgnoreStreak,
  recordWalkReminderScheduled,
  hasWalkOnDay,
  planReminderDates,
  walkReminderBody,
} from './walkReminderDecision';
import { cancelScheduledWalkReminder, requestNotificationPermission, scheduleWalkReminderWindow } from './scheduler';

export interface WalkReminderDeps {
  walkRepository: WalkRepository;
  notificationRepository: NotificationRepository;
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
export async function checkAndScheduleWalkReminder(deps: WalkReminderDeps, now: number = Date.now()): Promise<void> {
  const { walkRepository, notificationRepository } = deps;

  const [state, walks] = await Promise.all([notificationRepository.getState(), walkRepository.getWalks()]);

  const reconciled = reconcileWalkReminderIgnoreStreak(state, now, walks);
  if (reconciled !== state) {
    await notificationRepository.saveState(reconciled);

    if (reconciled.walkReminderFollowedCount > state.walkReminderFollowedCount) {
      log('WALK_REMINDER_FOLLOWED', { pendingDate: state.walkReminderPendingDate });
    } else if (reconciled.walkReminderConsecutiveIgnores > state.walkReminderConsecutiveIgnores) {
      log('WALK_REMINDER_IGNORED', { pendingDate: state.walkReminderPendingDate, consecutiveIgnores: reconciled.walkReminderConsecutiveIgnores });
    }
    if (state.walkReminderEnabled && !reconciled.walkReminderEnabled) {
      log('WALK_REMINDER_AUTO_SLEEP', { consecutiveIgnores: reconciled.walkReminderConsecutiveIgnores });
    }
  }

  // Cancel before deciding whether to schedule again — a player who just
  // disabled the reminder, changed their set time, or already walked today
  // must never be left with a stale scheduled notification (Decision 5).
  await cancelScheduledWalkReminder();

  // Rolling window: schedule the next REMINDER_WINDOW_DAYS days at once, so
  // reminders still fire if the app stays closed for days (no backend). Every
  // app open / saved walk replans the whole window from scratch.
  if (!reconciled.walkReminderEnabled || reconciled.walkReminderHour === null || reconciled.walkReminderMinute === null) {
    return;
  }
  const walkedToday = hasWalkOnDay(walks, calendarDayKey(now));
  const dates = planReminderDates(now, reconciled.walkReminderHour, reconciled.walkReminderMinute, walkedToday);
  if (dates.length === 0) {
    return;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    log('NOTIFICATION_PERMISSION_DENIED', { context: 'walk-reminder' });
    return;
  }

  await scheduleWalkReminderWindow(dates, walkReminderBody());
  await notificationRepository.saveState(recordWalkReminderScheduled(reconciled, dates[0].getTime()));
}

import * as Notifications from 'expo-notifications';

import { log } from '../utils/log';
import { TimeOfDayBucket } from './notificationDecision';

// The actual expo-notifications wiring — permission request + scheduling.
// Deliberately kept separate from notificationDecision.ts's pure logic so
// that logic stays unit-testable without a native/dev-client build (see
// tasks.md 5.2: OS-level permission/delivery isn't automatable in this
// project's jest setup — covered by manual on-device verification instead).

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Coarse delivery clock times per learned bucket — a first-pass numeric
// threshold, not empirically tuned. Logged per project convention in
// design.md's Decisions section.
const BUCKET_HOUR: Record<TimeOfDayBucket, number> = {
  morning: 8,
  midday: 13,
  evening: 19,
};

export const DEN_OVERFLOW_NOTIFICATION_DATA = { type: 'den-overflow' } as const;
export const WALK_REMINDER_NOTIFICATION_DATA = { type: 'walk-reminder' } as const;

// Generalized from the original hour-only version (openspec/changes/
// walk-reminder/tasks.md task 3.1) to also support the player's own
// minute-precision reminder time — scheduleOverflowNotification below still
// passes 0 minutes, so its own behavior is unchanged.
function nextOccurrenceOfTime(hour: number, minute: number, now: Date = new Date()): Date {
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

/**
 * Requests OS notification permission — call only at the point a
 * notification is actually about to be scheduled (lazy, per design.md),
 * never at app launch. Returns whether permission is granted; a decline is
 * not an error — callers should fail silently, not retry-nag.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    return true;
  }
  const result = await Notifications.requestPermissionsAsync();
  log('NOTIFICATION_PERMISSION', { status: result.status, granted: result.granted });
  return result.granted;
}

/** Schedules a single one-shot local notification at the next occurrence of the given bucket's clock time. */
export async function scheduleOverflowNotification(bucket: TimeOfDayBucket, body: string): Promise<void> {
  const date = nextOccurrenceOfTime(BUCKET_HOUR[bucket], 0);
  await Notifications.scheduleNotificationAsync({
    content: { body, data: DEN_OVERFLOW_NOTIFICATION_DATA },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  log('NOTIFICATION_SCHEDULED', { bucket, at: date.toISOString() });
}

/**
 * Schedules a single one-shot local walk-reminder notification at the next
 * occurrence of the player's own set hour/minute (openspec/changes/
 * walk-reminder/design.md Decision 4) — same one-shot `DATE`-trigger shape as
 * `scheduleOverflowNotification` above, reusing the existing
 * `expo-notifications` wiring rather than a second scheduling mechanism.
 */
export async function scheduleWalkReminderNotification(hour: number, minute: number, body: string, now: Date = new Date()): Promise<void> {
  const date = nextOccurrenceOfTime(hour, minute, now);
  await Notifications.scheduleNotificationAsync({
    content: { body, data: WALK_REMINDER_NOTIFICATION_DATA },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  log('WALK_REMINDER_SCHEDULED', { hour, minute, at: date.toISOString() });
}

/**
 * Cancels this feature's own pending scheduled notification only
 * (openspec/changes/walk-reminder/design.md Decision 5) — deliberately never
 * `cancelAllScheduledNotificationsAsync()`, which would also cancel a still-
 * pending Den-overflow notification sharing the same OS scheduling queue.
 */
export async function cancelScheduledWalkReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter((n) => n.content.data?.type === WALK_REMINDER_NOTIFICATION_DATA.type);
  await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

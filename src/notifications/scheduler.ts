import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { log } from '../utils/log';
import { TimeOfDayBucket } from './notificationDecision';
import { reminderDayLabel } from './walkReminderDecision';
import { t } from '../i18n';

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
export const WALK_REMINDER_NOTIFICATION_DATA = { type: 'walk-reminder', kind: 'walk-reminder' } as const;

export const WALK_REMINDER_CHANNEL_ID = 'walk-reminder';
export const DEN_OVERFLOW_CHANNEL_ID = 'den-overflow';
const WALK_REMINDER_ID_PREFIX = 'walk-reminder-';

/**
 * Android only, idempotent: creates the notification channels before any
 * schedule or permission request (Android 13+ won't even show the
 * permission prompt until a channel exists). DEFAULT importance = audible
 * but not a heads-up interruption. No-op on iOS.
 */
export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(WALK_REMINDER_CHANNEL_ID, {
    name: t('notification.channel.walkReminder'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(DEN_OVERFLOW_CHANNEL_ID, {
    name: t('notification.channel.den'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

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
  await ensureAndroidChannels();
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
  await ensureAndroidChannels();
  const date = nextOccurrenceOfTime(BUCKET_HOUR[bucket], 0);
  await Notifications.scheduleNotificationAsync({
    content: { body, data: DEN_OVERFLOW_NOTIFICATION_DATA },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: DEN_OVERFLOW_CHANNEL_ID },
  });
  log('NOTIFICATION_SCHEDULED', { bucket, at: date.toISOString() });
}

/**
 * Schedules one one-shot walk-reminder per given date (the rolling window
 * from `planReminderDates`). Each gets a stable identifier
 * `walk-reminder-YYYY-MM-DD` and `data.kind === 'walk-reminder'` so it can be
 * found and cancelled without touching the Den-overflow notification.
 */
export async function scheduleWalkReminderWindow(dates: Date[], body: string): Promise<void> {
  await ensureAndroidChannels();
  for (const date of dates) {
    const day = reminderDayLabel(date);
    await Notifications.scheduleNotificationAsync({
      identifier: `${WALK_REMINDER_ID_PREFIX}${day}`,
      content: { body, data: { ...WALK_REMINDER_NOTIFICATION_DATA, day } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: WALK_REMINDER_CHANNEL_ID },
    });
  }
  log('WALK_REMINDER_SCHEDULED', { count: dates.length, days: dates.map(reminderDayLabel) });
}

/**
 * Cancels this feature's own pending scheduled notification only
 * (openspec/changes/walk-reminder/design.md Decision 5) — deliberately never
 * `cancelAllScheduledNotificationsAsync()`, which would also cancel a still-
 * pending Den-overflow notification sharing the same OS scheduling queue.
 */
export async function cancelScheduledWalkReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ours = scheduled.filter(
    (n) =>
      n.content.data?.kind === WALK_REMINDER_NOTIFICATION_DATA.kind ||
      n.content.data?.type === WALK_REMINDER_NOTIFICATION_DATA.type ||
      n.identifier.startsWith(WALK_REMINDER_ID_PREFIX)
  );
  await Promise.all(ours.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

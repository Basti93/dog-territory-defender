import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { log } from '../utils/log';
import { TimeOfDayBucket } from './notificationDecision';
import { PlannedReminder, reminderDayLabel, reminderIdentifier, walkReminderBody, walkReminderTitle } from './walkReminderDecision';
import { t } from '../i18n';
import { dogDisplayName } from '../economy/denEconomy';

// The actual expo-notifications wiring — permission request + scheduling.
// Deliberately kept separate from notificationDecision.ts's pure logic so
// that logic stays unit-testable without a native/dev-client build (see
// tasks.md 5.2: OS-level permission/delivery isn't automatable in this
// project's jest setup — covered by manual on-device verification instead).

// Foreground handler. Both kinds of notification show as a banner + in the
// list even while the app is open (a player testing a reminder with the app
// in front would otherwise see nothing and conclude it is broken). Only walk
// reminders play a sound in the foreground, mirroring their channel's
// audible DEFAULT importance; the Den overflow hint stays silent as before.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: ['walk-reminder', 'walk-reminder-test', 'walk-ended'].includes(String(notification.request.content.data?.type)),
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

export const WALK_ENDED_NOTIFICATION_DATA = { type: 'walk-ended' } as const;
export const WALK_ENDED_CHANNEL_ID = 'walk-ended';
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
  await Notifications.setNotificationChannelAsync(WALK_ENDED_CHANNEL_ID, {
    name: t('notification.channel.walkEnded'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(DEN_OVERFLOW_CHANNEL_ID, {
    name: t('notification.channel.den'),
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

// Generalized from the original hour-only version (docs/decisions/
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
 * Schedules one one-shot walk-reminder per planned entry (the rolling window
 * from `planReminderDates`, one per enabled slot per day). Each gets a stable
 * identifier `walk-reminder-YYYY-MM-DD-<slotId>` and `data.kind ===
 * 'walk-reminder'` so it can be found and cancelled without touching the
 * Den-overflow notification. Every schedule is logged (identifier + trigger
 * date) so the Debug Log shows exactly what the OS was handed.
 */
export async function scheduleWalkReminderWindow(entries: PlannedReminder[]): Promise<void> {
  await ensureAndroidChannels();
  for (const { date, slotId } of entries) {
    const day = reminderDayLabel(date);
    const identifier = reminderIdentifier(date, slotId);
    const at = date.toISOString();
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: walkReminderTitle(slotId),
        body: walkReminderBody(),
        data: { ...WALK_REMINDER_NOTIFICATION_DATA, day, slot: slotId, at },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: WALK_REMINDER_CHANNEL_ID },
    });
    log('WALK_REMINDER_SCHEDULED_ONE', { identifier, at });
  }
  log('WALK_REMINDER_SCHEDULED', { count: entries.length });
}

const TEST_REMINDER_IDENTIFIER = 'reminder-test';

/**
 * Settings diagnostics: fires a real reminder (same channel, title and body)
 * 5 seconds from now. Tagged `walk-reminder-test` (not `walk-reminder`) so
 * the replanner never cancels it and it doesn't count as "planned".
 * Returns false when permission was not granted.
 */
export async function scheduleTestReminder(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;
  const date = new Date(Date.now() + 5000);
  await Notifications.scheduleNotificationAsync({
    identifier: TEST_REMINDER_IDENTIFIER,
    content: { title: walkReminderTitle('evening'), body: walkReminderBody(), data: { type: 'walk-reminder-test' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: WALK_REMINDER_CHANNEL_ID },
  });
  log('WALK_REMINDER_TEST_SCHEDULED', { identifier: TEST_REMINDER_IDENTIFIER, at: date.toISOString() });
  return true;
}

export interface ReminderDiagnostics {
  permission: 'granted' | 'denied' | 'undetermined';
  planned: number;
  /** Earliest pending walk-reminder trigger, or null. */
  next: Date | null;
}

/** Read-only snapshot of what the OS currently holds, for the Settings diagnostics block. */
export async function getReminderDiagnostics(): Promise<ReminderDiagnostics> {
  const [perm, scheduled] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  const ours = scheduled.filter((n) => n.content.data?.kind === WALK_REMINDER_NOTIFICATION_DATA.kind);
  const times = ours
    .map((n) => {
      // `data.at` is ours and platform-independent; trigger shapes differ per OS.
      const at = typeof n.content.data?.at === 'string' ? Date.parse(n.content.data.at) : NaN;
      if (!Number.isNaN(at)) return at;
      const trigger = n.trigger as { value?: number; date?: number } | null;
      return trigger?.value ?? trigger?.date ?? NaN;
    })
    .filter((ms) => !Number.isNaN(ms));
  return {
    permission: perm.granted ? 'granted' : perm.canAskAgain === false || perm.status === 'denied' ? 'denied' : 'undetermined',
    planned: ours.length,
    next: times.length > 0 ? new Date(Math.min(...times)) : null,
  };
}

/**
 * Cancels this feature's own pending scheduled notification only
 * (docs/decisions/walk-reminder.md Decision 5) — deliberately never
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

/**
 * Immediate notification "Runde beendet" after an auto-finished walk. Never asks
 * for permission (nobody is looking at the phone): returns false when it is not
 * already granted.
 */
export async function scheduleWalkEndedNotification(dogName: string | null): Promise<boolean> {
  await ensureAndroidChannels();
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('notification.walkEnded.title'),
      body: t('notification.walkEnded.body', { dog: dogDisplayName(dogName) }),
      data: WALK_ENDED_NOTIFICATION_DATA,
    },
    trigger: { channelId: WALK_ENDED_CHANNEL_ID },
  });
  log('WALK_ENDED_NOTIFICATION_SENT');
  return true;
}

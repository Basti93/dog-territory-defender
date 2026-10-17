import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDebugLogText, getDebugLogCount, clearDebugLog } from '../utils/debugLog';
import * as Notifications from 'expo-notifications';
import { NotificationRepository } from '../storage/NotificationRepository';
import { Button, Card, Header, palette, radii, Screen, spacing, textStyle } from '../ui';

interface DebugLogScreenProps {
  onClose: () => void;
  /** For the walk-reminder 4-week measurement summary below (openspec/changes/walk-reminder/design.md Decision 10) — read directly, not derived from the general-purpose log text below, so a "Clear Log" tap can never destroy this experiment's own record. */
  notificationRepository: NotificationRepository;
}

interface WalkReminderSummary {
  startedAt: number;
  firedCount: number;
  followedCount: number;
}

export function DebugLogScreen({ onClose, notificationRepository }: DebugLogScreenProps) {
  const [count, setCount] = useState<number | null>(null);
  const [preview, setPreview] = useState('');
  const [walkReminderSummary, setWalkReminderSummary] = useState<WalkReminderSummary | null>(null);

  const [pendingReminders, setPendingReminders] = useState<string[] | null>(null);

  const refresh = useCallback(() => {
    // Pending rolling-window reminders straight from the OS, to verify on device.
    Notifications.getAllScheduledNotificationsAsync()
      .then((all) =>
        setPendingReminders(
          all
            .filter((n) => n.content.data?.kind === 'walk-reminder' || n.content.data?.type === 'walk-reminder')
            .map((n) => {
              const t = n.trigger as { value?: number; date?: number } | null;
              const when = t?.value ?? t?.date;
              return when ? new Date(when).toLocaleString() : String(n.content.data?.day ?? n.identifier);
            })
            .sort()
        )
      )
      .catch(() => setPendingReminders([]));
    getDebugLogCount().then(setCount);
    getDebugLogText().then((text) => {
      const lines = text.split('\n');
      setPreview(lines.slice(-50).join('\n'));
    });
    // Shown only once the reminder has ever been turned on (Decision 10) —
    // never shown, not shown as zeroes, before that first opt-in.
    notificationRepository.getState().then((state) => {
      setWalkReminderSummary(
        state.walkReminderExperimentStartedAt === null
          ? null
          : {
              startedAt: state.walkReminderExperimentStartedAt,
              firedCount: state.walkReminderFiredCount,
              followedCount: state.walkReminderFollowedCount,
            }
      );
    });
  }, [notificationRepository]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleShare = async () => {
    const text = await getDebugLogText();
    if (!text) {
      Alert.alert('Nothing to share', 'The debug log is empty.');
      return;
    }
    const file = new File(Paths.cache, `dog-territory-debug-log-${Date.now()}.txt`);
    file.create();
    file.write(text);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
    } else {
      Alert.alert('Sharing not available', `Log saved to ${file.uri}`);
    }
  };

  const handleClear = () => {
    Alert.alert('Clear debug log?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearDebugLog();
          refresh();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Header title="Debug Log" icon="icon-den" onBack={onClose} />

      <View style={styles.actions}>
        <Button label="Share" variant="secondary" style={styles.actionButton} onPress={handleShare} />
        <Button label="Clear" variant="secondary" style={styles.actionButton} onPress={handleClear} />
      </View>

      {walkReminderSummary && (
        <Card tint="meadow" style={styles.walkReminderSummary}>
          <Text style={textStyle('small')}>
            Walk Reminder — started {new Date(walkReminderSummary.startedAt).toLocaleDateString()} · fired{' '}
            {walkReminderSummary.firedCount} · followed {walkReminderSummary.followedCount}
          </Text>
        </Card>
      )}

      {pendingReminders && (
        <Card tint="meadow" style={styles.walkReminderSummary}>
          <Text style={textStyle('small')}>
            Pending reminders: {pendingReminders.length}
            {pendingReminders.map((d) => `\n${d}`).join('')}
          </Text>
        </Card>
      )}

      <Text style={[textStyle('small'), styles.count]}>{count === null ? 'Loading…' : `${count} entries`}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[textStyle('small'), styles.logText]}>{preview || 'No log entries yet.'}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
  count: { color: palette.muted, textAlign: 'center', marginTop: spacing.sm },
  // The 4-week measurement summary (openspec/changes/walk-reminder/design.md
  // Decision 10) — a small fixed block above the scrollable log preview,
  // reading durable counters directly off NotificationRepository rather than
  // this screen's own clearable log text.
  walkReminderSummary: { marginTop: spacing.md, padding: spacing.md },
  scroll: {
    flex: 1,
    marginTop: spacing.sm,
    borderRadius: radii.card,
    backgroundColor: palette.card,
  },
  scrollContent: { padding: spacing.lg },
  logText: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12 },
});

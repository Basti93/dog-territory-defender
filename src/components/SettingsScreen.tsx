import React, { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { NotificationRepository } from '../storage/NotificationRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { cancelScheduledWalkReminder } from '../notifications/scheduler';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';

// This app's first Settings screen (openspec/changes/walk-reminder/design.md
// Decision 1) — exists for exactly one feature today, the opt-in daily walk
// reminder. Not a general-purpose preferences screen; don't bolt unrelated
// settings onto this without revisiting that decision first.

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

// Anchor time the picker first opens to when the player turns the reminder
// on with no previously-set time of their own — a starting point for them to
// confirm or change, never a silently-applied final choice (Decision 2: "a
// real time picker," the app never chooses on the player's behalf).
const DEFAULT_ANCHOR_HOUR = 18;
const DEFAULT_ANCHOR_MINUTE = 0;

interface SettingsScreenProps {
  onClose: () => void;
  notificationRepository: NotificationRepository;
  walkRepository: WalkRepository;
}

function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

export function SettingsScreen({ onClose, notificationRepository, walkRepository }: SettingsScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  // iOS shows its picker inline inside a small sheet (Decision 2's "real time
  // picker" via the native component's own spinner UI) rather than Android's
  // imperative system dialog (DateTimePickerAndroid.open below) — the
  // package's own documented per-platform idiom.
  const [iosPickerDate, setIosPickerDate] = useState<Date | null>(null);

  useEffect(() => {
    notificationRepository.getState().then((state) => {
      setEnabled(state.walkReminderEnabled);
      setHour(state.walkReminderHour);
      setMinute(state.walkReminderMinute);
      setLoaded(true);
    });
  }, [notificationRepository]);

  const applyTimeChoice = async (pickedHour: number, pickedMinute: number) => {
    setEnabled(true);
    setHour(pickedHour);
    setMinute(pickedMinute);
    const current = await notificationRepository.getState();
    await notificationRepository.saveState({
      ...current,
      walkReminderEnabled: true,
      walkReminderHour: pickedHour,
      walkReminderMinute: pickedMinute,
      // Set once, the first time the reminder is ever turned on (design.md
      // Decision 3) — never overwritten on a later time change.
      walkReminderExperimentStartedAt: current.walkReminderExperimentStartedAt ?? Date.now(),
    });
    // Takes effect immediately, not at the next app open (tasks.md task 5.3).
    await checkAndScheduleWalkReminder({ walkRepository, notificationRepository });
  };

  const openPicker = () => {
    const anchorHour = hour ?? DEFAULT_ANCHOR_HOUR;
    const anchorMinute = minute ?? DEFAULT_ANCHOR_MINUTE;
    const anchorDate = new Date();
    anchorDate.setHours(anchorHour, anchorMinute, 0, 0);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: anchorDate,
        mode: 'time',
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'set' && selected) {
            applyTimeChoice(selected.getHours(), selected.getMinutes());
          }
          // event.type === 'dismissed': player backed out — leave the
          // reminder exactly as it was (still off, if this was the
          // first-time-on flow; no partial state change either way).
        },
      });
    } else {
      setIosPickerDate(anchorDate);
    }
  };

  const handleToggle = async (value: boolean) => {
    if (!value) {
      // One-tap permanent dismissal, no confirmation dialog (design.md
      // Decision 8) — turns off immediately and cancels anything pending.
      setEnabled(false);
      const current = await notificationRepository.getState();
      await notificationRepository.saveState({ ...current, walkReminderEnabled: false });
      await cancelScheduledWalkReminder();
      return;
    }

    // Turning on requires picking a time before the reminder is actually
    // enabled — the toggle itself doesn't flip to "on" until a time is
    // confirmed (openspec/changes/walk-reminder/specs/walk-reminder/spec.md's
    // "Enabling the reminder requires picking a time" scenario).
    openPicker();
  };

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Getting things ready…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Daily walk reminder</Text>
            <Text style={styles.rowSubtitle}>
              A gentle nudge at a time you choose, whenever a walk hasn't happened yet that day.
            </Text>
          </View>
          <Switch value={enabled} onValueChange={handleToggle} trackColor={{ true: COLORS.green }} />
        </View>

        {enabled && hour !== null && minute !== null && (
          <TouchableOpacity style={styles.timeRow} onPress={openPicker}>
            <Text style={styles.timeLabel}>Reminder time</Text>
            <Text style={styles.timeValue}>{formatTime(hour, minute)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {Platform.OS === 'ios' && iosPickerDate && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setIosPickerDate(null)}>
          <View style={styles.iosPickerBackdrop}>
            <View style={styles.iosPickerSheet}>
              <DateTimePicker
                value={iosPickerDate}
                mode="time"
                display="spinner"
                onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                  if (selected) setIosPickerDate(selected);
                }}
              />
              <View style={styles.iosPickerActions}>
                <TouchableOpacity onPress={() => setIosPickerDate(null)}>
                  <Text style={styles.iosPickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const picked = iosPickerDate;
                    setIosPickerDate(null);
                    if (picked) applyTimeChoice(picked.getHours(), picked.getMinutes());
                  }}
                >
                  <Text style={styles.iosPickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  loading: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: COLORS.muted,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.blue,
  },
  body: {
    padding: 24,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  rowSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#eee',
    backgroundColor: '#F5F5F0',
  },
  timeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  timeValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.green,
  },
  iosPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  iosPickerSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  iosPickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  iosPickerCancel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.muted,
  },
  iosPickerDone: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.blue,
  },
});

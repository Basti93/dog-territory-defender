import React, { useEffect, useState } from 'react';
import { Linking, Modal, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyAppearancePicker } from './buddy';
import { BuddyLoading } from './BuddyLoading';
import { Button, Card, Header, ListRow, mix, palette, PressableScale, radii, Screen, spacing, textStyle, tokens } from '../ui';
import { dogDisplayName } from '../economy/denEconomy';
import { NotificationRepository } from '../storage/NotificationRepository';
import { WalkRepository } from '../storage/WalkRepository';
import * as Notifications from 'expo-notifications';
import { cancelScheduledWalkReminder, requestNotificationPermission } from '../notifications/scheduler';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { formatTime, LocalePreference, t, useLocale } from '../i18n';

// This app's first Settings screen (openspec/changes/walk-reminder/design.md
// Decision 1) — exists for exactly one feature today, the opt-in daily walk
// reminder. Not a general-purpose preferences screen; don't bolt unrelated
// settings onto this without revisiting that decision first.

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
  dogName: string | null;
  buddyAppearance: BuddyAppearance;
  /** Persists the new look and updates App state. */
  onSaveAppearance: (appearance: BuddyAppearance) => void | Promise<void>;
  /** The player's saved language choice ('system' follows the device). */
  localePreference: LocalePreference;
  /** Applies the language immediately, persists it, and replans the walk reminder (App.tsx). */
  onChangeLocalePreference: (pref: LocalePreference) => void | Promise<void>;
}

function formatReminderTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return formatTime(d);
}

// Option labels are autonyms (each language names itself), so only "System" is a translated key.
const LANGUAGE_OPTIONS: { value: LocalePreference; labelKey: string | null; label: string }[] = [
  { value: 'system', labelKey: 'settings.language.system', label: 'System' },
  { value: 'de', labelKey: null, label: 'Deutsch' },
  { value: 'en', labelKey: null, label: 'English' },
];

export function SettingsScreen({
  onClose,
  notificationRepository,
  walkRepository,
  dogName,
  buddyAppearance,
  onSaveAppearance,
  localePreference,
  onChangeLocalePreference,
}: SettingsScreenProps) {
  useLocale(); // re-render when the language switches
  const [loaded, setLoaded] = useState(false);
  const [editingLook, setEditingLook] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  // iOS shows its picker inline inside a small sheet (Decision 2's "real time
  // picker" via the native component's own spinner UI) rather than Android's
  // imperative system dialog (DateTimePickerAndroid.open below) — the
  // package's own documented per-platform idiom.
  const [iosPickerDate, setIosPickerDate] = useState<Date | null>(null);
  // True when the OS has notifications off for this app — shown as a warm
  // inline hint with a button to the system settings.
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    notificationRepository.getState().then((state) => {
      setEnabled(state.walkReminderEnabled);
      setHour(state.walkReminderHour);
      setMinute(state.walkReminderMinute);
      setLoaded(true);
      // Surface a later revocation too: reminder on, but the OS says no.
      if (state.walkReminderEnabled) {
        Notifications.getPermissionsAsync().then((p) => setPermissionDenied(!p.granted)).catch(() => {});
      }
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

    // Ask for notification permission first; if the OS says no, keep the
    // toggle off and point to system settings instead of silently failing.
    const granted = await requestNotificationPermission();
    setPermissionDenied(!granted);
    if (!granted) return;

    // Turning on requires picking a time before the reminder is actually
    // enabled — the toggle itself doesn't flip to "on" until a time is
    // confirmed (openspec/changes/walk-reminder/specs/walk-reminder/spec.md's
    // "Enabling the reminder requires picking a time" scenario).
    openPicker();
  };

  if (!loaded) {
    return (
      <Screen>
        <BuddyLoading appearance={buddyAppearance} text={t('common.gettingReady')} />
      </Screen>
    );
  }

  if (editingLook) {
    return (
      <Screen padded={false}>
        <Header
          title={t('settings.lookTitle', { dog: dogDisplayName(dogName) })}
          icon="icon-paw"
          onBack={() => setEditingLook(false)}
          style={styles.lookHeader}
        />
        <BuddyAppearancePicker
          name={dogDisplayName(dogName)}
          initial={buddyAppearance}
          topInset={0}
          onSave={async (look) => {
            await onSaveAppearance(look);
            setEditingLook(false);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen backdrop="sky">
      <Header title={t('menu.settings')} icon="icon-settings" onBack={onClose} />

      <Card tint="sky" style={styles.reminderCard}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={textStyle('h2')}>{t('settings.reminder.title')}</Text>
            <Text style={[textStyle('small'), styles.rowSubtitle]}>
              {t('settings.reminder.subtitle')}
            </Text>
          </View>
          <Switch value={enabled} onValueChange={handleToggle} trackColor={{ true: tokens.green }} />
        </View>

        {permissionDenied && (
          <View style={styles.hintBox}>
            <Text style={textStyle('small')}>
              {t('settings.reminder.permissionOff')}
            </Text>
            <Button label={t('settings.openSettings')} variant="secondary" onPress={() => Linking.openSettings()} />
          </View>
        )}

        {enabled && hour !== null && minute !== null && (
          <PressableScale style={styles.timeRow} onPress={openPicker}>
            <Text style={textStyle('body')}>{t('settings.reminder.time')}</Text>
            <Text style={[textStyle('h2'), { color: palette.greenText }]}>{formatReminderTime(hour, minute)}</Text>
          </PressableScale>
        )}
        <Text style={[textStyle('small'), styles.rowSubtitle]}>
          {t('settings.reminder.battery')}
        </Text>
      </Card>

      <ListRow
        icon="icon-paw"
        title={t('settings.changeLook', { dog: dogDisplayName(dogName) })}
        subtitle={t('settings.edit')}
        onPress={() => setEditingLook(true)}
        style={styles.lookRow}
      />

      <Card style={styles.languageCard}>
        <Text style={textStyle('h2')}>Language / Sprache</Text>
        <View style={styles.languageOptions}>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = localePreference === option.value;
            const label = option.labelKey ? t(option.labelKey) : option.label;
            return (
              <PressableScale
                key={option.value}
                style={[styles.languageChip, selected && styles.languageChipSelected]}
                onPress={() => onChangeLocalePreference(option.value)}
                accessibilityLabel={label}
              >
                <Text style={[textStyle('small'), selected && { color: palette.greenText }]}>{label}</Text>
              </PressableScale>
            );
          })}
        </View>
      </Card>


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
                <Button label={t('common.cancel')} variant="secondary" style={styles.iosPickerButton} onPress={() => setIosPickerDate(null)} />
                <Button
                  label={t('common.done')}
                  style={styles.iosPickerButton}
                  onPress={() => {
                    const picked = iosPickerDate;
                    setIosPickerDate(null);
                    if (picked) applyTimeChoice(picked.getHours(), picked.getMinutes());
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lookRow: { marginTop: spacing.lg },
  languageCard: { marginTop: spacing.lg, gap: spacing.md },
  languageOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  languageChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.chip,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: palette.background,
  },
  languageChipSelected: { borderColor: tokens.green, backgroundColor: palette.meadowTint },
  reminderCard: { gap: spacing.md },
  hintBox: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowText: { flex: 1 },
  rowSubtitle: { color: palette.muted, marginTop: spacing.xs },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.tile,
    backgroundColor: palette.card,
  },
  lookHeader: { paddingHorizontal: spacing.lg },
  iosPickerBackdrop: { flex: 1, backgroundColor: mix(tokens.brown, tokens.text, 0.3) + '40', justifyContent: 'flex-end' },
  iosPickerSheet: {
    backgroundColor: palette.background,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: spacing.lg,
  },
  iosPickerActions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm },
  iosPickerButton: { flex: 1 },
});

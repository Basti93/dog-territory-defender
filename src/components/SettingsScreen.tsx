import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyAppearancePicker } from './buddy';
import { BuddyLoading } from './BuddyLoading';
import { Button, Card, Header, ListRow, mix, palette, PressableScale, radii, Screen, spacing, textStyle, tokens } from '../ui';
import { SoundSettingsCard } from '../feedback/SoundSettingsCard';
import { dogDisplayName } from '../economy/denEconomy';
import { NotificationRepository } from '../storage/NotificationRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { getReminderDiagnostics, ReminderDiagnostics, requestNotificationPermission, scheduleTestReminder } from '../notifications/scheduler';
import { isAnyReminderEnabled, REMINDER_SLOT_IDS, ReminderSlot, ReminderSlotId } from '../notifications/walkReminderDecision';
import { updateReminderSlot } from '../notifications/walkReminder';
import { pickAndImportBackup, shareBackup } from '../storage/backupIO';
import { formatDate, formatTime, LocalePreference, t, useLocale } from '../i18n';
import { HouseholdCard } from './HouseholdCard';
import { isRestoreAllowed } from '../sync/restoreGuard';
import type { SyncEngine } from '../sync/syncEngine';
import { useSyncStatus } from '../sync/useSyncStatus';

// This app's first Settings screen (docs/decisions/walk-reminder/design.md
// Decision 1) — exists for exactly one feature today, the opt-in daily walk
// reminder. Not a general-purpose preferences screen; don't bolt unrelated
// settings onto this without revisiting that decision first.

interface SettingsScreenProps {
  onClose: () => void;
  notificationRepository: NotificationRepository;
  walkRepository: WalkRepository;
  dogName: string | null;
  buddyAppearance: BuddyAppearance;
  /** A walk is being tracked: backup/restore is disabled so it can't be overwritten mid-walk. */
  walkActive: boolean;
  /** Persists the new look and updates App state. */
  onSaveAppearance: (appearance: BuddyAppearance) => void | Promise<void>;
  /** The player's saved language choice ('system' follows the device). */
  localePreference: LocalePreference;
  /** Applies the language immediately, persists it, and replans the walk reminder (App.tsx). */
  onChangeLocalePreference: (pref: LocalePreference) => void | Promise<void>;
  /** Household sync (multiplayer-sync). Omitted = no Household card and Restore stays as before. */
  syncEngine?: SyncEngine;
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

// Language-neutral stand-in while diagnostics load.
const LOADING_PLACEHOLDER = '\u2026';

export function SettingsScreen({
  onClose,
  notificationRepository,
  walkRepository,
  dogName,
  buddyAppearance,
  walkActive,
  onSaveAppearance,
  localePreference,
  onChangeLocalePreference,
  syncEngine,
}: SettingsScreenProps) {
  useLocale(); // re-render when the language switches
  const syncStatus = useSyncStatus(syncEngine);
  // Restoring an old file over live synced state would fork the household's history.
  // Until the status has loaded, an engine-equipped screen keeps Restore off rather than flash it on.
  const restoreAllowed = !syncEngine || (syncStatus !== null && isRestoreAllowed(syncStatus.joined));
  const [loaded, setLoaded] = useState(false);
  const [editingLook, setEditingLook] = useState(false);
  const [slots, setSlots] = useState<ReminderSlot[]>([]);
  // iOS shows its picker inline inside a small sheet (Decision 2's "real time
  // picker" via the native component's own spinner UI) rather than Android's
  // imperative system dialog (DateTimePickerAndroid.open below) — the
  // package's own documented per-platform idiom.
  const [iosPicker, setIosPicker] = useState<{ slotId: ReminderSlotId; date: Date } | null>(null);
  // True when the OS has notifications off for this app — shown as a warm
  // inline hint with a button to the system settings.
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ReminderDiagnostics | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  const refreshDiagnostics = () => {
    getReminderDiagnostics().then(setDiagnostics).catch(() => {});
  };

  useEffect(() => {
    notificationRepository
      .getState()
      .then((state) => {
        setSlots(state.reminderSlots);
        setLoaded(true);
        refreshDiagnostics();
        // Surface a later revocation too: reminder on, but the OS says no.
        if (isAnyReminderEnabled(state.reminderSlots)) {
          getReminderDiagnostics().then((d) => setPermissionDenied(d.permission !== 'granted')).catch(() => {});
        }
      })
      .catch(() => setLoaded(true)); // show the screen with all slots off rather than a blank page
  }, [notificationRepository]);

  // Persists one slot's change, then replans the whole window right away
  // (tasks.md task 5.3) — never waits for the next app open.
  const updateSlot = async (slotId: ReminderSlotId, patch: Partial<ReminderSlot>) => {
    // Optimistic, so the switch responds at once; the serialized, persisted result replaces it below.
    setSlots((prev) => prev.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
    const saved = await updateReminderSlot({ walkRepository, notificationRepository }, slotId, patch);
    setSlots(saved);
    refreshDiagnostics();
  };

  const openPicker = (slot: ReminderSlot) => {
    const anchorDate = new Date();
    anchorDate.setHours(slot.hour, slot.minute, 0, 0);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: anchorDate,
        mode: 'time',
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'set' && selected) {
            updateSlot(slot.id, { hour: selected.getHours(), minute: selected.getMinutes() });
          }
          // 'dismissed': player backed out — leave the slot exactly as it was.
        },
      });
    } else {
      setIosPicker({ slotId: slot.id, date: anchorDate });
    }
  };

  const handleToggle = async (slot: ReminderSlot, value: boolean) => {
    if (!value) {
      // One-tap dismissal, no confirmation dialog (design.md Decision 8).
      await updateSlot(slot.id, { enabled: false });
      return;
    }

    // Ask for permission on the first enable (channels are created inside
    // requestNotificationPermission, before the OS prompt); if the OS says
    // no, keep the switch off and point to system settings.
    if (!isAnyReminderEnabled(slots)) {
      const granted = await requestNotificationPermission();
      setPermissionDenied(!granted);
      if (!granted) return;
    }
    await updateSlot(slot.id, { enabled: true });
  };

  const handleTest = async () => {
    const ok = await scheduleTestReminder();
    setPermissionDenied(!ok);
    setTestSent(ok);
    refreshDiagnostics();
  };

  const handleShareBackup = async () => {
    setBackupBusy(true);
    try {
      const result = await shareBackup();
      if (!result.shared) Alert.alert(t('settings.backup.title'), t('settings.backup.noShare', { uri: result.uri }));
    } catch {
      Alert.alert(t('settings.backup.title'), t('settings.backup.shareFailed'));
    } finally {
      setBackupBusy(false);
    }
  };

  const runRestore = async () => {
    if (!restoreAllowed) return;
    setBackupBusy(true);
    try {
      const result = await pickAndImportBackup();
      if (result.status === 'invalid') {
        const key = result.reason === 'newer-schema' ? 'newerSchema' : result.reason === 'unreadable' ? 'unreadable' : 'invalid';
        Alert.alert(t('settings.backup.title'), t(`settings.backup.${key}`));
      } else if (result.status === 'imported') {
        // The running app holds the old data in memory; a restart is the simple, robust reload.
        Alert.alert(t('settings.backup.doneTitle'), t('settings.backup.doneMessage', { walks: result.counts.walks, cells: result.counts.cells, territories: result.counts.territories, achievements: result.counts.achievements }));
      }
    } catch {
      Alert.alert(t('settings.backup.title'), t('settings.backup.restoreFailed'));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = () => {
    Alert.alert(t('settings.backup.restoreTitle'), t('settings.backup.restoreMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.backup.restoreConfirm'), style: 'destructive', onPress: runRestore },
    ]);
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
        <View style={styles.rowText}>
          <Text style={textStyle('h2')}>{t('settings.reminder.title')}</Text>
          <Text style={[textStyle('small'), styles.rowSubtitle]}>
            {t('settings.reminder.subtitle')}
          </Text>
        </View>

        {permissionDenied && (
          <View style={styles.hintBox}>
            <Text style={textStyle('small')}>
              {t('settings.reminder.permissionOff')}
            </Text>
            <Button label={t('settings.openSettings')} variant="secondary" onPress={() => Linking.openSettings()} />
          </View>
        )}

        {REMINDER_SLOT_IDS.map((id) => {
          const slot = slots.find((s) => s.id === id);
          if (!slot) return null;
          return (
            <View key={id} style={styles.slotRow}>
              <Switch value={slot.enabled} onValueChange={(v) => handleToggle(slot, v)} trackColor={{ true: tokens.green }} />
              <Text style={[textStyle('body'), styles.slotLabel]}>{t(`settings.reminder.slot.${id}`)}</Text>
              <PressableScale style={styles.slotTime} onPress={() => openPicker(slot)} accessibilityLabel={t(`settings.reminder.slot.${id}`)}>
                <Text style={[textStyle('h2'), { color: slot.enabled ? palette.greenText : palette.muted }]}>
                  {formatReminderTime(slot.hour, slot.minute)}
                </Text>
              </PressableScale>
            </View>
          );
        })}

        <View style={styles.hintBox}>
          <Text style={textStyle('small')}>
            {t('settings.reminder.diag.permission', {
              status: diagnostics ? t(`settings.reminder.diag.${diagnostics.permission}`) : LOADING_PLACEHOLDER,
            })}
          </Text>
          <Text style={textStyle('small')}>
            {diagnostics?.next
              ? t('settings.reminder.diag.next', { when: `${formatDate(diagnostics.next)} ${formatTime(diagnostics.next)}` })
              : t('settings.reminder.diag.nextNone')}
            {' · '}
            {t('settings.reminder.diag.planned', { count: diagnostics?.planned ?? 0 })}
          </Text>
          <Button label={t('settings.reminder.test')} variant="secondary" onPress={handleTest} />
          {testSent && <Text style={[textStyle('small'), styles.rowSubtitle]}>{t('settings.reminder.testSent')}</Text>}
        </View>
        <Text style={[textStyle('small'), styles.rowSubtitle]}>
          {t('settings.reminder.battery')}
        </Text>
      </Card>

      <SoundSettingsCard />

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

      {syncEngine && (
        <HouseholdCard
          engine={syncEngine}
          status={syncStatus}
          onShareBackup={handleShareBackup}
          deviceLabel={Platform.OS === 'ios' ? 'iPhone' : 'Android'}
        />
      )}

      <Card style={styles.languageCard}>
        <View style={styles.rowText}>
          <Text style={textStyle('h2')}>{t('settings.backup.title')}</Text>
          <Text style={[textStyle('small'), styles.rowSubtitle]}>{t('settings.backup.subtitle')}</Text>
        </View>
        <Button label={t('settings.backup.share')} variant="secondary" onPress={handleShareBackup} disabled={backupBusy || walkActive} />
        <Button label={t('settings.backup.restore')} variant="ghost" onPress={handleRestoreBackup} disabled={backupBusy || walkActive || !restoreAllowed} />
        {syncStatus?.joined && <Text style={[textStyle('small'), styles.rowSubtitle]}>{t('household.restoreOff')}</Text>}
        {walkActive && <Text style={[textStyle('small'), styles.rowSubtitle]}>{t('settings.backup.walkActive')}</Text>}
      </Card>

      {Platform.OS === 'ios' && iosPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setIosPicker(null)}>
          <View style={styles.iosPickerBackdrop}>
            <View style={styles.iosPickerSheet}>
              <DateTimePicker
                value={iosPicker.date}
                mode="time"
                display="spinner"
                onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                  if (selected) setIosPicker({ slotId: iosPicker.slotId, date: selected });
                }}
              />
              <View style={styles.iosPickerActions}>
                <Button label={t('common.cancel')} variant="secondary" style={styles.iosPickerButton} onPress={() => setIosPicker(null)} />
                <Button
                  label={t('common.done')}
                  style={styles.iosPickerButton}
                  onPress={() => {
                    const picked = iosPicker;
                    setIosPicker(null);
                    updateSlot(picked.slotId, { hour: picked.date.getHours(), minute: picked.date.getMinutes() });
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
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.tile,
    backgroundColor: palette.card,
  },
  slotLabel: { flex: 1 },
  slotTime: { minHeight: 44, justifyContent: 'center' },
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

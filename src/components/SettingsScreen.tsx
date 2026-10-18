import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyAppearancePicker } from './buddy';
import { BuddyLoading } from './BuddyLoading';
import { material, mix, PaperHeader, PaperHint, PaperRow, PaperSection, PaperSheet, palette, PressableScale, radii, Screen, spacing, TextLink, textStyle, tokens, WoodSign } from '../ui';
import { SoundSettingsCard } from '../feedback/SoundSettingsCard';
import { dogDisplayName } from '../economy/denEconomy';
import { NotificationRepository } from '../storage/NotificationRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { getReminderDiagnostics, ReminderDiagnostics, requestNotificationPermission, scheduleTestReminder } from '../notifications/scheduler';
import { isAnyReminderEnabled, REMINDER_SLOT_IDS, ReminderSlot, ReminderSlotId } from '../notifications/walkReminderDecision';
import { updateReminderSlot } from '../notifications/walkReminder';
import { pickAndImportBackup, shareBackup } from '../storage/backupIO';
import { formatDate, formatTime, LocalePreference, t, useLocale } from '../i18n';
import { AutoFinishSwitch } from './AutoFinishSwitch';
import { HouseholdCard } from './HouseholdCard';
import type { SettingsRepository } from '../storage/SettingsRepository';
import { LogShippingSwitch } from './LogShippingSwitch';
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
  /** Holds the "finish walks automatically" switch. Omitted = no switch row. */
  settingsRepository?: SettingsRepository;
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
  /** Opens the "log a walk we missed" screen (a row on the sheet). */
  onOpenLogMissedWalk: () => void;
  /** Opens the debug log screen (a row on the sheet). */
  onOpenDebugLog: () => void;
  /** OTA update info + manual check (useOtaUpdates). Omitted = no About section. */
  about?: { versionLabel: string; onCheck: () => Promise<'current' | 'ready' | 'unavailable'> };
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
  settingsRepository,
  dogName,
  buddyAppearance,
  walkActive,
  onSaveAppearance,
  localePreference,
  onChangeLocalePreference,
  syncEngine,
  about,
  onOpenLogMissedWalk,
  onOpenDebugLog,
}: SettingsScreenProps) {
  const [aboutStatus, setAboutStatus] = useState<string | null>(null);
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
      <Screen backdrop="linen">
        <BuddyLoading appearance={buddyAppearance} text={t('common.gettingReady')} />
      </Screen>
    );
  }

  if (editingLook) {
    return (
      <Screen padded={false} backdrop="linen">
        <PaperHeader
          title={t('settings.lookTitle', { dog: dogDisplayName(dogName) })}
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

  const dog = dogDisplayName(dogName);

  return (
    <Screen scroll backdrop="linen">
      <PaperHeader title={t('menu.settings')} onBack={onClose} />

      <PaperSheet>
        <PaperSection title={t('post.dog')} first>
          <PaperRow title={dog} />
          <PaperRow
            title={t('settings.changeLook', { dog })}
            subtitle={t('settings.edit')}
            onPress={() => setEditingLook(true)}
            right={<Text style={[textStyle('h2'), styles.chevron]}>{'\u203A'}</Text>}
          />
          {settingsRepository && <AutoFinishSwitch settingsRepository={settingsRepository} />}
        </PaperSection>

        <PaperSection title={t('post.reminders')}>
          <PaperHint>{t('settings.reminder.subtitle')}</PaperHint>
          {permissionDenied && (
            <View style={styles.block}>
              <Text style={[textStyle('small'), styles.ink]}>{t('settings.reminder.permissionOff')}</Text>
              <TextLink label={t('settings.openSettings')} onPress={() => Linking.openSettings()} />
            </View>
          )}
          {REMINDER_SLOT_IDS.map((id) => {
            const slot = slots.find((s) => s.id === id);
            if (!slot) return null;
            return (
              <PaperRow
                key={id}
                title={t(`settings.reminder.slot.${id}`)}
                right={
                  <View style={styles.slotControls}>
                    <PressableScale style={styles.slotTime} onPress={() => openPicker(slot)} accessibilityLabel={t(`settings.reminder.slot.${id}`)}>
                      <Text style={[textStyle('h2'), { color: slot.enabled ? material.inkGreen : material.muted }]}>
                        {formatReminderTime(slot.hour, slot.minute)}
                      </Text>
                    </PressableScale>
                    <Switch value={slot.enabled} onValueChange={(v) => handleToggle(slot, v)} trackColor={{ true: material.inkGreen }} />
                  </View>
                }
              />
            );
          })}
          <View style={styles.block}>
            <Text style={[textStyle('small'), styles.ink]}>
              {t('settings.reminder.diag.permission', {
                status: diagnostics ? t(`settings.reminder.diag.${diagnostics.permission}`) : LOADING_PLACEHOLDER,
              })}
            </Text>
            <Text style={[textStyle('small'), styles.ink]}>
              {diagnostics?.next
                ? t('settings.reminder.diag.next', { when: `${formatDate(diagnostics.next)} ${formatTime(diagnostics.next)}` })
                : t('settings.reminder.diag.nextNone')}
              {' \u00B7 '}
              {t('settings.reminder.diag.planned', { count: diagnostics?.planned ?? 0 })}
            </Text>
            <TextLink label={t('settings.reminder.test')} onPress={handleTest} />
            {testSent && <PaperHint>{t('settings.reminder.testSent')}</PaperHint>}
          </View>
          <PaperHint>{t('settings.reminder.battery')}</PaperHint>
        </PaperSection>

        <PaperSection title={t('post.sounds')}>
          <SoundSettingsCard />
        </PaperSection>

        <PaperSection title="Language / Sprache">
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
                  <Text style={[textStyle('small'), styles.ink, selected && { color: material.inkGreen }]}>{label}</Text>
                </PressableScale>
              );
            })}
          </View>
        </PaperSection>

        {syncEngine && (
          <PaperSection title={t('household.title')}>
            <HouseholdCard
              engine={syncEngine}
              status={syncStatus}
              onShareBackup={handleShareBackup}
              deviceLabel={Platform.OS === 'ios' ? 'iPhone' : 'Android'}
            />
            {syncStatus?.joined && <LogShippingSwitch />}
          </PaperSection>
        )}

        <PaperSection title={t('settings.backup.title')}>
          <PaperHint>{t('settings.backup.subtitle')}</PaperHint>
          <TextLink label={t('settings.backup.share')} onPress={handleShareBackup} disabled={backupBusy || walkActive} />
          <TextLink label={t('settings.backup.restore')} onPress={handleRestoreBackup} disabled={backupBusy || walkActive || !restoreAllowed} />
          {syncStatus?.joined && <PaperHint>{t('household.restoreOff')}</PaperHint>}
          {walkActive && <PaperHint>{t('settings.backup.walkActive')}</PaperHint>}
        </PaperSection>

        <PaperSection title={t('menu.logMissedWalk')} onPress={onOpenLogMissedWalk} />

        {about && (
          <PaperSection title={t('settings.about.title')}>
            <PaperHint>{about.versionLabel}</PaperHint>
            <TextLink
              label={t('settings.about.check')}
              onPress={async () => {
                const result = await about.onCheck();
                setAboutStatus(t(`settings.about.${result}`));
              }}
            />
            {aboutStatus && <PaperHint>{aboutStatus}</PaperHint>}
          </PaperSection>
        )}

        <PaperSection title={t('menu.debugLog')} onPress={onOpenDebugLog} />
      </PaperSheet>

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
                <TextLink label={t('common.cancel')} onPress={() => setIosPicker(null)} />
                <WoodSign
                  size="medium"
                  onPress={() => {
                    const picked = iosPicker;
                    setIosPicker(null);
                    updateSlot(picked.slotId, { hour: picked.date.getHours(), minute: picked.date.getMinutes() });
                  }}
                >
                  {t('common.done')}
                </WoodSign>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ink: { color: material.ink },
  chevron: { color: material.inkGreen },
  block: { gap: spacing.xs, marginVertical: spacing.sm },
  languageOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  languageChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.chip,
    borderWidth: 2,
    borderColor: material.linen,
    backgroundColor: material.yarn,
  },
  languageChipSelected: { borderColor: material.inkGreen },
  slotControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  slotTime: { minHeight: 44, justifyContent: 'center' },
  lookHeader: { paddingHorizontal: spacing.lg },
  iosPickerBackdrop: { flex: 1, backgroundColor: mix(tokens.brown, tokens.text, 0.3) + '40', justifyContent: 'flex-end' },
  iosPickerSheet: {
    backgroundColor: material.yarn,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: spacing.lg,
  },
  iosPickerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
});

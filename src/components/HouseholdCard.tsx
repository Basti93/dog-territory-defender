import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { material, PaperHint, TextLink, WoodSign, radii, spacing, textStyle } from '../ui';
import { formatDate, formatTime, t, tPlural } from '../i18n';
import { API_LIMITS } from '../sync/apiContract';
import { DEFAULT_SERVER_URL, INVITE_CODE_LENGTH } from '../sync/syncConfig';
import type { SyncEngine, SyncStatus } from '../sync/syncEngine';

// Settings card for the household (multiplayer-sync): join with an invite
// code, see a quiet status line, leave. Foreground-only, no spinner theatre;
// every failure is a gentle one-liner (Buddy anti-guilt rule).

interface HouseholdCardProps {
  engine: SyncEngine;
  status: SyncStatus | null;
  /** Opens the backup share sheet; offered inside the join confirmation. */
  onShareBackup: () => void;
  deviceLabel: string;
}

export function HouseholdCard({ engine, status, onShareBackup, deviceLabel }: HouseholdCardProps) {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [playerName, setPlayerName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rename row (joined state): null = untouched, show the stored name.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const canJoin = serverUrl.trim().length > 0 && playerName.trim().length > 0 && code.replace(/[\s-]/g, '').length === INVITE_CODE_LENGTH && !busy;

  const runJoin = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await engine.join({ serverUrl, code, playerName, deviceLabel });
      if ('reason' in result) setError(t(`household.join.error.${result.reason}`));
      else setCode('');
    } catch {
      setError(t('household.join.error.server'));
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = () => {
    // Joining is the consent moment: say plainly what a household shares and that the Den follows it.
    Alert.alert(t('household.join.confirmTitle'), t('household.join.confirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('household.join.backupFirst'), onPress: onShareBackup },
      { text: t('household.join.confirm'), onPress: runJoin },
    ]);
  };

  const saveName = async () => {
    if (nameDraft === null) return;
    if (await engine.renamePlayer(nameDraft)) {
      setNameDraft(null);
      setNameSaved(true);
    }
  };

  const handleLeave = () => {
    Alert.alert(t('household.leave.title'), t('household.leave.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('household.leave.confirm'), style: 'destructive', onPress: () => void engine.leave() },
    ]);
  };

  if (!status) return null;

  if (status.joined) {
    const last = status.lastSyncAt ? new Date(status.lastSyncAt) : null;
    const shownName = nameDraft ?? status.playerName ?? '';
    const canSaveName = nameDraft !== null && nameDraft.trim().length > 0 && nameDraft.trim() !== (status.playerName ?? '');
    return (
      <View style={styles.card}>
        <Text style={[textStyle('body'), styles.ink]}>
          {status.householdName
            ? t('household.status.connectedHousehold', { player: status.playerName ?? '', household: status.householdName })
            : t('household.status.connected', { player: status.playerName ?? '' })}
        </Text>
        <PaperHint>
          {last
            ? t('household.status.lastSync', { when: `${formatDate(last)} ${formatTime(last)}` })
            : t('household.status.never')}
          {status.pending > 0 ? ` · ${tPlural('household.status.outbox', status.pending)}` : ''}
        </PaperHint>
        {status.unauthorized && <PaperHint>{t('household.status.unauthorized')}</PaperHint>}
        <TextInput
          style={[textStyle('body'), styles.input]}
          value={shownName}
          onChangeText={(text) => {
            setNameDraft(text);
            setNameSaved(false);
          }}
          placeholder={t('household.playerName')}
          placeholderTextColor={material.muted}
          maxLength={API_LIMITS.maxRenameLength}
          accessibilityLabel={t('household.rename.label')}
        />
        {nameSaved && <PaperHint>{t('household.rename.saved')}</PaperHint>}
        <TextLink label={t('household.rename.save')} onPress={() => void saveName()} disabled={!canSaveName} />
        <TextLink label={t('household.syncNow')} onPress={() => void engine.syncNow({ force: true })} disabled={status.busy} />
        <TextLink label={t('household.leave.button')} onPress={handleLeave} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <PaperHint>{t('household.subtitle')}</PaperHint>
      <TextInput
        style={[textStyle('body'), styles.input]}
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder={t('household.serverUrl')}
        placeholderTextColor={material.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel={t('household.serverUrl')}
      />
      <TextInput
        style={[textStyle('body'), styles.input]}
        value={playerName}
        onChangeText={setPlayerName}
        placeholder={t('household.playerName')}
        placeholderTextColor={material.muted}
        maxLength={API_LIMITS.maxRenameLength}
        accessibilityLabel={t('household.playerName')}
      />
      <TextInput
        style={[textStyle('body'), styles.input]}
        value={code}
        onChangeText={setCode}
        placeholder={t('household.inviteCode')}
        placeholderTextColor={material.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={INVITE_CODE_LENGTH + 2}
        accessibilityLabel={t('household.inviteCode')}
      />
      {error && <PaperHint>{error}</PaperHint>}
      <WoodSign size="medium" fullWidth onPress={handleJoin} disabled={!canJoin}>
        {t('household.join.button')}
      </WoodSign>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  ink: { color: material.ink },
  input: {
    borderWidth: 2,
    borderColor: material.woodRim,
    borderRadius: radii.chip,
    backgroundColor: material.yarn,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    color: material.ink,
    lineHeight: undefined, // fixed lineHeight clips text inside a TextInput
  },
});

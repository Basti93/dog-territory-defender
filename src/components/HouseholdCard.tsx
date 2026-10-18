import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, palette, radii, spacing, textStyle } from '../ui';
import { formatDate, formatTime, t, tPlural } from '../i18n';
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

  const canJoin = playerName.trim().length > 0 && code.replace(/[\s-]/g, '').length === INVITE_CODE_LENGTH && !busy;

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

  const handleLeave = () => {
    Alert.alert(t('household.leave.title'), t('household.leave.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('household.leave.confirm'), style: 'destructive', onPress: () => void engine.leave() },
    ]);
  };

  if (!status) return null;

  if (status.joined) {
    const last = status.lastSyncAt ? new Date(status.lastSyncAt) : null;
    return (
      <Card style={styles.card}>
        <Text style={textStyle('h2')}>{t('household.title')}</Text>
        <Text style={textStyle('body')}>
          {status.householdName
            ? t('household.status.connectedHousehold', { player: status.playerName ?? '', household: status.householdName })
            : t('household.status.connected', { player: status.playerName ?? '' })}
        </Text>
        <Text style={[textStyle('small'), styles.muted]}>
          {last
            ? t('household.status.lastSync', { when: `${formatDate(last)} ${formatTime(last)}` })
            : t('household.status.never')}
          {status.pending > 0 ? ` · ${tPlural('household.status.outbox', status.pending)}` : ''}
        </Text>
        {status.unauthorized && <Text style={[textStyle('small'), styles.muted]}>{t('household.status.unauthorized')}</Text>}
        <Button label={t('household.syncNow')} variant="secondary" onPress={() => void engine.syncNow({ force: true })} disabled={status.busy} />
        <Button label={t('household.leave.button')} variant="ghost" onPress={handleLeave} />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={textStyle('h2')}>{t('household.title')}</Text>
      <Text style={[textStyle('small'), styles.muted]}>{t('household.subtitle')}</Text>
      <TextInput
        style={[textStyle('body'), styles.input]}
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder={t('household.serverUrl')}
        placeholderTextColor={palette.muted}
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
        placeholderTextColor={palette.muted}
        maxLength={40}
        accessibilityLabel={t('household.playerName')}
      />
      <TextInput
        style={[textStyle('body'), styles.input]}
        value={code}
        onChangeText={setCode}
        placeholder={t('household.inviteCode')}
        placeholderTextColor={palette.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={INVITE_CODE_LENGTH + 2}
        accessibilityLabel={t('household.inviteCode')}
      />
      {error && <Text style={[textStyle('small'), styles.muted]}>{error}</Text>}
      <Button label={t('household.join.button')} onPress={handleJoin} disabled={!canJoin} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.lg, gap: spacing.md },
  muted: { color: palette.muted },
  input: {
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: radii.tile,
    backgroundColor: palette.background,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    lineHeight: undefined, // fixed lineHeight clips text inside a TextInput
  },
});

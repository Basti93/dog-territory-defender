import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BuddyAppearance, defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { ArtKey } from '../../art/artAssets';
import { ArtImage, Button, Card, Chip, Header, palette, Screen, spacing, textStyle } from '../../ui';
import { BuddyAvatar } from '../buddy';
import { t } from '../../i18n';

// One-time permission priming, after the look picker and before the Doorstep.
// Both asks are optional and never nag: "Later" leaves everything untouched,
// and a decline is answered with a friendly line, not a warning.

type Status = 'idle' | 'asking' | 'granted' | 'declined';

export interface PermissionPrimerScreenProps {
  /** Runs the OS location dialogs; resolves to whether location was granted. */
  onRequestLocation: () => Promise<boolean>;
  /** Runs the OS notification dialog; resolves to whether it was granted. */
  onRequestReminders: () => Promise<boolean>;
  /** Called when the player continues or taps "Later". */
  onDone: () => void;
  buddyAppearance?: BuddyAppearance;
}

function PermissionRow({
  icon,
  title,
  body,
  buttonLabel,
  status,
  onPress,
}: {
  icon: ArtKey;
  title: string;
  body: string;
  buttonLabel: string;
  status: Status;
  onPress: () => void;
}) {
  return (
    <Card style={styles.row}>
      <View style={styles.rowHead}>
        <ArtImage art={icon} size={40} />
        <View style={styles.rowText}>
          <Text style={textStyle('h2')}>{title}</Text>
          <Text style={[textStyle('small'), styles.muted]}>{body}</Text>
        </View>
      </View>
      {status === 'granted' && <Chip label={t('primer.granted')} tint="meadow" />}
      {status === 'declined' && <Text style={[textStyle('small'), styles.muted]}>{t('primer.declined')}</Text>}
      {(status === 'idle' || status === 'asking') && (
        <Button label={buttonLabel} variant="secondary" disabled={status === 'asking'} onPress={onPress} />
      )}
    </Card>
  );
}

export function PermissionPrimerScreen({ onRequestLocation, onRequestReminders, onDone, buddyAppearance }: PermissionPrimerScreenProps) {
  const [location, setLocation] = useState<Status>('idle');
  const [reminders, setReminders] = useState<Status>('idle');

  const ask = async (request: () => Promise<boolean>, set: (s: Status) => void) => {
    set('asking');
    try {
      set((await request()) ? 'granted' : 'declined');
    } catch {
      set('declined');
    }
  };

  const anyAnswered = location === 'granted' || location === 'declined' || reminders === 'granted' || reminders === 'declined';

  return (
    <Screen scroll backdrop="sky" contentStyle={styles.content}>
      <Header title={t('primer.title')} icon="icon-paw" />
      <BuddyAvatar appearance={buddyAppearance ?? defaultBuddyAppearance()} size={140} mood="curious" />
      <Text style={[textStyle('body'), styles.subtitle]}>{t('primer.subtitle')}</Text>

      <PermissionRow
        icon="icon-pin"
        title={t('primer.location.title')}
        body={t('primer.location.body')}
        buttonLabel={t('primer.location.button')}
        status={location}
        onPress={() => ask(onRequestLocation, setLocation)}
      />
      <PermissionRow
        icon="icon-treat"
        title={t('primer.reminders.title')}
        body={t('primer.reminders.body')}
        buttonLabel={t('primer.reminders.button')}
        status={reminders}
        onPress={() => ask(onRequestReminders, setReminders)}
      />

      {anyAnswered ? (
        <Button label={t('onboarding.start')} onPress={onDone} style={styles.cta} />
      ) : (
        <Button label={t('primer.later')} variant="ghost" onPress={onDone} style={styles.cta} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: spacing.md },
  subtitle: { textAlign: 'center', color: palette.muted },
  row: { alignSelf: 'stretch', gap: spacing.md },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1 },
  muted: { color: palette.muted },
  cta: { alignSelf: 'stretch', marginTop: spacing.sm },
});

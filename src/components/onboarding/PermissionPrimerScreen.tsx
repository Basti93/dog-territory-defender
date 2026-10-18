import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BuddyAppearance, defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { ArtKey } from '../../art/artAssets';
import { ArtImage, material, PaperHeader, PaperSheet, Screen, spacing, TextLink, textStyle, WoodSign } from '../../ui';
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
    <PaperSheet style={styles.row}>
      <View style={styles.rowHead}>
        <ArtImage art={icon} size={40} />
        <View style={styles.rowText}>
          <Text style={[textStyle('sign'), styles.ink]}>{title}</Text>
          <Text style={[textStyle('small'), styles.muted]}>{body}</Text>
        </View>
      </View>
      {status === 'granted' && <Text style={[textStyle('body'), styles.granted]}>{t('primer.granted')}</Text>}
      {status === 'declined' && <Text style={[textStyle('small'), styles.muted]}>{t('primer.declined')}</Text>}
      {(status === 'idle' || status === 'asking') && (
        <TextLink label={buttonLabel} disabled={status === 'asking'} onPress={onPress} />
      )}
    </PaperSheet>
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
    <Screen scroll backdrop="linen" contentStyle={styles.content}>
      <PaperHeader title={t('primer.title')} style={styles.header} />
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
        <WoodSign size="wide" fullWidth onPress={onDone} style={styles.cta}>
          {t('onboarding.start')}
        </WoodSign>
      ) : (
        <TextLink label={t('primer.later')} onPress={onDone} style={styles.later} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: spacing.md },
  subtitle: { textAlign: 'center', color: material.muted },
  row: { alignSelf: 'stretch', gap: spacing.md },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1 },
  muted: { color: material.muted },
  ink: { color: material.ink },
  granted: { color: material.inkGreen },
  header: { alignSelf: 'stretch' },
  later: { alignSelf: 'center' },
  cta: { marginTop: spacing.sm },
});

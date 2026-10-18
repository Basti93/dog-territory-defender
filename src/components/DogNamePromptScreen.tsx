import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput } from 'react-native';

import { BuddyAppearance, defaultBuddyAppearance } from '../buddy/buddyAppearance';
import { material, PaperHeader, PaperSheet, radii, Screen, spacing, textStyle, WoodSign } from '../ui';
import { BuddyAvatar } from './buddy';
import { t } from '../i18n';

// One-time, first-launch naming prompt (tasks.md task 1.1). Shown once, when
// the Den-economy state's dogName is still null; never re-prompts once set.

interface DogNamePromptScreenProps {
  onSubmit: (name: string) => void;
  /** Buddy shown above the form. Optional: falls back to the default look. */
  buddyAppearance?: BuddyAppearance;
}

export function DogNamePromptScreen({ onSubmit, buddyAppearance }: DogNamePromptScreenProps) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll backdrop="linen" contentStyle={styles.content}>
        <PaperHeader title={t('dogName.header')} style={styles.header} />
        <BuddyAvatar appearance={buddyAppearance ?? defaultBuddyAppearance()} size={140} mood="curious" />

        <PaperSheet style={styles.form}>
          <Text style={[textStyle('h1'), styles.center, styles.ink]}>{t('dogName.question')}</Text>
          <Text style={[textStyle('body'), styles.center, styles.subtitle]}>
            {t('dogName.subtitle')}
          </Text>

          <TextInput
            style={[textStyle('body'), styles.input]}
            value={name}
            onChangeText={setName}
            placeholder={t('dogName.placeholder')}
            placeholderTextColor={material.muted}
            autoFocus
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => trimmed && onSubmit(trimmed)}
          />

          <WoodSign size="wide" fullWidth disabled={!trimmed} onPress={() => onSubmit(trimmed)}>
            {t('dogName.submit')}
          </WoodSign>
        </PaperSheet>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { alignItems: 'center' },
  form: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.md },
  center: { textAlign: 'center' },
  subtitle: { color: material.muted },
  ink: { color: material.ink },
  header: { alignSelf: 'stretch' },
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

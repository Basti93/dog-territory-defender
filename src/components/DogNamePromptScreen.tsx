import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput } from 'react-native';

import { BuddyAppearance, defaultBuddyAppearance } from '../buddy/buddyAppearance';
import { Button, Card, Header, palette, radii, Screen, spacing, textStyle } from '../ui';
import { BuddyAvatar } from './buddy';

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
      <Screen scroll backdrop="sky" contentStyle={styles.content}>
        <Header title="Your dog" icon="icon-paw" />
        <BuddyAvatar appearance={buddyAppearance ?? defaultBuddyAppearance()} size={140} mood="curious" />

        <Card style={styles.form}>
          <Text style={[textStyle('h1'), styles.center]}>What's your dog's name? 🐾</Text>
          <Text style={[textStyle('body'), styles.center, styles.subtitle]}>
            Every Level readout from here on is your dog's own.
          </Text>

          <TextInput
            style={[textStyle('body'), styles.input]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Buddy"
            placeholderTextColor={palette.muted}
            autoFocus
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => trimmed && onSubmit(trimmed)}
          />

          <Button label="Let's go!" disabled={!trimmed} onPress={() => onSubmit(trimmed)} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { alignItems: 'center' },
  form: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.md },
  center: { textAlign: 'center' },
  subtitle: { color: palette.muted },
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

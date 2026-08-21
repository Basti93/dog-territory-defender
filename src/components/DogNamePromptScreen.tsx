import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

// One-time, first-launch naming prompt (tasks.md task 1.1). Shown once, when
// the Den-economy state's dogName is still null; never re-prompts once set.

const COLORS = {
  green: '#2ECC71',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

interface DogNamePromptScreenProps {
  onSubmit: (name: string) => void;
}

export function DogNamePromptScreen({ onSubmit }: DogNamePromptScreenProps) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>What's your dog's name? 🐾</Text>
        <Text style={styles.subtitle}>Every Level readout from here on is your dog's own.</Text>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Buddy"
          placeholderTextColor={COLORS.muted}
          autoFocus
          maxLength={30}
          returnKeyType="done"
          onSubmitEditing={() => trimmed && onSubmit(trimmed)}
        />

        <TouchableOpacity
          style={[styles.button, !trimmed && styles.buttonDisabled]}
          disabled={!trimmed}
          onPress={() => onSubmit(trimmed)}
        >
          <Text style={styles.buttonText}>Let's go!</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  input: {
    marginTop: 24,
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#eee',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.text,
  },
  button: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: COLORS.green,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
});

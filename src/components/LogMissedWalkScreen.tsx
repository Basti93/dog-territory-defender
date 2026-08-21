import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { MissedWalkTiming } from '../utils/manualWalkLog';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

interface LogMissedWalkScreenProps {
  onLog: (timing: MissedWalkTiming) => void;
  onClose: () => void;
}

const OPTIONS: { timing: MissedWalkTiming; label: string }[] = [
  { timing: 'today', label: 'Earlier today' },
  { timing: 'yesterday', label: 'Yesterday' },
];

export function LogMissedWalkScreen({ onLog, onClose }: LogMissedWalkScreenProps) {
  const [selected, setSelected] = useState<MissedWalkTiming | null>(null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Log a walk we missed</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.prompt}>A walk with your dog that the app missed still counts. When did you head out?</Text>

        {OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.timing}
            style={[styles.option, selected === option.timing && styles.optionSelected]}
            onPress={() => setSelected(option.timing)}
          >
            <Text style={[styles.optionText, selected === option.timing && styles.optionTextSelected]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.logButton, !selected && styles.logButtonDisabled]}
          disabled={!selected}
          onPress={() => selected && onLog(selected)}
        >
          <Text style={styles.logButtonText}>Log this walk 🐾</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.blue,
  },
  body: {
    padding: 24,
    gap: 12,
  },
  prompt: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 8,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#eee',
    backgroundColor: COLORS.white,
  },
  optionSelected: {
    borderColor: COLORS.green,
    backgroundColor: '#EAF7EE',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  optionTextSelected: {
    color: COLORS.green,
  },
  logButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: COLORS.green,
  },
  logButtonDisabled: {
    opacity: 0.5,
  },
  logButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
});

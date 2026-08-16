import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDebugLogText, getDebugLogCount, clearDebugLog } from '../utils/debugLog';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

interface DebugLogScreenProps {
  onClose: () => void;
}

export function DebugLogScreen({ onClose }: DebugLogScreenProps) {
  const [count, setCount] = useState<number | null>(null);
  const [preview, setPreview] = useState('');

  const refresh = useCallback(() => {
    getDebugLogCount().then(setCount);
    getDebugLogText().then((text) => {
      const lines = text.split('\n');
      setPreview(lines.slice(-50).join('\n'));
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleShare = async () => {
    const text = await getDebugLogText();
    if (!text) {
      Alert.alert('Nothing to share', 'The debug log is empty.');
      return;
    }
    const file = new File(Paths.cache, `dog-territory-debug-log-${Date.now()}.txt`);
    file.create();
    file.write(text);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
    } else {
      Alert.alert('Sharing not available', `Log saved to ${file.uri}`);
    }
  };

  const handleClear = () => {
    Alert.alert('Clear debug log?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearDebugLog();
          refresh();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Debug Log</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.shareButton]} onPress={handleShare}>
          <Text style={styles.buttonText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={handleClear}>
          <Text style={styles.buttonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.count}>{count === null ? 'Loading…' : `${count} entries`}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.logText}>{preview || 'No log entries yet.'}</Text>
      </ScrollView>
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
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButton: {
    backgroundColor: COLORS.blue,
  },
  clearButton: {
    backgroundColor: '#E74C3C',
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  count: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  scroll: {
    flex: 1,
    marginTop: 8,
  },
  scrollContent: {
    padding: 16,
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: COLORS.text,
  },
});

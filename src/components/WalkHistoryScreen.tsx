import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { StoredWalk, WalkRepository } from '../storage/WalkRepository';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

interface WalkHistoryScreenProps {
  repository: WalkRepository;
  onClose: () => void;
}

export function WalkHistoryScreen({ repository, onClose }: WalkHistoryScreenProps) {
  const [walks, setWalks] = useState<StoredWalk[] | null>(null);

  useEffect(() => {
    repository.getWalks().then(setWalks);
  }, [repository]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Past Walks</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {walks === null ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : walks.length === 0 ? (
        <Text style={styles.empty}>No walks yet — take your dog out and claim your first territory! 🌱</Text>
      ) : (
        <FlatList
          data={walks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowDate}>{new Date(item.startTime).toLocaleString()}</Text>
              <View style={styles.rowMeta}>
                <Text style={[styles.rowStatus, { color: item.closed ? COLORS.green : COLORS.muted }]}>
                  {item.closed ? '✓ Closed' : 'Open'}
                </Text>
                <Text style={styles.rowPoints}>{item.locations.length} pts</Text>
              </View>
            </View>
          )}
        />
      )}
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
  empty: {
    padding: 24,
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowDate: {
    fontSize: 14,
    color: COLORS.text,
  },
  rowMeta: {
    alignItems: 'flex-end',
  },
  rowStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  rowPoints: {
    fontSize: 12,
    color: COLORS.muted,
  },
});

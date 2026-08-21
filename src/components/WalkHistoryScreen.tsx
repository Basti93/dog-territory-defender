import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
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

  const handleDelete = (walk: StoredWalk) => {
    // PLACEHOLDER COPY — a game-master question, not settled here (see
    // openspec/changes/home-range/tasks.md task 2.5.1). Functional
    // requirement only: this must not claim deleting the walk record undoes
    // its effect on the Home Range map, since it no longer does (deleting a
    // walk removes only its own record — the cells it painted stay in the
    // separately-stored Home Range grid).
    Alert.alert('Delete walk?', "This removes it from your history. It won't undo any ground already on the map.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await repository.deleteWalk(walk.id);
          setWalks((prev) => (prev ? prev.filter((w) => w.id !== walk.id) : prev));
        },
      },
    ]);
  };

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
                {/* item.closed now means "covered enough ground to qualify for a reward" (the
                    25-painted-cell floor), not "formed a closed loop" — see
                    openspec/changes/home-range/specs/walk-lifecycle/spec.md. Wording lifted
                    directly from that spec delta's own language, not invented here. */}
                <Text style={[styles.rowStatus, { color: item.closed ? COLORS.green : COLORS.muted }]}>
                  {item.closed ? '✓ Rewarded' : 'Too short'}
                </Text>
                <Text style={styles.rowPoints}>{item.locations.length} pts</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
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
  deleteText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E74C3C',
    marginLeft: 12,
  },
});

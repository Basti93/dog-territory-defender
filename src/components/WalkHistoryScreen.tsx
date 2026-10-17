import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { StoredWalk, WalkRepository } from '../storage/WalkRepository';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};
import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyLoading } from './BuddyLoading';

// Keeps the header Close tap target at least ~44px tall.
const CLOSE_HIT_SLOP = { top: 14, bottom: 14, left: 12, right: 12 };

interface WalkHistoryScreenProps {
  buddyAppearance: BuddyAppearance;
  repository: WalkRepository;
  /**
   * Forwarded one level, unused by this screen's own rendering — the Walk
   * Portrait (openspec/changes/walk-portrait) that `onSelectWalk` opens is
   * rendered by App.tsx as its own top-level screen (design.md Decision 8),
   * not nested here. Threaded through this props interface anyway per
   * design.md Decision 8's explicit "no prop drilled further than one
   * level" wiring, so a future nested-portrait-preview doesn't need a new
   * prop plumbed in from App.tsx.
   */
  homeRangeRepository: HomeRangeRepository;
  onClose: () => void;
  /** Opens that walk's Walk Portrait (openspec/changes/walk-portrait) — every row, regardless of startSource or reward-qualifying status, is tappable to this. */
  onSelectWalk: (walk: StoredWalk) => void;
}

export function WalkHistoryScreen({ buddyAppearance, repository, onClose, onSelectWalk }: WalkHistoryScreenProps) {
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
        <TouchableOpacity onPress={onClose} hitSlop={CLOSE_HIT_SLOP}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {walks === null ? (
        <BuddyLoading appearance={buddyAppearance} text="Loading…" />
      ) : walks.length === 0 ? (
        <BuddyLoading appearance={buddyAppearance} text="No walks yet — take your dog out and claim your first territory! 🌱" />
      ) : (
        <FlatList
          data={walks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            // The row itself is the Walk Portrait tap target (openspec/changes/
            // walk-portrait) — Delete stays its own separate TouchableOpacity
            // nested inside, unchanged as a distinct tap target.
            <TouchableOpacity style={styles.row} onPress={() => onSelectWalk(item)} activeOpacity={0.7}>
              <Text style={styles.rowDate}>{new Date(item.startTime).toLocaleString()}</Text>
              <View style={styles.rowMeta}>
                {/* item.closed now means "covered enough ground to qualify for a reward" (the
                    25-painted-cell floor), not "formed a closed loop" — see
                    openspec/changes/home-range/specs/walk-lifecycle/spec.md. Wording lifted
                    directly from that spec delta's own language, not invented here.
                    "Short stroll" (not "Too short") per openspec/changes/walk-portrait's
                    resolved Open Question 3 — warm, not deficit-framed. */}
                <Text style={[styles.rowStatus, { color: item.closed ? COLORS.green : COLORS.muted }]}>
                  {item.closed ? '✓ Rewarded' : 'Short stroll'}
                </Text>
                <Text style={styles.rowPoints}>{item.locations.length} pts</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </TouchableOpacity>
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

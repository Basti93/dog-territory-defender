import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native';
import { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { StoredWalk, WalkRepository } from '../storage/WalkRepository';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyLoading } from './BuddyLoading';
import { BuddyAvatar } from './buddy';
import { EmptyState, Header, ListRow, palette, PressableScale, radii, Screen, shadows, spacing, textStyle, tokens } from '../ui';

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
    <Screen backdrop="sky">
      <Header title="Past Walks" icon="icon-walks" onBack={onClose} />

      {walks === null ? (
        <BuddyLoading appearance={buddyAppearance} text="Loading…" />
      ) : walks.length === 0 ? (
        <EmptyState title="No walks yet" message="Take your dog out and claim your first territory! 🌱">
          <BuddyAvatar appearance={buddyAppearance} size={120} mood="idle" />
        </EmptyState>
      ) : (
        <FlatList
          data={walks}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            // The row itself is the Walk Portrait tap target (openspec/changes/
            // walk-portrait) — Delete stays its own separate tap target beside it.
            <View style={styles.rowWrap}>
              {/* item.closed means "covered enough ground to qualify for a reward" (the
                  25-painted-cell floor), not "formed a closed loop" — see
                  openspec/changes/home-range/specs/walk-lifecycle/spec.md. "Short stroll"
                  per walk-portrait's resolved Open Question 3 — warm, not deficit-framed. */}
              <ListRow
                style={styles.row}
                icon="icon-walks"
                title={new Date(item.startTime).toLocaleString()}
                subtitle={`${item.closed ? '✓ Rewarded' : 'Short stroll'} · ${item.locations.length} pts`}
                subtitleColor={item.closed ? palette.greenText : undefined}
                onPress={() => onSelectWalk(item)}
              />
              <PressableScale style={styles.deleteButton} onPress={() => handleDelete(item)} accessibilityLabel="Delete walk">
                <Text style={[textStyle('small'), { color: tokens.warm }]}>Delete</Text>
              </PressableScale>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowWrap: { flexDirection: 'row', alignItems: 'stretch', marginBottom: spacing.sm, gap: spacing.sm },
  row: { flex: 1, marginBottom: 0 },
  deleteButton: {
    minWidth: 64,
    borderWidth: 2,
    borderColor: tokens.warm,
    borderRadius: radii.card,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    ...shadows.soft,
  },
});

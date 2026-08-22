import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Cell } from '../storage/HomeRangeRepository';
import { Territory } from '../storage/TerritoryRepository';
import { streetsKnown } from '../utils/grid';
import { TerritoryTitle } from '../utils/territoryTitles';
import { TerritoryPortrait } from './TerritoryPortrait';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  warm: '#F39C12',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

interface TerritoryCardProps {
  territory: Territory;
  /** This Territory's own cells only — never any other Territory's (openspec/changes/territories/design.md's "never compared" rule). */
  cells: Cell[];
  /** This Territory's character title, or `null` when it holds none this render (design.md Decision 4). */
  title: TerritoryTitle | null;
  /** Gated on the same global reveal flag every territory-income surface shares — never a per-territory threshold (design.md Decision 6's "avoids some territories showing a rate before others" rule). */
  incomeRevealed: boolean;
  /** This Territory's own absolute share of the global territoryRate — an absolute number, never a percentage (design.md Decision 6). */
  displayRate: number;
  onRename: (newName: string) => void;
  onOpenMap: () => void;
}

/**
 * One Territory's own card — exactly four monotonic stats (streets known,
 * walks here, lifetime treats earned here, first claimed), never a ranked
 * comparison to another Territory (openspec/changes/territories/design.md's
 * hard "never build" list). Mirrors StatsScreen.tsx's plain stat-card shape.
 */
export function TerritoryCard({ territory, cells, title, incomeRevealed, displayRate, onRename, onOpenMap }: TerritoryCardProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(territory.name);

  const submitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== territory.name) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  };

  return (
    <View style={styles.card}>
      <TerritoryPortrait cells={cells} onPress={onOpenMap} />

      <View style={styles.header}>
        {isRenaming ? (
          <TextInput
            style={styles.nameInput}
            value={draftName}
            onChangeText={setDraftName}
            onSubmitEditing={submitRename}
            onBlur={submitRename}
            autoFocus
          />
        ) : (
          <Text style={styles.name}>{territory.name}</Text>
        )}
        <TouchableOpacity onPress={() => (isRenaming ? submitRename() : setIsRenaming(true))} hitSlop={8}>
          <Text style={styles.editIcon}>{isRenaming ? '✓' : '✎'}</Text>
        </TouchableOpacity>
      </View>

      {title && (
        <View style={styles.titleBadge}>
          <Text style={styles.titleBadgeText}>{title}</Text>
        </View>
      )}

      <View style={styles.statGrid}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>Streets known</Text>
          <Text style={styles.statValue}>{streetsKnown(cells.length)}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>Walks here</Text>
          <Text style={styles.statValue}>{territory.walksHere}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>Treats earned here</Text>
          <Text style={styles.statValue}>{Math.floor(territory.treatsEarnedHere)}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>First claimed</Text>
          <Text style={styles.statValue}>{new Date(territory.createdAt).toLocaleDateString()}</Text>
        </View>
      </View>

      {incomeRevealed && (
        <Text style={styles.incomeLine}>≈{displayRate.toFixed(1)} treats/hour from this territory</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#eee',
    backgroundColor: COLORS.white,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.blue,
    paddingVertical: 2,
  },
  editIcon: {
    fontSize: 16,
    color: COLORS.blue,
  },
  titleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EAF7EE',
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  titleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.green,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCell: {
    width: '47%',
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '700',
    marginTop: 2,
  },
  incomeLine: {
    fontSize: 12,
    color: COLORS.warm,
    fontWeight: '600',
  },
});

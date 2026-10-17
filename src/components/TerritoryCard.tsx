import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Cell } from '../storage/HomeRangeRepository';
import { Territory } from '../storage/TerritoryRepository';
import { streetsKnown } from '../utils/grid';
import { TerritoryTitle } from '../utils/territoryTitles';
import { TerritoryPortrait } from './TerritoryPortrait';
import { Badge, Card, Chip, palette, PressableScale, radii, shadows, spacing, textStyle, tokens } from '../ui';

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
    <Card style={styles.card}>
      <TerritoryPortrait cells={cells} onPress={onOpenMap} />

      <View style={styles.header}>
        {isRenaming ? (
          <TextInput
            style={[textStyle('h2'), styles.nameInput]}
            value={draftName}
            onChangeText={setDraftName}
            onSubmitEditing={submitRename}
            onBlur={submitRename}
            autoFocus
          />
        ) : (
          <Text style={[textStyle('h2'), styles.name]}>{territory.name}</Text>
        )}
        <PressableScale
          style={styles.editButton}
          onPress={() => (isRenaming ? submitRename() : setIsRenaming(true))}
          hitSlop={8}
          accessibilityLabel={isRenaming ? 'Save name' : 'Rename territory'}
        >
          <Text style={[textStyle('h2'), { color: tokens.blue }]}>{isRenaming ? '✓' : '✎'}</Text>
        </PressableScale>
      </View>

      {title && <Badge label={title} tint="meadow" />}

      <View style={styles.statGrid}>
        <MiniStat label="Streets known" value={`${streetsKnown(cells.length)}`} />
        <MiniStat label="Walks here" value={`${territory.walksHere}`} />
        <MiniStat label="Treats earned here" value={`${Math.floor(territory.treatsEarnedHere)}`} />
        <MiniStat label="First claimed" value={new Date(territory.createdAt).toLocaleDateString()} />
      </View>

      {incomeRevealed && (
        <Chip tint="warm" icon="icon-treat" label={`≈${displayRate.toFixed(1)} treats/hour from this territory`} />
      )}
    </Card>
  );
}

/** Small clay stat tile (same look as ui/StatTile, sized for a 2x2 grid inside a card). */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[textStyle('small'), { color: palette.muted }]}>{label}</Text>
      <Text style={textStyle('h2')}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1 },
  nameInput: {
    flex: 1,
    borderBottomWidth: 2,
    borderBottomColor: tokens.green,
    paddingVertical: 2,
    lineHeight: undefined, // fixed lineHeight clips text inside a TextInput
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  miniStat: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: palette.meadowTint,
    borderRadius: radii.tile,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});

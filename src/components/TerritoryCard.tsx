import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Cell } from '../storage/HomeRangeRepository';
import { Territory } from '../storage/TerritoryRepository';
import { streetsKnown } from '../utils/grid';
import { displayTerritoryName } from '../utils/territoryDisplayName';
import { TerritoryTitle } from '../utils/territoryTitles';
import { TerritoryPortrait } from './TerritoryPortrait';
import { Badge, Card, Chip, palette, PressableScale, radii, shadows, spacing, textStyle, tokens } from '../ui';
import { formatDate, formatNumber, t } from '../i18n';

export const TERRITORY_TITLE_KEYS: Record<TerritoryTitle, string> = {
  Everyday: 'territories.title.everyday',
  'Wild One': 'territories.title.wildOne',
  'Far One': 'territories.title.farOne',
};

interface TerritoryCardProps {
  territory: Territory;
  /** This Territory's own cells only — never any other Territory's (docs/decisions/territories.md's "never compared" rule). */
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
 * comparison to another Territory (docs/decisions/territories.md's
 * hard "never build" list). Mirrors StatsScreen.tsx's plain stat-card shape.
 */
export function TerritoryCard({ territory, cells, title, incomeRevealed, displayRate, onRename, onOpenMap }: TerritoryCardProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  // Generated default names show in the current language (the stored one may be from another language or the server).
  const shownName = displayTerritoryName(territory.name);
  const [draftName, setDraftName] = useState(shownName);

  const submitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== shownName) {
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
          <Text style={[textStyle('h2'), styles.name]}>{shownName}</Text>
        )}
        <PressableScale
          style={styles.editButton}
          onPress={() => (isRenaming ? submitRename() : setIsRenaming(true))}
          hitSlop={8}
          accessibilityLabel={isRenaming ? t('territories.saveName') : t('territories.rename')}
        >
          <Text style={[textStyle('h2'), { color: tokens.blue }]}>{isRenaming ? '✓' : '✎'}</Text>
        </PressableScale>
      </View>

      {title && <Badge label={t(TERRITORY_TITLE_KEYS[title])} tint="meadow" />}

      <View style={styles.statGrid}>
        <MiniStat label={t('territories.streetsKnown')} value={formatNumber(streetsKnown(cells.length))} />
        <MiniStat label={t('territories.walksHere')} value={formatNumber(territory.walksHere)} />
        <MiniStat label={t('territories.treatsHere')} value={formatNumber(Math.floor(territory.treatsEarnedHere))} />
        <MiniStat label={t('territories.firstClaimed')} value={formatDate(territory.createdAt)} />
      </View>

      {incomeRevealed && (
        <Chip tint="warm" icon="icon-treat" label={t('territories.rateChip', { rate: formatNumber(displayRate, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })} />
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

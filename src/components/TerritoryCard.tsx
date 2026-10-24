import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Cell } from '../storage/HomeRangeRepository';
import { Territory } from '../storage/TerritoryRepository';
import { displayTerritoryName } from '../utils/territoryDisplayName';
import { LastVisit } from '../utils/territoryFacts';
import { TerritoryPortrait } from './TerritoryPortrait';
import { Card, palette, PressableScale, radii, shadows, spacing, textStyle, tokens } from '../ui';
import { API_LIMITS } from '../sync/apiContract';
import { formatNumber, t, tPlural } from '../i18n';

interface TerritoryCardProps {
  territory: Territory;
  /** This territory's own cells only: its portrait. */
  cells: Cell[];
  /** The oldest territory: "zu Hause". */
  isHome: boolean;
  /** Km from home's centre; null = unknown (or home). */
  distanceKm: number | null;
  lastVisit: LastVisit | null;
  /** This territory's own absolute share of the income, treats per hour (never a percentage). */
  displayRate: number;
  onRename: (newName: string) => void;
  onOpenMap: () => void;
}

/**
 * One territory: a small portrait, its name (a pencil renames it), how far from home, how many walks, when last, and
 * what it brings. Facts only, in a calm voice: no ranking, no title, no warning when it has been a while.
 */
export function TerritoryCard({ territory, cells, isHome, distanceKm, lastVisit, displayRate, onRename, onOpenMap }: TerritoryCardProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  // Generated default names show in the current language (the stored one may be from another language or the server).
  const shownName = displayTerritoryName(territory.name);
  const [draftName, setDraftName] = useState(shownName);

  const submitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== shownName) onRename(trimmed);
    setIsRenaming(false);
  };

  const where = isHome ? t('territories.atHome') : distanceKm !== null ? t('territories.distance', { km: formatNumber(distanceKm, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) : null;
  const rateDigits = displayRate < 0.1 ? 2 : 1;
  const facts = [
    where,
    tPlural('territories.walks', territory.walksHere),
    lastVisit ? t(`territories.last.${lastVisit === 'awhile' ? 'awhile' : lastVisit}`) : null,
    t('territories.income', { rate: formatNumber(displayRate, { minimumFractionDigits: rateDigits, maximumFractionDigits: rateDigits }) }),
  ].filter((f): f is string => f !== null);

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.portrait}>
          <TerritoryPortrait cells={cells} onPress={onOpenMap} height={96} />
        </View>
        <View style={styles.body}>
          <View style={styles.header}>
            {isRenaming ? (
              <TextInput
                style={[textStyle('h2'), styles.nameInput]}
                value={draftName}
                onChangeText={setDraftName}
                onSubmitEditing={submitRename}
                onBlur={submitRename}
                autoFocus
                maxLength={API_LIMITS.maxTerritoryNameLength}
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
              <Text style={[textStyle('body'), { color: tokens.blue }]}>{isRenaming ? '✓' : '✎'}</Text>
            </PressableScale>
          </View>
          {facts.map((fact) => (
            <Text key={fact} style={[textStyle('small'), { color: palette.muted }]}>{fact}</Text>
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  portrait: { width: 110 },
  body: { flex: 1, gap: 2 },
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
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
});

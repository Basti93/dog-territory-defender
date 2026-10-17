import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { territoryDisplayRate, territoryMass, territoryRate } from '../economy/territoryEconomy';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { Cell, HomeRangeRepository } from '../storage/HomeRangeRepository';
import { Territory, TerritoryId, TerritoryRepository } from '../storage/TerritoryRepository';
import { assignTerritoryTitles } from '../utils/territoryTitles';
import { TerritoryCard } from './TerritoryCard';

const COLORS = {
  blue: '#3498DB',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};
import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyLoading } from './BuddyLoading';

// Keeps the header Close tap target at least ~44px tall.
const CLOSE_HIT_SLOP = { top: 14, bottom: 14, left: 12, right: 12 };

interface TerritoriesScreenProps {
  buddyAppearance: BuddyAppearance;
  territoryRepository: TerritoryRepository;
  homeRangeRepository: HomeRangeRepository;
  denEconomyRepository: DenEconomyRepository;
  onOpenMap: () => void;
  onClose: () => void;
}

/**
 * The territories list screen — a read-only, repository-backed list of the
 * player's Territory cards (mirrors StatsScreen.tsx's shape), entered from
 * the map screen's own chrome (openspec/changes/territories/design.md
 * Decision 8, tasks.md task 10.3). Titles are computed fresh on every render
 * (never persisted) and per-territory income lines are gated on the same
 * global `territoryIncomeRevealed` flag every territory-income surface
 * shares — never a per-territory threshold.
 */
export function TerritoriesScreen({
  buddyAppearance,
  territoryRepository,
  homeRangeRepository,
  denEconomyRepository,
  onOpenMap,
  onClose,
}: TerritoriesScreenProps) {
  const [territories, setTerritories] = useState<Territory[] | null>(null);
  const [cellsByTerritory, setCellsByTerritory] = useState<Map<TerritoryId, Cell[]> | null>(null);
  const [incomeRevealed, setIncomeRevealed] = useState(false);
  const [globalRate, setGlobalRate] = useState(0);
  const [worldMass, setWorldMass] = useState(0);

  useEffect(() => {
    (async () => {
      const [allTerritories, mass, denState] = await Promise.all([
        territoryRepository.getTerritories(),
        homeRangeRepository.getWorldMass(),
        denEconomyRepository.getState(),
      ]);
      setTerritories(allTerritories);
      setIncomeRevealed(denState.territoryIncomeRevealed);
      const mergedWorldMass = territoryMass(mass.cellCount, mass.visitsSum);
      setWorldMass(mergedWorldMass);
      setGlobalRate(territoryRate(mergedWorldMass, denState.level));

      const cellsMap = new Map<TerritoryId, Cell[]>();
      await Promise.all(
        allTerritories.map(async (territory) => {
          cellsMap.set(territory.id, await homeRangeRepository.getCellsByTerritory(territory.id));
        })
      );
      setCellsByTerritory(cellsMap);
    })();
  }, [territoryRepository, homeRangeRepository, denEconomyRepository]);

  const handleRename = async (territoryId: TerritoryId, newName: string) => {
    await territoryRepository.renameTerritory(territoryId, newName);
    setTerritories((prev) => (prev ? prev.map((t) => (t.id === territoryId ? { ...t, name: newName } : t)) : prev));
  };

  if (!territories || !cellsByTerritory) {
    return (
      <View style={styles.container}>
        <BuddyLoading appearance={buddyAppearance} text="Loading…" />
      </View>
    );
  }

  const titles = assignTerritoryTitles(territories, cellsByTerritory, Date.now());

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Territories</Text>
        <TouchableOpacity onPress={onClose} hitSlop={CLOSE_HIT_SLOP}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {territories.length === 0 ? (
        <View style={styles.emptyState}>
          <BuddyLoading appearance={buddyAppearance} text="No territories claimed yet — go for a walk to start your first one." />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {territories.map((territory) => {
            const cells = cellsByTerritory.get(territory.id) ?? [];
            const mass = territoryMass(cells.length, cells.reduce((sum, c) => sum + c.visits, 0));
            return (
              <TerritoryCard
                key={territory.id}
                territory={territory}
                cells={cells}
                title={titles.get(territory.id) ?? null}
                incomeRevealed={incomeRevealed}
                displayRate={territoryDisplayRate(mass, worldMass, globalRate)}
                onRename={(name) => handleRename(territory.id, name)}
                onOpenMap={onOpenMap}
              />
            );
          })}
        </ScrollView>
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
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
  },
  scroll: {
    padding: 16,
  },
});

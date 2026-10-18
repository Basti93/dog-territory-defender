import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { territoryDisplayRate, territoryMass, territoryRate } from '../economy/territoryEconomy';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { Cell, HomeRangeRepository } from '../storage/HomeRangeRepository';
import { Territory, TerritoryId, TerritoryRepository } from '../storage/TerritoryRepository';
import { assignTerritoryTitles } from '../utils/territoryTitles';
import { TerritoryCard } from './TerritoryCard';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyLoading } from './BuddyLoading';
import { BuddyAvatar } from './buddy';
import { EmptyState, Header, Screen } from '../ui';
import { t } from '../i18n';

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
 * the map screen's own chrome (docs/decisions/territories/design.md
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
    setTerritories((prev) => (prev ? prev.map((x) => (x.id === territoryId ? { ...x, name: newName } : x)) : prev));
  };

  if (!territories || !cellsByTerritory) {
    return (
      <Screen>
        <BuddyLoading appearance={buddyAppearance} text={t('common.loading')} />
      </Screen>
    );
  }

  const titles = assignTerritoryTitles(territories, cellsByTerritory, Date.now());

  const header = <Header title={t('territories.title')} icon="icon-pin" onBack={onClose} />;

  if (territories.length === 0) {
    return (
      <Screen backdrop="sky">
        {header}
        <EmptyState title={t('territories.empty.title')} message={t('territories.empty.message')}>
          <BuddyAvatar appearance={buddyAppearance} size={120} mood="idle" />
        </EmptyState>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll backdrop="sky">
        {header}
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
      </Screen>
    </KeyboardAvoidingView>
  );
}

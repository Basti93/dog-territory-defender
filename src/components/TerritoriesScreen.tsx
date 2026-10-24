import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { territoryDisplayRate, territoryMass, territoryRate } from '../economy/territoryEconomy';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { Cell, HomeRangeRepository } from '../storage/HomeRangeRepository';
import { Territory, TerritoryId, TerritoryRepository } from '../storage/TerritoryRepository';
import { pickHomeTerritoryId } from '../utils/territoryCluster';
import { distanceKmBetween, lastVisitOf } from '../utils/territoryFacts';
import { dogDisplayName } from '../economy/denEconomy';
import { TerritoryCard } from './TerritoryCard';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyLoading } from './BuddyLoading';
import { BuddyAvatar } from './buddy';
import { EmptyState, Header, Screen, palette, spacing, textStyle } from '../ui';
import { Text } from 'react-native';
import { t } from '../i18n';
import { API_LIMITS } from '../sync/apiContract';

interface TerritoriesScreenProps {
  buddyAppearance: BuddyAppearance;
  territoryRepository: TerritoryRepository;
  homeRangeRepository: HomeRangeRepository;
  denEconomyRepository: DenEconomyRepository;
  onOpenMap: () => void;
  onClose: () => void;
  /** A name was saved locally: a joined household also sends it to the server. */
  onRenamed?: (territoryId: TerritoryId, name: string) => void;
}

/**
 * The Reviere list: one calm card per territory (portrait, name, distance from home, walks, last visit, income) under
 * one sentence of what a Revier is. A lone territory gets a wish, never a push. Entered from the map screen's chrome.
 */
export function TerritoriesScreen({
  buddyAppearance,
  territoryRepository,
  homeRangeRepository,
  denEconomyRepository,
  onOpenMap,
  onClose,
  onRenamed,
}: TerritoriesScreenProps) {
  const [territories, setTerritories] = useState<Territory[] | null>(null);
  const [cellsByTerritory, setCellsByTerritory] = useState<Map<TerritoryId, Cell[]> | null>(null);
  const [dog, setDog] = useState('Buddy');
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
      setDog(dogDisplayName(denState.dogName));
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
    newName = newName.slice(0, API_LIMITS.maxTerritoryNameLength);
    await territoryRepository.renameTerritory(territoryId, newName);
    setTerritories((prev) => (prev ? prev.map((x) => (x.id === territoryId ? { ...x, name: newName } : x)) : prev));
    onRenamed?.(territoryId, newName);
  };

  if (!territories || !cellsByTerritory) {
    return (
      <Screen>
        <BuddyLoading appearance={buddyAppearance} text={t('common.loading')} />
      </Screen>
    );
  }

  const now = Date.now();
  const homeId = pickHomeTerritoryId(new Map(territories.map((x) => [x.id, x.createdAt] as const)));
  const homeCells = (homeId && cellsByTerritory.get(homeId)) || [];

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
        <Text style={[textStyle('body'), { color: palette.muted, marginBottom: spacing.md }]}>{t('territories.intro', { dog })}</Text>
        {territories.map((territory) => {
          const cells = cellsByTerritory.get(territory.id) ?? [];
          const mass = territoryMass(cells.length, cells.reduce((sum, c) => sum + c.visits, 0));
          return (
            <TerritoryCard
              key={territory.id}
              territory={territory}
              cells={cells}
              isHome={territory.id === homeId}
              distanceKm={territory.id === homeId ? null : distanceKmBetween(cells, homeCells)}
              lastVisit={lastVisitOf(cells, now)}
              displayRate={territoryDisplayRate(mass, worldMass, globalRate)}
              onRename={(name) => handleRename(territory.id, name)}
              onOpenMap={onOpenMap}
            />
          );
        })}
        {territories.length === 1 && <Text style={[textStyle('body'), { color: palette.muted }]}>{t('territories.wish')}</Text>}
      </Screen>
    </KeyboardAvoidingView>
  );
}

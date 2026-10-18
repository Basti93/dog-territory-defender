import { useCallback, useEffect, useRef, useState } from 'react';

import { weirdUpgradeLine } from '../components/weirdCopy';
import { ART_TIER_4_FROM_LEVEL } from '../components/den/YardScene';
import { BALANCE, BuildingKey } from '../economy/balanceConfig';
import { DenEconomyState, getBuildingLevel, getUpgradeTease, upgradeBuilding } from '../economy/denEconomy';
import { buddyPayout, buddyTreatsPerWalk, passiveTreatsPerHour, storageCap, upgradeCost } from '../economy/formulas';
import { AchievementId, recordBuildingUpgrade } from '../economy/personalStats';
import * as haptics from '../feedback/haptics';
import { play } from '../feedback/sounds';
import { formatNumber, t, tPlural } from '../i18n';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { PersonalStatsRepository } from '../storage/PersonalStatsRepository';

// The Den's upgrade logic (state, spend, achievements, Buddy's excited beat), shared by the
// world scene's building panel and the legacy DenScreen. Extracted from DenScreen; no numbers changed.

// nameKey/subKey are i18n keys, resolved with t() at render time.
export const BUILDING_DISPLAY: Record<BuildingKey, { nameKey: string; subKey: string; art: 'doghouse' | 'bakery' | 'garden' }> = {
  doghouse: { nameKey: 'den.building.doghouse.name', subKey: 'den.building.doghouse.sub', art: 'doghouse' },
  bakery: { nameKey: 'den.building.bakery.name', subKey: 'den.building.bakery.sub', art: 'bakery' },
  sniffGarden: { nameKey: 'den.building.sniffGarden.name', subKey: 'den.building.sniffGarden.sub', art: 'garden' },
};

export const BUILDING_ORDER: BuildingKey[] = ['doghouse', 'bakery', 'sniffGarden'];

/** How long Buddy stays excited after an upgrade (fun review: settle in ~3s). */
export const EXCITED_AFTER_UPGRADE_MS = 3000;

/**
 * `level` is the building's own level being described (either its current level, or level+1 for
 * the "Next:" preview); `state` supplies the other context (Buddy's level, the other buildings).
 */
export function effectText(building: BuildingKey, level: number, state: DenEconomyState): string {
  switch (building) {
    case 'doghouse':
      return t('den.effect.storage', { count: formatNumber(storageCap(level, state.level, state.bakeryLevel, state.sniffGardenLevel)) });
    case 'bakery':
      return t('den.effect.passive', { rate: formatNumber(passiveTreatsPerHour(level, state.level), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
    case 'sniffGarden': {
      const withGarden = buddyTreatsPerWalk(state.level, level);
      const withoutGarden = buddyPayout(state.level);
      const extra = withGarden - withoutGarden;
      if (extra < 1) {
        return t('den.effect.sniffWarmup');
      }
      return tPlural('den.effect.sniffExtra', extra);
    }
  }
}

/** The cheapest building upgrade Buddy can afford right now (he sniffs toward it), or undefined. */
export function cheapestAffordableUpgrade(state: DenEconomyState): { building: BuildingKey; cost: number } | undefined {
  return BUILDING_ORDER.map((b) => {
    const lvl = getBuildingLevel(state, b);
    return lvl >= BALANCE.maxBuildingLevel ? null : { building: b, cost: upgradeCost(b, lvl + 1) };
  })
    .filter((c): c is { building: BuildingKey; cost: number } => c !== null && c.cost <= state.treats)
    .sort((a, b) => a.cost - b.cost)[0];
}

export interface UseDenOptions {
  repository: DenEconomyRepository;
  personalStatsRepository: PersonalStatsRepository;
  /** App's own live balance/level (reconciled by sync and walk rewards); they override the stored values. */
  liveTreats?: number;
  liveLevel?: number;
  onTreatsChanged: (treats: number) => void;
  /** Household sync: called after an upgrade was saved locally. */
  onUpgraded?: (building: BuildingKey) => void;
  /** Called once with the stored state after the first load. */
  onLoaded?: (state: DenEconomyState) => void;
  /** Called after a successful upgrade (the Den plays its fireflies extra here). */
  onUpgradeApplied?: () => void;
}

export function useDen({
  repository,
  personalStatsRepository,
  liveTreats,
  liveLevel,
  onTreatsChanged,
  onUpgraded,
  onLoaded,
  onUpgradeApplied,
}: UseDenOptions) {
  const [stored, setStored] = useState<DenEconomyState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [achievementNotices, setAchievementNotices] = useState<AchievementId[]>([]);
  const [upgrade, setUpgrade] = useState<{ building: BuildingKey; n: number } | null>(null);
  const [excited, setExcited] = useState(false);
  const [weirdNote, setWeirdNote] = useState<string | null>(null);
  const excitedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
      if (excitedTimer.current) clearTimeout(excitedTimer.current);
    },
    []
  );

  useEffect(() => {
    repository.getState().then((s) => {
      if (!alive.current) return;
      setStored(s);
      onLoaded?.(s);
    });
    // Loaded once per repository; onLoaded is a one-shot hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository]);

  const state: DenEconomyState | null = stored
    ? { ...stored, treats: liveTreats ?? stored.treats, level: liveLevel ?? stored.level }
    : null;

  const handleUpgrade = useCallback(
    async (building: BuildingKey) => {
      if (!state) return;
      const result = upgradeBuilding(state, building);
      if ('error' in result) {
        setMessage(
          result.error === 'max-level'
            ? t('den.maxLevelMessage', { name: t(BUILDING_DISPLAY[building].nameKey) })
            : t('den.notEnoughTreats')
        );
        return;
      }
      setMessage(null);
      play('upgrade');
      haptics.success();
      setUpgrade((prev) => ({ building, n: (prev?.n ?? 0) + 1 }));
      setExcited(true);
      if (excitedTimer.current) clearTimeout(excitedTimer.current);
      excitedTimer.current = setTimeout(() => setExcited(false), EXCITED_AFTER_UPGRADE_MS);
      setStored(result);
      const newLevel = getBuildingLevel(result, building);
      setWeirdNote(newLevel >= ART_TIER_4_FROM_LEVEL ? weirdUpgradeLine(building, newLevel) : null);
      onUpgradeApplied?.();
      onTreatsChanged(result.treats);
      await repository.saveState(result);
      onUpgraded?.(building);

      const personalStats = await personalStatsRepository.getState();
      const { newlyUnlocked } = recordBuildingUpgrade(personalStats, state, result);
      if (newlyUnlocked.length > 0) {
        await personalStatsRepository.unlockAchievements(newlyUnlocked, Date.now());
        if (alive.current) setAchievementNotices((prev) => [...prev, ...newlyUnlocked]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, repository, personalStatsRepository, onTreatsChanged, onUpgraded, onUpgradeApplied]
  );

  return {
    state,
    message,
    achievementNotices,
    setAchievementNotices,
    upgrade,
    excited,
    weirdNote,
    handleUpgrade,
    tease: state ? getUpgradeTease(state) : null,
    cheapestAffordable: state ? cheapestAffordableUpgrade(state) : undefined,
  };
}

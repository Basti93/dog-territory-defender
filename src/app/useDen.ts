import { useCallback, useEffect, useRef, useState } from 'react';

import { bowlAtCap } from '../components/world/bakeryRules';
import { weirdUpgradeLine } from '../components/weirdCopy';
import { ART_TIER_4_FROM_LEVEL } from '../components/den/YardScene';
import { BALANCE, BuildingKey } from '../economy/balanceConfig';
import {
  applyBuddyTap,
  applyPassiveAccrual,
  DenEconomyState,
  getBuildingLevel,
  getUpgradeTease,
  harvestPile,
  upgradeBuilding,
} from '../economy/denEconomy';
import { buddyPayout, buddyTreatsPerWalk, passiveTreatsPerHour, storageCap, upgradeCost } from '../economy/formulas';
import { AchievementId, recordBuildingUpgrade, recordTreatsEarned } from '../economy/personalStats';
import * as haptics from '../feedback/haptics';
import { play } from '../feedback/sounds';
import { formatNumber, t, tPlural } from '../i18n';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { PersonalStatsRepository } from '../storage/PersonalStatsRepository';
import { dayKeyInZone } from '../utils/householdDay';

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

/**
 * The short "what the next level gives" line under a building's sign ("→ +6/hr", "→ room for 6,356"),
 * or null at max level. Same formulas as effectText, just compact; no numbers of its own.
 */
export function nextEffectLabel(building: BuildingKey, state: DenEconomyState): string | null {
  const level = getBuildingLevel(state, building);
  if (level >= BALANCE.maxBuildingLevel) return null;
  const next = level + 1;
  switch (building) {
    case 'doghouse':
      return t('world.nextEffect.storage', { count: formatNumber(storageCap(next, state.level, state.bakeryLevel, state.sniffGardenLevel)) });
    case 'bakery':
      return t('world.nextEffect.passive', {
        rate: formatNumber(passiveTreatsPerHour(next, state.level), { minimumFractionDigits: 0, maximumFractionDigits: 1 }),
      });
    case 'sniffGarden': {
      const extra = buddyTreatsPerWalk(state.level, next) - buddyPayout(state.level);
      return extra < 1 ? t('world.nextEffect.sniffWarmup') : t('world.nextEffect.sniff', { count: formatNumber(extra) });
    }
  }
}

/** Every building whose next upgrade Buddy can afford right now, cheapest first. */
export function affordableUpgrades(state: DenEconomyState): Array<{ building: BuildingKey; cost: number }> {
  return BUILDING_ORDER.map((b) => {
    const lvl = getBuildingLevel(state, b);
    return lvl >= BALANCE.maxBuildingLevel ? null : { building: b, cost: upgradeCost(b, lvl + 1) };
  })
    .filter((c): c is { building: BuildingKey; cost: number } => c !== null && c.cost <= state.treats + state.pile)
    .sort((a, b) => a.cost - b.cost);
}

/** The cheapest building upgrade Buddy can afford right now (he sniffs toward it), or undefined. */
export function cheapestAffordableUpgrade(state: DenEconomyState): { building: BuildingKey; cost: number } | undefined {
  return affordableUpgrades(state)[0];
}

export interface UseDenOptions {
  repository: DenEconomyRepository;
  personalStatsRepository: PersonalStatsRepository;
  /** App's own live balance/level (reconciled by sync and walk rewards); they override the stored values. */
  liveTreats?: number;
  liveLevel?: number;
  /** The app's live pile (harvest); it overrides the stored one like liveTreats. */
  livePile?: number;
  onTreatsChanged: (treats: number) => void;
  /** The pile changed (harvested, banked by an upgrade, or filled). */
  onPileChanged?: (pile: number) => void;
  /** World mass for the territory part of passive income; omitted = bakery only. */
  getWorldMass?: () => Promise<{ cellCount: number; visitsSum: number }>;
  /** Household sync: a harvest was saved locally at `at` (ms). */
  onHarvested?: (at: number) => void;
  /** Household sync: one rewarded Buddy tap paid `treats` (the caller batches them). */
  onBuddyTap?: (treats: number) => void;
  /** Day key for the Buddy tap counter (the household timezone, as the server counts it); default = the device's day. */
  getDayKey?: (now: number) => Promise<string>;
  /** Rolls 1..3 for a Buddy tap; injectable for tests. */
  rollBuddyTap?: () => number;
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
  livePile,
  onTreatsChanged,
  onPileChanged,
  getWorldMass,
  onHarvested,
  onBuddyTap,
  getDayKey = async (now: number) => dayKeyInZone(now),
  rollBuddyTap = () => 1 + Math.floor(Math.random() * 3),
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
  // Bumps when a pile moved into the bank (harvest tap or upgrade): the scene flies treats bowl -> pill.
  const [harvested, setHarvested] = useState<{ n: number; amount: number; bankBefore?: number } | null>(null);
  // Bumps on every rewarded Buddy tap: the scene pops "+N" above him.
  const [buddyPop, setBuddyPop] = useState<{ n: number; amount: number } | null>(null);
  const harvestBusy = useRef(false);
  const lastBuddyTapAt = useRef(0);
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

  // The app's live numbers changed (sync pull, walk reward, launch): re-read the saved state so lastTickAt, pile and the tap counter follow.
  useEffect(() => {
    repository.getState().then((s) => {
      if (alive.current) setStored(s);
    });
  }, [repository, liveTreats, livePile, liveLevel]);

  const state: DenEconomyState | null = stored
    ? { ...stored, treats: liveTreats ?? stored.treats, level: liveLevel ?? stored.level, pile: livePile ?? stored.pile }
    : null;

  /** Counts treats that reached the bank from the pile as earned (stats and badges), like a walk's reward. */
  const recordHarvestedStats = async (amount: number) => {
    const personalStats = await personalStatsRepository.getState();
    const { stats, newlyUnlocked } = recordTreatsEarned(personalStats, amount);
    await personalStatsRepository.saveState(stats);
    if (newlyUnlocked.length > 0) {
      await personalStatsRepository.unlockAchievements(newlyUnlocked, Date.now());
      if (alive.current) setAchievementNotices((prev) => [...prev, ...newlyUnlocked]);
    }
  };

  /** The harvest tap: settle the pile up to now, move it into the bank. Returns the amount moved (0 = nothing to collect yet). */
  const handleHarvest = useCallback(async (): Promise<number> => {
    if (harvestBusy.current) return 0;
    harvestBusy.current = true;
    try {
      const fresh = await repository.getState();
      const now = Date.now();
      const accrued = applyPassiveAccrual(fresh, now, getWorldMass ? await getWorldMass() : undefined);
      const amount = accrued.pile;
      // A leftover under 1 can only be harvested when it is all that is left to fill the cap (else it would stay stuck).
      if (amount < 1 && !(amount > 0 && bowlAtCap(accrued.treats + amount, storageCap(accrued.doghouseLevel, accrued.level, accrued.bakeryLevel, accrued.sniffGardenLevel)))) return 0;
      const next = harvestPile(accrued);
      if (alive.current) setStored(next);
      onTreatsChanged(next.treats);
      onPileChanged?.(0);
      await repository.saveState(next);
      if (alive.current) setHarvested((prev) => ({ n: (prev?.n ?? 0) + 1, amount, bankBefore: fresh.treats }));
      onHarvested?.(now);
      await recordHarvestedStats(amount);
      return amount;
    } finally {
      harvestBusy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, getWorldMass, onTreatsChanged, onPileChanged, onHarvested]);

  /**
   * A tap on Buddy: 1-3 bonus treats into the bank (max 30 per day, never past the cap). Returns what was paid; 0 means
   * Buddy only reacted (limit reached, bank full, or a double tap inside the 250 ms debounce). Nothing says why.
   */
  const handleBuddyTap = useCallback(async (): Promise<number> => {
    const now = Date.now();
    if (now - lastBuddyTapAt.current < 250) return 0;
    lastBuddyTapAt.current = now;
    const stored = await repository.getState();
    // Settle the pile first so the room under the cap is the same one the server sees.
    const fresh = applyPassiveAccrual(stored, now, getWorldMass ? await getWorldMass() : undefined);
    const { state: next, credited } = applyBuddyTap(fresh, await getDayKey(now), rollBuddyTap());
    if (credited === 0) return 0;
    if (alive.current) setStored(next);
    onTreatsChanged(next.treats);
    onPileChanged?.(next.pile);
    await repository.saveState(next);
    if (alive.current) setBuddyPop((prev) => ({ n: (prev?.n ?? 0) + 1, amount: credited }));
    onBuddyTap?.(credited);
    return credited;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, getWorldMass, getDayKey, onTreatsChanged, onPileChanged, onBuddyTap, rollBuddyTap]);

  const handleUpgrade = useCallback(
    async (building: BuildingKey) => {
      if (!state) return;
      // Settle the pile up to now first (an upgrade banks it), so "not enough" is never shown while cookies wait.
      const settled = applyPassiveAccrual(state, Date.now(), getWorldMass ? await getWorldMass() : undefined);
      const result = upgradeBuilding(settled, building);
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
      onPileChanged?.(result.pile);
      await repository.saveState(result);
      if (settled.pile >= 1) {
        setHarvested((prev) => ({ n: (prev?.n ?? 0) + 1, amount: settled.pile }));
        await recordHarvestedStats(settled.pile);
      }
      onUpgraded?.(building);

      const personalStats = await personalStatsRepository.getState();
      const { newlyUnlocked } = recordBuildingUpgrade(personalStats, state, result);
      if (newlyUnlocked.length > 0) {
        await personalStatsRepository.unlockAchievements(newlyUnlocked, Date.now());
        if (alive.current) setAchievementNotices((prev) => [...prev, ...newlyUnlocked]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, repository, personalStatsRepository, onTreatsChanged, onPileChanged, getWorldMass, onUpgraded, onUpgradeApplied]
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
    handleHarvest,
    handleBuddyTap,
    harvested,
    buddyPop,
    tease: state ? getUpgradeTease(state) : null,
    cheapestAffordable: state ? cheapestAffordableUpgrade(state) : undefined,
    affordable: state ? affordableUpgrades(state) : [],
  };
}

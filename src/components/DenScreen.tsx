import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyLoading } from './BuddyLoading';
import { BuddyMood } from './buddy/buddyMood';
import {
  AnimatedNumber,
  ArtImage,
  Button,
  Card,
  Header,
  Screen,
  TreatPop,
  palette,
  radii,
  shadows,
  spacing,
  textStyle,
  tokens,
} from '../ui';
import { buildingArt } from '../art/artAssets';
import { YARD_ORDER, YardBuildingKey, YardScene, artTierForLevel, yardHeightFor } from './den/YardScene';

import { BALANCE, BuildingKey } from '../economy/balanceConfig';
import {
  upgradeCost,
  storageCap,
  passiveTreatsPerHour,
  buddyPayout,
  buddyTreatsPerWalk,
  cumulativeXpForLevel,
} from '../economy/formulas';
import { DenEconomyState, dogDisplayName, getBuildingLevel, getUpgradeTease, upgradeBuilding } from '../economy/denEconomy';
import { ACHIEVEMENTS, AchievementId, recordBuildingUpgrade } from '../economy/personalStats';
import { territoryMass, territoryRate } from '../economy/territoryEconomy';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { PersonalStatsRepository } from '../storage/PersonalStatsRepository';
import { streetsKnown } from '../utils/grid';

const BUILDING_DISPLAY: Record<BuildingKey, { name: string; sub: string; art: 'doghouse' | 'bakery' | 'garden' }> = {
  doghouse: { name: 'Doghouse', sub: 'Treat storage', art: 'doghouse' },
  bakery: { name: 'Treat Bakery', sub: 'Passive treats', art: 'bakery' },
  sniffGarden: { name: 'Sniff Garden', sub: 'Helps Buddy find more on a walk', art: 'garden' },
};

const BUILDING_ORDER: BuildingKey[] = ['doghouse', 'bakery', 'sniffGarden'];

// How long Buddy stays excited after an upgrade (fun review: settle in ~3s).
const EXCITED_AFTER_UPGRADE_MS = 3000;

/**
 * `level` is the building's own level being described (either its current
 * level, or level+1 for the "Next:" preview) — `state` supplies the other
 * context (Buddy's level, the other buildings' levels) needed now that
 * storage/passive/Sniff-Garden all read Buddy's Level too (see
 * openspec/changes/virtual-dog-companion/design.md).
 */
function effectText(building: BuildingKey, level: number, state: DenEconomyState): string {
  switch (building) {
    case 'doghouse':
      return `Storage: ${storageCap(level, state.level, state.bakeryLevel, state.sniffGardenLevel)} treats`;
    case 'bakery':
      return `+${passiveTreatsPerHour(level, state.level).toFixed(1)} treats/hour`;
    case 'sniffGarden': {
      const withGarden = buddyTreatsPerWalk(state.level, level);
      const withoutGarden = buddyPayout(state.level);
      const extra = withGarden - withoutGarden;
      if (extra < 1) {
        return "Buddy's nose is just getting warmed up";
      }
      return `Buddy sniffs out ${extra} more treat${extra === 1 ? '' : 's'} a walk`;
    }
  }
}

interface DenScreenProps {
  repository: DenEconomyRepository;
  personalStatsRepository: PersonalStatsRepository;
  /** Optional so existing tests/callers that don't care about the "Buddy knows N streets" stat (tasks.md task 3.3) don't need to supply a Home Range repository — omitted means the stat line simply doesn't render. */
  homeRangeRepository?: HomeRangeRepository;
  /** Buddy's look (buddy-comes-alive). */
  buddyAppearance: BuddyAppearance;
  /** Treats accrued while away, from App.tsx. Shown once as a float-up on mount; 0 or omitted shows nothing. */
  accruedSinceLastVisit?: number;
  /** Called on mount so App.tsx does not hand the same amount to later Den visits. */
  onAccrualShown?: () => void;
  pendingAchievements?: AchievementId[];
  onAcknowledgePendingAchievements?: () => void;
  onClose: () => void;
  onTreatsChanged: (treats: number) => void;
}

export function DenScreen({
  repository,
  personalStatsRepository,
  homeRangeRepository,
  buddyAppearance,
  accruedSinceLastVisit = 0,
  onAccrualShown,
  pendingAchievements = [],
  onAcknowledgePendingAchievements,
  onClose,
  onTreatsChanged,
}: DenScreenProps) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<DenEconomyState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showOverflowNotice, setShowOverflowNotice] = useState(false);
  const [achievementNotices, setAchievementNotices] = useState<AchievementId[]>([]);
  const [rangeCellCount, setRangeCellCount] = useState<number | null>(null);
  // openspec/changes/territories/design.md Decision 6's permanent footer
  // line — this screen's own fetch, independent of whatever App.tsx last
  // computed at the mount effect (the Den can be opened long after that).
  const [territoryIncomeRate, setTerritoryIncomeRate] = useState<number | null>(null);
  // Captured once so the float-up keeps its amount after App clears its copy.
  const [accrualPop] = useState(Math.floor(accruedSinceLastVisit));
  const [upgrade, setUpgrade] = useState<{ building: BuildingKey; n: number } | null>(null);
  const [excited, setExcited] = useState(false);
  const excitedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Building tapped in the yard: Buddy hops toward it and its card is highlighted below.
  const [selected, setSelected] = useState<BuildingKey | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef<Partial<Record<BuildingKey, number>>>({});
  const { height: screenHeight } = useWindowDimensions();

  useEffect(() => {
    onAccrualShown?.();
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (excitedTimer.current) clearTimeout(excitedTimer.current);
    },
    []
  );

  useEffect(() => {
    repository.getState().then((s) => {
      setState(s);
      if (s.treats >= storageCap(s.doghouseLevel, s.level, s.bakeryLevel, s.sniffGardenLevel)) {
        setShowOverflowNotice(true);
      }
      if (s.territoryIncomeRevealed && homeRangeRepository) {
        homeRangeRepository.getWorldMass().then((mass) => {
          setTerritoryIncomeRate(territoryRate(territoryMass(mass.cellCount, mass.visitsSum), s.level));
        });
      }
    });
  }, [repository, homeRangeRepository]);

  useEffect(() => {
    if (!homeRangeRepository) return;
    homeRangeRepository.getCells().then((cells) => setRangeCellCount(cells.length));
  }, [homeRangeRepository]);

  useEffect(() => {
    if (pendingAchievements.length > 0) {
      setAchievementNotices((prev) => [...prev, ...pendingAchievements]);
      onAcknowledgePendingAchievements?.();
    }
    // Only meant to run once per batch of pending achievements handed down from App.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAchievements]);

  if (!state) {
    return (
      <Screen>
        <BuddyLoading appearance={buddyAppearance} text="Loading…" />
      </Screen>
    );
  }

  const tease = getUpgradeTease(state);
  const cap = storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel);

  // Buddy sniffs toward the cheapest upgrade he can afford right now, if any.
  const cheapestAffordable = BUILDING_ORDER.map((b) => {
    const lvl = getBuildingLevel(state, b);
    return lvl >= BALANCE.maxBuildingLevel ? null : { building: b, cost: upgradeCost(b, lvl + 1) };
  })
    .filter((c): c is { building: BuildingKey; cost: number } => c !== null && c.cost <= state.treats)
    .sort((a, b) => a.cost - b.cost)[0];
  const curiousTarget: YardBuildingKey | null = selected ?? cheapestAffordable?.building ?? null;
  const sceneMood: BuddyMood = excited ? 'excited' : curiousTarget ? 'curious' : 'idle';

  const handleSelectBuilding = (building: BuildingKey) => {
    setSelected(building);
    const y = cardY.current[building];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
  };

  const handleUpgrade = async (building: BuildingKey) => {
    const result = upgradeBuilding(state, building);
    if ('error' in result) {
      setMessage(
        result.error === 'max-level'
          ? `${BUILDING_DISPLAY[building].name} is already at max level!`
          : 'Not enough treats yet — keep walking!'
      );
      return;
    }
    setMessage(null);
    setUpgrade((prev) => ({ building, n: (prev?.n ?? 0) + 1 }));
    setExcited(true);
    if (excitedTimer.current) clearTimeout(excitedTimer.current);
    excitedTimer.current = setTimeout(() => setExcited(false), EXCITED_AFTER_UPGRADE_MS);
    setState(result);
    onTreatsChanged(result.treats);
    await repository.saveState(result);

    const personalStats = await personalStatsRepository.getState();
    const { newlyUnlocked } = recordBuildingUpgrade(personalStats, state, result);
    if (newlyUnlocked.length > 0) {
      await personalStatsRepository.unlockAchievements(newlyUnlocked, Date.now());
      setAchievementNotices((prev) => [...prev, ...newlyUnlocked]);
    }
  };

  const dog = dogDisplayName(state.dogName);
  const xpIntoLevel = state.xp - cumulativeXpForLevel(state.level);
  const xpForLevel = cumulativeXpForLevel(state.level + 1) - cumulativeXpForLevel(state.level);
  const atMaxLevel = state.level >= BALANCE.leveling.maxLevel;

  return (
    <View style={styles.container}>
      {/* The yard is the hero: pinned to the top ~48% of the screen. */}
      <YardScene
        appearance={buddyAppearance}
        name={dog}
        buildings={YARD_ORDER.map((key) => ({ key, level: getBuildingLevel(state, key) }))}
        mood={sceneMood}
        curiousAbout={curiousTarget}
        upgrade={upgrade}
        onSelectBuilding={handleSelectBuilding}
        height={yardHeightFor(screenHeight)}
      >
        <HeaderOverlay onClose={onClose} />
      </YardScene>

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.scroll, { paddingBottom: spacing.xxl + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {showOverflowNotice && (
          <Card tint="warm">
            <Text style={textStyle('body')}>Your Treat Bakery filled up while you were away! 🦴</Text>
          </Card>
        )}

        {achievementNotices.map((id, i) => (
          <Card key={`${id}-${i}`} tint="warm">
            <Text style={textStyle('body')}>🏅 New badge: {ACHIEVEMENTS[id].copyTitle}</Text>
          </Card>
        ))}

        <View style={styles.treatsRow}>
          <View style={styles.treatsChip}>
            <ArtImage art="icon-treat" size={36} />
            <AnimatedNumber
              value={Math.floor(state.treats)}
              format={(n) => `${n} / ${cap}`}
              style={textStyle('h1')}
            />
            {accrualPop > 0 && <TreatPop amount={accrualPop} style={styles.accrualPop} />}
          </View>
          <Text style={[textStyle('small'), { color: palette.muted }]}>Treats</Text>
        </View>

        {tease && (
          <Card tint="warm">
            <Text style={[textStyle('small'), { color: palette.muted }]}>Next up in the Den</Text>
            <Text style={textStyle('h2')}>
              {BUILDING_DISPLAY[tease.building].name} — {tease.cost} treats
              {tease.affordable ? ' (you can afford it now!)' : ''}
            </Text>
          </Card>
        )}

        {message && <Text style={[textStyle('small'), styles.message]}>{message}</Text>}

        {BUILDING_ORDER.map((building) => {
          const display = BUILDING_DISPLAY[building];
          const level = getBuildingLevel(state, building);
          const maxed = level >= BALANCE.maxBuildingLevel;
          const cost = maxed ? null : upgradeCost(building, level + 1);
          const isTease = tease?.building === building;
          const affordable = cost !== null && cost <= state.treats;

          return (
            <View
              key={building}
              onLayout={(e) => {
                cardY.current[building] = e.nativeEvent.layout.y;
              }}
            >
              <Card style={selected === building ? styles.cardSelected : undefined}>
                <View style={styles.cardRow}>
                  <ArtImage art={buildingArt(display.art, artTierForLevel(level))} size={80} />
                  <View style={styles.cardBody}>
                    <Text style={textStyle('h2')}>{display.name}</Text>
                    <Text style={[textStyle('small'), { color: palette.muted }]}>{display.sub}</Text>
                    <Text style={[textStyle('small'), styles.cardEffect]}>
                      Level {level} — {effectText(building, level, state)}
                    </Text>
                    {!maxed ? (
                      <Text style={[textStyle('small'), { color: palette.muted }]}>
                        Next: {effectText(building, level + 1, state)}
                      </Text>
                    ) : (
                      <Text style={[textStyle('small'), { color: palette.greenText }]}>Max level!</Text>
                    )}
                  </View>
                </View>
                {!maxed && (
                  <Button
                    label={`${isTease ? 'Next upgrade: ' : 'Upgrade: '}${cost} treats`}
                    variant={affordable ? 'primary' : 'secondary'}
                    onPress={() => handleUpgrade(building)}
                    style={styles.cardButton}
                  />
                )}
              </Card>
            </View>
          );
        })}

        <Card>
          <View style={styles.levelHeader}>
            <Text style={textStyle('h2')}>
              {dog} — Level {state.level}
            </Text>
            {!atMaxLevel && (
              <Text style={[textStyle('small'), { color: palette.muted }]}>
                {Math.floor(xpIntoLevel)} / {xpForLevel} XP
              </Text>
            )}
          </View>
          <View style={styles.levelBarTrack}>
            <View
              style={[
                styles.levelBarFill,
                { width: atMaxLevel ? '100%' : `${Math.min(100, (xpIntoLevel / xpForLevel) * 100)}%` },
              ]}
            />
          </View>
          {/* Accepted verbatim copy shape (openspec/changes/virtual-dog-companion), numbers filled in — tasks.md task 4.1. */}
          <Text style={[textStyle('small'), styles.levelBarRate]}>
            {dog} brings home {buddyTreatsPerWalk(state.level, state.sniffGardenLevel)} treats a walk.
            {!atMaxLevel ? ` Next level: ${buddyTreatsPerWalk(state.level + 1, state.sniffGardenLevel)}.` : ''}
          </Text>
          {/* "Buddy knows N streets by heart" (openspec/changes/home-range/design.md Decision 5's
              headline stat) — hidden entirely until the Home Range cell count has loaded. */}
          {rangeCellCount !== null && (
            <Text style={[textStyle('small'), styles.levelBarRate]}>
              {dog} knows {streetsKnown(rangeCellCount)} street
              {streetsKnown(rangeCellCount) === 1 ? '' : 's'} by heart.
            </Text>
          )}
          {/* Permanent territory-income line (openspec/changes/territories/
              design.md Decision 6) — "once true, always shown," same
              convention as the streets-known line above. */}
          {state.territoryIncomeRevealed && territoryIncomeRate !== null && (
            <Text style={[textStyle('small'), styles.levelBarRate]}>
              🌍 {dog}'s territories bring home ≈{Math.round(territoryIncomeRate)} treats an hour.
            </Text>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

/** "The Den" title + back button over the sky; keeps the status-bar inset. */
function HeaderOverlay({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.headerOverlay, { paddingTop: insets.top + spacing.md }]} pointerEvents="box-none">
      <Header title="The Den" icon="icon-den" onBack={onClose} style={styles.headerRow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
  headerRow: { marginBottom: 0 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  treatsRow: { alignItems: 'center', gap: spacing.xs },
  treatsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.warmTint,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    ...shadows.soft,
  },
  accrualPop: { position: 'absolute', right: 0, top: -spacing.md },
  message: { color: tokens.warm, textAlign: 'center' },
  cardSelected: { borderWidth: 3, borderColor: tokens.green },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardBody: { flex: 1, gap: 2 },
  cardEffect: { marginTop: spacing.xs },
  cardButton: { marginTop: spacing.md },
  levelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm },
  levelBarTrack: { height: 10, borderRadius: 5, backgroundColor: palette.border, overflow: 'hidden' },
  levelBarFill: { height: '100%', backgroundColor: tokens.green },
  levelBarRate: { marginTop: spacing.sm, color: palette.muted },
});

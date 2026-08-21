import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

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
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { PersonalStatsRepository } from '../storage/PersonalStatsRepository';
import { streetsKnown } from '../utils/grid';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  warm: '#F39C12',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

const BUILDING_DISPLAY: Record<BuildingKey, { name: string; sub: string; color: string; lightColor: string }> = {
  doghouse: { name: 'Doghouse', sub: 'Treat storage', color: '#8B6F47', lightColor: '#D4A76A' },
  bakery: { name: 'Treat Bakery', sub: 'Passive treats', color: '#C87941', lightColor: '#F5CBA7' },
  sniffGarden: { name: 'Sniff Garden', sub: 'Helps Buddy find more on a walk', color: '#3A9E5F', lightColor: '#A8D5A2' },
};

const BUILDING_ORDER: BuildingKey[] = ['doghouse', 'bakery', 'sniffGarden'];

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
  pendingAchievements?: AchievementId[];
  onAcknowledgePendingAchievements?: () => void;
  onClose: () => void;
  onTreatsChanged: (treats: number) => void;
}

export function DenScreen({
  repository,
  personalStatsRepository,
  homeRangeRepository,
  pendingAchievements = [],
  onAcknowledgePendingAchievements,
  onClose,
  onTreatsChanged,
}: DenScreenProps) {
  const [state, setState] = useState<DenEconomyState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showOverflowNotice, setShowOverflowNotice] = useState(false);
  const [achievementNotices, setAchievementNotices] = useState<AchievementId[]>([]);
  const [rangeCellCount, setRangeCellCount] = useState<number | null>(null);

  useEffect(() => {
    repository.getState().then((s) => {
      setState(s);
      if (s.treats >= storageCap(s.doghouseLevel, s.level, s.bakeryLevel, s.sniffGardenLevel)) {
        setShowOverflowNotice(true);
      }
    });
  }, [repository]);

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
      <View style={styles.container}>
        <Text style={styles.empty}>Loading…</Text>
      </View>
    );
  }

  const tease = getUpgradeTease(state);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>The Den</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {showOverflowNotice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Your Treat Bakery filled up while you were away! 🦴</Text>
        </View>
      )}

      {achievementNotices.map((id, i) => (
        <View key={`${id}-${i}`} style={styles.notice}>
          <Text style={styles.noticeText}>🏅 New badge: {ACHIEVEMENTS[id].copyTitle}</Text>
        </View>
      ))}

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.treatsRow}>
          <Text style={styles.treatsLabel}>Treats</Text>
          <Text style={styles.treatsValue}>
            {Math.floor(state.treats)} / {storageCap(state.doghouseLevel, state.level, state.bakeryLevel, state.sniffGardenLevel)}
          </Text>
        </View>

        <View style={styles.levelBar}>
          <View style={styles.levelBarHeader}>
            <Text style={styles.levelBarLabel}>
              {dogDisplayName(state.dogName)} — Level {state.level}
            </Text>
            {state.level < BALANCE.leveling.maxLevel && (
              <Text style={styles.levelBarSub}>
                {Math.floor(state.xp - cumulativeXpForLevel(state.level))} /{' '}
                {cumulativeXpForLevel(state.level + 1) - cumulativeXpForLevel(state.level)} XP
              </Text>
            )}
          </View>
          <View style={styles.levelBarTrack}>
            <View
              style={[
                styles.levelBarFill,
                {
                  width:
                    state.level >= BALANCE.leveling.maxLevel
                      ? '100%'
                      : `${Math.min(
                          100,
                          ((state.xp - cumulativeXpForLevel(state.level)) /
                            (cumulativeXpForLevel(state.level + 1) - cumulativeXpForLevel(state.level))) *
                            100
                        )}%`,
                },
              ]}
            />
          </View>
          {/* Accepted verbatim copy shape (openspec/changes/virtual-dog-companion), numbers filled in — tasks.md task 4.1. */}
          <Text style={styles.levelBarRate}>
            {dogDisplayName(state.dogName)} brings home {buddyTreatsPerWalk(state.level, state.sniffGardenLevel)} treats a
            walk.
            {state.level < BALANCE.leveling.maxLevel
              ? ` Next level: ${buddyTreatsPerWalk(state.level + 1, state.sniffGardenLevel)}.`
              : ''}
          </Text>
          {/* "Buddy knows N streets" (openspec/changes/home-range/design.md Decision 5's headline
              stat) — TODO: game-master copy pass, noun/placement not yet authored (see
              proposal.md's Open Questions / tasks.md task 3.3). Placeholder is functional only;
              hidden entirely until the Home Range cell count has loaded. */}
          {rangeCellCount !== null && (
            <Text style={styles.levelBarRate}>
              {dogDisplayName(state.dogName)} knows {streetsKnown(rangeCellCount)} street
              {streetsKnown(rangeCellCount) === 1 ? '' : 's'}.
            </Text>
          )}
        </View>

        <View style={styles.denScene}>
          <Svg width={80} height={60} viewBox="0 0 80 60">
            <Circle cx={40} cy={40} r={18} fill="#D4A76A" opacity={0.5} />
            <Circle cx={40} cy={40} r={10} fill="#8B6F47" opacity={0.8} />
          </Svg>
          <Text style={styles.denSceneCaption}>Your dog is resting in the yard 🐾</Text>
        </View>

        {message && <Text style={styles.message}>{message}</Text>}

        {BUILDING_ORDER.map((building) => {
          const display = BUILDING_DISPLAY[building];
          const level = getBuildingLevel(state, building);
          const maxed = level >= BALANCE.maxBuildingLevel;
          const cost = maxed ? null : upgradeCost(building, level + 1);
          const isTease = tease?.building === building;

          return (
            <TouchableOpacity
              key={building}
              style={[styles.card, { borderColor: display.color }, isTease && styles.cardTease]}
              onPress={() => handleUpgrade(building)}
              disabled={maxed}
            >
              <View style={[styles.cardIcon, { backgroundColor: display.lightColor }]} />
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{display.name}</Text>
                <Text style={styles.cardSub}>{display.sub}</Text>
                <Text style={styles.cardEffect}>
                  Level {level} — {effectText(building, level, state)}
                </Text>
                {!maxed ? (
                  <>
                    <Text style={styles.cardNextEffect}>Next: {effectText(building, level + 1, state)}</Text>
                    <Text style={[styles.cardCost, { color: display.color }]}>
                      {isTease ? 'Next upgrade: ' : 'Upgrade: '}
                      {cost} treats
                    </Text>
                  </>
                ) : (
                  <Text style={styles.cardMaxed}>Max level!</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
  notice: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  noticeText: {
    fontSize: 13,
    color: COLORS.text,
  },
  scroll: {
    padding: 16,
    gap: 12,
  },
  treatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  treatsLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
  },
  treatsValue: {
    fontSize: 16,
    color: COLORS.warm,
    fontWeight: '700',
  },
  levelBar: {
    marginBottom: 16,
  },
  levelBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  levelBarLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  levelBarSub: {
    fontSize: 12,
    color: COLORS.muted,
  },
  levelBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#eee',
    overflow: 'hidden',
  },
  levelBarFill: {
    height: '100%',
    backgroundColor: COLORS.green,
  },
  levelBarRate: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.muted,
  },
  denScene: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  denSceneCaption: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.muted,
  },
  message: {
    fontSize: 13,
    color: COLORS.warm,
    marginBottom: 8,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
    backgroundColor: COLORS.white,
  },
  cardTease: {
    backgroundColor: '#FFF8E7',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.muted,
  },
  cardEffect: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 2,
  },
  cardNextEffect: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 1,
  },
  cardCost: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  cardMaxed: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.green,
    marginTop: 2,
  },
});

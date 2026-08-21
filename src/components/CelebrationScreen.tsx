import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';

import { BuildingKey } from '../economy/balanceConfig';
import { dogDisplayName, UpgradeTease } from '../economy/denEconomy';
import { ACHIEVEMENTS, AchievementId } from '../economy/personalStats';
import { CELL_M } from '../utils/grid';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  warm: '#F39C12',
  brown: '#8B6F47',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

const CONFETTI_COLORS = [COLORS.green, COLORS.blue, COLORS.warm, COLORS.brown];
const CONFETTI_COUNT = 8;

const BUILDING_NAMES: Record<BuildingKey, string> = {
  doghouse: 'Doghouse',
  bakery: 'Treat Bakery',
  sniffGarden: 'Sniff Garden',
};

interface CelebrationScreenProps {
  /** This walk's real Home Range footprint (cellsPainted, see utils/grid.ts's paintedCells) — 0 for a manual log. */
  cellsPainted: number;
  /** False for a manually-logged walk (no real GPS trail, so no ground was actually painted) — swaps the title/area line for copy that doesn't claim ground that wasn't actually mapped. */
  hasTerritory: boolean;
  treatsEarned: number;
  tease: UpgradeTease | null;
  unlockedAchievements?: AchievementId[];
  leveledUpTo?: number | null;
  /** Buddy's treats-per-walk rate before/after this level-up — both required to render the level-up beat; null whenever leveledUpTo is null. See economy/walkRewards.ts. */
  oldTreatsPerWalk?: number | null;
  newTreatsPerWalk?: number | null;
  /** The one-away cliffhanger's milestone title, when it fires on this walk-close. See economy/milestones.ts — currently always null until milestone titles are game-master-authored. */
  cliffhangerTitle?: string | null;
  dogName?: string | null;
  onContinue: () => void;
}

function ConfettiPiece({ left, color, delay }: { left: number; color: string; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 1200,
      delay,
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 260] });
  const opacity = anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        { left, backgroundColor: color, opacity, transform: [{ translateY }, { rotate }] },
      ]}
    />
  );
}

export function CelebrationScreen({
  cellsPainted,
  hasTerritory,
  treatsEarned,
  tease,
  unlockedAchievements = [],
  leveledUpTo = null,
  oldTreatsPerWalk = null,
  newTreatsPerWalk = null,
  cliffhangerTitle = null,
  dogName = null,
  onContinue,
}: CelebrationScreenProps) {
  const confetti = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        left: 20 + Math.random() * 260,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 300,
      })),
    []
  );

  return (
    <View style={styles.container}>
      <View style={styles.confettiLayer} pointerEvents="none">
        {confetti.map((piece, i) => (
          <ConfettiPiece key={i} left={piece.left} color={piece.color} delay={piece.delay} />
        ))}
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{hasTerritory ? 'Territory claimed! 🌱' : 'Walk claimed! 🌱'}</Text>
        <Text style={styles.area}>
          {hasTerritory ? `${(cellsPainted * CELL_M * CELL_M).toFixed(0)} m² is now yours` : 'Every step of it is yours'}
        </Text>

        <View style={styles.treatsRow}>
          <Text style={styles.treatsEarned}>+{treatsEarned} treats</Text>
        </View>

        {tease && (
          <View style={styles.teaseBox}>
            <Text style={styles.teaseLabel}>Next up in the Den</Text>
            <Text style={styles.teaseText}>
              {BUILDING_NAMES[tease.building]} — {tease.cost} treats
              {tease.affordable ? ' (you can afford it now!)' : ''}
            </Text>
          </View>
        )}

        {unlockedAchievements.length > 0 && (
          <View style={styles.badgeBox}>
            <Text style={styles.badgeLabel}>New badge{unlockedAchievements.length > 1 ? 's' : ''}!</Text>
            {unlockedAchievements.map((id) => (
              <Text key={id} style={styles.badgeText}>
                🏅 {ACHIEVEMENTS[id].copyTitle}
              </Text>
            ))}
          </View>
        )}

        {leveledUpTo !== null && oldTreatsPerWalk !== null && newTreatsPerWalk !== null && (
          <View style={styles.levelBox}>
            {/* Accepted verbatim copy shape (openspec/changes/virtual-dog-companion), numbers filled in. */}
            <Text style={styles.levelText}>
              {dogDisplayName(dogName)} reached Level {leveledUpTo} — he brings home {newTreatsPerWalk} treats a walk
              now, up from {oldTreatsPerWalk}
            </Text>
          </View>
        )}

        {cliffhangerTitle !== null && (
          <View style={styles.levelBox}>
            {/* Accepted verbatim copy shape (openspec/changes/virtual-dog-companion), title filled in. */}
            <Text style={styles.levelText}>One more walk and he's a {cliffhangerTitle}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueButtonText}>Nice walk! 🐾</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  confettiPiece: {
    position: 'absolute',
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  area: {
    fontSize: 16,
    color: COLORS.muted,
    marginTop: 8,
  },
  treatsRow: {
    marginTop: 24,
  },
  treatsEarned: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.warm,
  },
  teaseBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
  },
  teaseLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  teaseText: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 4,
    textAlign: 'center',
  },
  badgeBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EAF7EE',
    alignItems: 'center',
    gap: 2,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  levelBox: {
    marginTop: 12,
  },
  levelText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
  },
  continueButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: COLORS.green,
  },
  continueButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
});

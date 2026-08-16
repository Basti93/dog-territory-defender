import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { DenEconomyState } from '../economy/denEconomy';
import { ACHIEVEMENTS, AchievementId, getAchievementProgress, PersonalStatsState } from '../economy/personalStats';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { PersonalStatsRepository, UnlockedAchievement } from '../storage/PersonalStatsRepository';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  warm: '#F39C12',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

interface StatsScreenProps {
  repository: PersonalStatsRepository;
  denEconomyRepository: DenEconomyRepository;
  onClose: () => void;
}

interface StatCard {
  label: string;
  value: string;
}

function buildStatCards(stats: PersonalStatsState, denState: DenEconomyState): StatCard[] {
  return [
    { label: 'Level', value: `${denState.level}` },
    { label: 'Total walks', value: `${stats.totalWalksClosed}` },
    { label: 'Lifetime distance', value: `${(stats.lifetimeDistanceMeters / 1000).toFixed(1)} km` },
    { label: 'Biggest territory', value: `${stats.biggestTerritoryAreaM2.toFixed(0)} m²` },
    { label: 'Longest walk', value: `${(stats.longestWalkDistanceM / 1000).toFixed(2)} km` },
    { label: 'Lifetime treats earned', value: `${Math.floor(stats.totalTreatsEarnedLifetime)}` },
    {
      label: 'Den levels',
      value: `Doghouse ${denState.doghouseLevel} · Bakery ${denState.bakeryLevel} · Sniff Garden ${denState.sniffGardenLevel}`,
    },
  ];
}

export function StatsScreen({ repository, denEconomyRepository, onClose }: StatsScreenProps) {
  const [stats, setStats] = useState<PersonalStatsState | null>(null);
  const [denState, setDenState] = useState<DenEconomyState | null>(null);
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[] | null>(null);

  useEffect(() => {
    repository.getState().then(setStats);
    repository.getUnlockedAchievements().then(setUnlocked);
    denEconomyRepository.getState().then(setDenState);
  }, [repository, denEconomyRepository]);

  if (!stats || !denState || !unlocked) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Loading…</Text>
      </View>
    );
  }

  const unlockedIds = new Set(unlocked.map((a) => a.id));
  const unlockedAtById = new Map(unlocked.map((a) => [a.id, a.unlockedAt]));
  const statCards = buildStatCards(stats, denState);
  const allAchievements = Object.values(ACHIEVEMENTS);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stats & Badges</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>Lifetime stats</Text>
        <View style={styles.statGrid}>
          {statCards.map((card) => (
            <View key={card.label} style={styles.statCard}>
              <Text style={styles.statLabel}>{card.label}</Text>
              <Text style={styles.statValue}>{card.value}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Badges</Text>
        {allAchievements.map((achievement) => {
          const isUnlocked = unlockedIds.has(achievement.id);
          if (isUnlocked) {
            const unlockedAt = unlockedAtById.get(achievement.id)!;
            return (
              <View key={achievement.id} style={[styles.badgeCard, styles.badgeCardUnlocked]}>
                <Text style={styles.badgeTitle}>🏅 {achievement.copyTitle}</Text>
                <Text style={styles.badgeBody}>{achievement.copyBody}</Text>
                <Text style={styles.badgeDate}>Earned {new Date(unlockedAt).toLocaleDateString()}</Text>
              </View>
            );
          }

          const progress = getAchievementProgress(achievement.id as AchievementId, stats, denState);
          return (
            <View key={achievement.id} style={[styles.badgeCard, styles.badgeCardLocked]}>
              <Text style={[styles.badgeTitle, styles.badgeTitleLocked]}>🔒 {achievement.name}</Text>
              <Text style={styles.badgeHint}>{progress.hint}</Text>
            </View>
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
  scroll: {
    padding: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '47%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#eee',
    backgroundColor: COLORS.white,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '700',
    marginTop: 4,
  },
  badgeCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  badgeCardUnlocked: {
    borderColor: COLORS.green,
    backgroundColor: '#EAF7EE',
  },
  badgeCardLocked: {
    borderColor: '#eee',
    backgroundColor: COLORS.white,
    opacity: 0.6,
  },
  badgeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  badgeTitleLocked: {
    color: COLORS.muted,
  },
  badgeBody: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 4,
  },
  badgeDate: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 6,
  },
  badgeHint: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
});

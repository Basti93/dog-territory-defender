import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DenEconomyState, dogDisplayName } from '../economy/denEconomy';
import { ACHIEVEMENTS, AchievementId, getAchievementProgress, PersonalStatsState } from '../economy/personalStats';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { PersonalStatsRepository, UnlockedAchievement } from '../storage/PersonalStatsRepository';
import { BuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyLoading } from './BuddyLoading';
import { ArtImage, Card, Header, palette, radii, Screen, spacing, StatTile, textStyle } from '../ui';
import { formatDate, formatDistanceKm, formatNumber, t } from '../i18n';

interface StatsScreenProps {
  buddyAppearance: BuddyAppearance;
  repository: PersonalStatsRepository;
  denEconomyRepository: DenEconomyRepository;
  onClose: () => void;
}

export function StatsScreen({ buddyAppearance, repository, denEconomyRepository, onClose }: StatsScreenProps) {
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
      <Screen>
        <BuddyLoading appearance={buddyAppearance} text={t('common.loading')} />
      </Screen>
    );
  }

  const unlockedIds = new Set(unlocked.map((a) => a.id));
  const unlockedAtById = new Map(unlocked.map((a) => [a.id, a.unlockedAt]));
  const allAchievements = Object.values(ACHIEVEMENTS);
  const km1 = (meters: number) => formatDistanceKm(meters / 1000, 1);
  const km2 = (meters: number) => formatDistanceKm(meters / 1000, 2);

  return (
    <Screen scroll backdrop="sky">
      <Header title={t('doorstep.statsBadges')} icon="icon-badge" onBack={onClose} />

      <Text style={[textStyle('small'), styles.sectionLabel]}>{t('stats.lifetime')}</Text>
      <Card tint="warm" title={t('stats.level')} style={styles.fullCard}>
        <Text style={textStyle('body')}>{t('den.dogLevel', { dog: dogDisplayName(denState.dogName), level: denState.level })}</Text>
      </Card>
      <View style={styles.statGrid}>
        <StatTile style={styles.statTile} icon="icon-walks" label={t('stats.totalWalks')} value={stats.totalWalksClosed} />
        <StatTile style={styles.statTile} icon="icon-paw" label={t('stats.lifetimeDistance')} value={stats.lifetimeDistanceMeters} format={km1} />
        <StatTile
          style={styles.statTile}
          icon="icon-pin"
          label={t('stats.biggestTerritory')}
          value={stats.biggestTerritoryAreaM2}
          format={(v) => `${formatNumber(Math.round(v))} m²`}
        />
        <StatTile style={styles.statTile} icon="icon-walks" label={t('stats.longestWalk')} value={stats.longestWalkDistanceM} format={km2} />
        <StatTile
          style={styles.statTile}
          icon="icon-treat"
          label={t('stats.lifetimeTreats')}
          value={Math.floor(stats.totalTreatsEarnedLifetime)}
        />
      </View>
      <Card tint="sky" title={t('stats.denLevels')} style={styles.fullCard}>
        <Text style={textStyle('body')}>
          {t('stats.denLevelsLine', { doghouse: denState.doghouseLevel, bakery: denState.bakeryLevel, garden: denState.sniffGardenLevel })}
        </Text>
      </Card>

      <Text style={[textStyle('small'), styles.sectionLabel, { marginTop: spacing.xl }]}>{t('stats.badges')}</Text>
      {allAchievements.map((achievement) => {
        const isUnlocked = unlockedIds.has(achievement.id);
        if (isUnlocked) {
          const unlockedAt = unlockedAtById.get(achievement.id)!;
          return (
            <Card key={achievement.id} tint="meadow" style={styles.badgeCard}>
              <ArtImage art="icon-badge" size={44} style={styles.badgeIcon} />
              <View style={styles.badgeText}>
                <Text style={textStyle('h2')}>{achievement.copyTitle}</Text>
                <Text style={textStyle('body')}>{achievement.copyBody}</Text>
                <Text style={[textStyle('small'), styles.muted]}>{t('stats.earnedOn', { date: formatDate(unlockedAt) })}</Text>
              </View>
            </Card>
          );
        }

        const progress = getAchievementProgress(achievement.id as AchievementId, stats, denState);
        return (
          <Card key={achievement.id} style={[styles.badgeCard, styles.badgeCardLocked]}>
            <View style={styles.badgePlaceholder} />
            <View style={styles.badgeText}>
              <Text style={[textStyle('h2'), styles.muted]}>{achievement.name}</Text>
              <Text style={[textStyle('small'), styles.muted]}>{progress.hint}</Text>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { color: palette.muted, textTransform: 'uppercase', marginBottom: spacing.sm },
  fullCard: { marginBottom: spacing.md },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  statTile: { flexBasis: '46%', flexGrow: 1 },
  badgeCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  badgeCardLocked: { opacity: 0.7 },
  badgeIcon: { marginRight: spacing.md },
  badgePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: palette.border,
    marginRight: spacing.md,
  },
  badgeText: { flex: 1, gap: spacing.xs },
  muted: { color: palette.muted },
});

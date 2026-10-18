import React, { useEffect, useMemo, useState } from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';

import { artOr } from '../art/artAssets';
import { DenEconomyState, dogDisplayName } from '../economy/denEconomy';
import { ACHIEVEMENTS, PersonalStatsState } from '../economy/personalStats';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { PersonalStatsRepository, UnlockedAchievement } from '../storage/PersonalStatsRepository';
import { BuddyAppearance } from '../buddy/buddyAppearance';
import { streetsKnown } from '../utils/grid';
import { BuddyLoading } from './BuddyLoading';
import { FenceFamily, fenceFamily, pickEmptyHook, rosetteArt } from './world/fencePlan';
import { material, PaperHeader, PaperHint, PaperRow, PaperSection, PaperSheet, Screen, spacing, textStyle, WoodSign } from '../ui';
import { formatDate, formatDistanceKm, formatNumber, t, useLocale } from '../i18n';

interface StatsScreenProps {
  buddyAppearance: BuddyAppearance;
  repository: PersonalStatsRepository;
  denEconomyRepository: DenEconomyRepository;
  /** Gives the "streets" sign. Omitted = that sign is left out. */
  homeRangeRepository?: HomeRangeRepository;
  onClose: () => void;
}

// The three territory badges stay off the fence (fencePlan has no family for them) but are listed here as earned.
const TERRITORY_BADGE_FAMILY: FenceFamily = 'distance';
const ROSETTE_SIZE = 48;
const HOOK_SILHOUETTE_OPACITY = 0.4;

export function StatsScreen({ buddyAppearance, repository, denEconomyRepository, homeRangeRepository, onClose }: StatsScreenProps) {
  useLocale(); // re-render on a language switch
  const [stats, setStats] = useState<PersonalStatsState | null>(null);
  const [denState, setDenState] = useState<DenEconomyState | null>(null);
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[] | null>(null);
  const [streets, setStreets] = useState(0);

  useEffect(() => {
    repository.getState().then(setStats);
    repository.getUnlockedAchievements().then(setUnlocked);
    denEconomyRepository.getState().then(setDenState);
    // The streets sign is a bonus: if the read fails, it is simply left out.
    homeRangeRepository?.getCells().then((cells) => setStreets(streetsKnown(cells.length))).catch(() => {});
  }, [repository, denEconomyRepository, homeRangeRepository]);

  // The same "nearest threshold badge from 80 %" rule as the fence; at most one.
  const hook = useMemo(() => (stats && unlocked ? pickEmptyHook(stats, unlocked) : null), [stats, unlocked]);

  if (!stats || !denState || !unlocked) {
    return (
      <Screen backdrop="linen">
        <BuddyLoading appearance={buddyAppearance} text={t('common.loading')} />
      </Screen>
    );
  }

  const km1 = (meters: number) => formatDistanceKm(meters / 1000, 1);
  const km2 = (meters: number) => formatDistanceKm(meters / 1000, 2);
  // Oldest first, like the fence; each id once.
  const earned = [...new Map(unlocked.map((a) => [a.id, a])).values()].sort((a, b) => a.unlockedAt - b.unlockedAt);

  const lifetimeSigns: { key: string; value: string; label: string }[] = [
    { key: 'walks', value: formatNumber(stats.totalWalksClosed), label: t('stats.totalWalks') },
    { key: 'distance', value: km1(stats.lifetimeDistanceMeters), label: t('stats.lifetimeDistance') },
    ...(streets > 0 ? [{ key: 'streets', value: formatNumber(streets), label: t('stats.streets') }] : []),
    { key: 'treats', value: formatNumber(Math.floor(stats.totalTreatsEarnedLifetime)), label: t('stats.lifetimeTreats') },
  ];
  const recordSigns = [
    { key: 'longest', value: km2(stats.longestWalkDistanceM), label: t('stats.longestWalk') },
    { key: 'territory', value: `${formatNumber(Math.round(stats.biggestTerritoryAreaM2))} m²`, label: t('stats.biggestTerritory') },
  ];

  return (
    <Screen scroll backdrop="linen">
      <PaperHeader title={t('post.statsBadges')} onBack={onClose} />

      <PaperSheet>
        <PaperSection title={t('stats.lifetime')} first>
          <SignGrid signs={lifetimeSigns} />
        </PaperSection>

        <PaperSection title={t('stats.records')}>
          <SignGrid signs={recordSigns} />
        </PaperSection>

        <PaperSection title={t('stats.denLevels')}>
          <PaperRow title={t('den.dogLevel', { dog: dogDisplayName(denState.dogName), level: denState.level })} />
          <PaperHint>
            {t('stats.denLevelsLine', { doghouse: denState.doghouseLevel, bakery: denState.bakeryLevel, garden: denState.sniffGardenLevel })}
          </PaperHint>
        </PaperSection>

        <PaperSection title={t('stats.badges')}>
          {earned.length === 0 && !hook && <PaperHint>{t('stats.badgesEmpty')}</PaperHint>}
          {earned.map((a) => (
            <BadgeRow
              key={a.id}
              family={fenceFamily(a.id) ?? TERRITORY_BADGE_FAMILY}
              testID={`stats-badge-${a.id}`}
              name={ACHIEVEMENTS[a.id].name}
              date={t('stats.earnedOn', { date: formatDate(a.unlockedAt) })}
            />
          ))}
          {hook && <BadgeRow family={hook.family} silhouette testID="stats-hook" name={t('world.fence.hookSign')} />}
        </PaperSection>
      </PaperSheet>
    </Screen>
  );
}

/** Small wood signs in two columns; the numbers are in the sign type, the label under them. */
function SignGrid({ signs }: { signs: { key: string; value: string; label: string }[] }) {
  return (
    <View style={styles.grid}>
      {signs.map((s, i) => (
        <View key={s.key} style={styles.gridCell}>
          <WoodSign size="small" fullWidth rotate={i % 2 === 0 ? -1.5 : 1.5} accessibilityLabel={`${s.label}: ${s.value}`} testID={`stats-sign-${s.key}`}>
            <Text style={[textStyle('signBig'), styles.signValue]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {s.value}
            </Text>
            <Text style={[textStyle('small'), styles.signLabel]} numberOfLines={2}>
              {s.label}
            </Text>
          </WoodSign>
        </View>
      ))}
    </View>
  );
}

/** One clay rosette with its name (and date) in handwriting. `silhouette` = the faint "soon" hook. */
function BadgeRow({ family, name, date, silhouette, testID }: { family: FenceFamily; name: string; date?: string; silhouette?: boolean; testID: string }) {
  const source = artOr(rosetteArt(family), null) as ImageSourcePropType | null;
  return (
    <View style={styles.badgeRow} testID={testID} accessible accessibilityLabel={date ? `${name}, ${date}` : name}>
      <View style={[styles.rosette, silhouette && { opacity: HOOK_SILHOUETTE_OPACITY }]}>
        {source ? (
          <Image
            source={source}
            resizeMode="contain"
            style={[styles.rosetteImage, silhouette && { tintColor: material.woodDark }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : (
          <View style={styles.rosetteFallback} />
        )}
      </View>
      <View style={styles.badgeText}>
        <Text style={[textStyle('hand'), silhouette ? styles.hookName : styles.badgeName]}>{name}</Text>
        {date ? <Text style={[textStyle('hand'), styles.badgeDate]}>{date}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  gridCell: { flexBasis: '46%', flexGrow: 1 },
  signValue: { color: material.ink, textAlign: 'center' },
  signLabel: { color: material.ink, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  rosette: { width: ROSETTE_SIZE, height: ROSETTE_SIZE },
  rosetteImage: { width: ROSETTE_SIZE, height: ROSETTE_SIZE },
  rosetteFallback: { width: ROSETTE_SIZE, height: ROSETTE_SIZE, borderRadius: ROSETTE_SIZE / 2, backgroundColor: material.woodLight, borderWidth: 2, borderColor: material.woodRim },
  badgeText: { flex: 1 },
  badgeName: { color: material.ink },
  badgeDate: { color: material.inkGreen, fontSize: 18, lineHeight: 22 },
  hookName: { color: material.muted },
});

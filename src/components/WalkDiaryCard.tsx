import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { t, tPlural } from '../i18n';
import { material, radii, spacing, textStyle, tokens } from '../ui';
import { BUCKET_ORDER, type DiaryBucket, type WalkDiary } from '../walks/walkDiary';
import { BUCKET_LABEL_KEY, bucketComparisonLine, friendlyDistance, friendlyDuration, sniffComment, softMonth, typicalLine } from '../walks/walkDiaryCopy';

interface WalkDiaryCardProps {
  diary: WalkDiary;
  showIntro: boolean;
  newLongest: boolean;
  /** The screen's own header already says the title. */
  showTitle?: boolean;
}

/** Small time-of-day icons from plain shapes (sun, high sun, moon, moon with a star); the clay look comes from the soft rims. */
function BucketIcon({ bucket }: { bucket: DiaryBucket }) {
  switch (bucket) {
    case 'morning':
      return (
        <View style={styles.icon}>
          <View style={[styles.disc, { backgroundColor: tokens.warm, width: 14, height: 14, marginTop: 8 }]} />
          <View style={styles.horizon} />
        </View>
      );
    case 'midday':
      return (
        <View style={styles.icon}>
          <View style={[styles.disc, { backgroundColor: tokens.warm, width: 18, height: 18 }]} />
        </View>
      );
    case 'evening':
      return (
        <View style={styles.icon}>
          <View style={[styles.disc, { backgroundColor: material.skyEvening, width: 16, height: 16, borderColor: tokens.warm, borderWidth: 2 }]} />
        </View>
      );
    case 'night':
      return (
        <View style={styles.icon}>
          <View style={[styles.disc, { backgroundColor: tokens.blue, width: 16, height: 16 }]} />
          <View style={[styles.disc, styles.moonBite]} />
        </View>
      );
  }
}

function Row({ label, value, note, testID }: { label: string; value: string; note?: string; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[textStyle('small'), styles.label]}>{label}</Text>
      <Text style={[textStyle('h2'), styles.value]}>{value}</Text>
      {note ? <Text style={[textStyle('min'), styles.note]}>{note}</Text> : null}
    </View>
  );
}

/**
 * Buddy's Spazier-Tagebuch: one clay card in the Album, in Buddy's voice. Rounded averages, a record, a memory, the
 * total distance (it only grows) and one row per time of day that has enough walks. No charts, no goals, no comparison
 * with anyone else. Before three walks only a friendly teaser shows.
 */
export function WalkDiaryCard({ diary, showIntro, newLongest, showTitle = true }: WalkDiaryCardProps) {
  if (!diary.ready) {
    return (
      <View style={styles.card} testID="walk-diary-teaser">
        {showTitle ? (
          <Text style={[textStyle('h2'), styles.title]} accessibilityRole="header">
            {t('diary.title')}
          </Text>
        ) : null}
        <Text style={[textStyle('hand'), styles.hand]}>{tPlural('diary.teaser', diary.walksToGo)}</Text>
      </View>
    );
  }
  const { typical, longest, last } = diary;
  const comparison = bucketComparisonLine(diary);
  const sniff = sniffComment(diary);
  return (
    <View style={styles.card} testID="walk-diary">
      {showTitle ? (
        <Text style={[textStyle('h2'), styles.title]} accessibilityRole="header">
          {t('diary.title')}
        </Text>
      ) : null}
      {showIntro ? <Text style={[textStyle('hand'), styles.hand]}>{t('diary.intro')}</Text> : null}
      {newLongest ? (
        <Text style={[textStyle('hand'), styles.hand]} testID="walk-diary-record">
          {t('diary.newLongest')}
        </Text>
      ) : null}
      {typical ? <Row label={t('diary.typical.label')} value={typicalLine(typical.durationMs, typical.distanceMeters)} testID="diary-typical" /> : null}
      {longest ? <Row label={t('diary.longest.label')} value={friendlyDuration(longest.durationMs)} note={softMonth(longest.startTime)} testID="diary-longest" /> : null}
      {last ? <Row label={t('diary.last.label')} value={friendlyDuration(last.durationMs)} testID="diary-last" /> : null}
      <Row label={t('diary.total.label')} value={friendlyDistance(diary.totalMeters)} note={t('diary.total.note')} testID="diary-total" />
      {diary.buckets.length > 0 ? (
        <View style={styles.buckets}>
          {BUCKET_ORDER.map((bucket) => {
            const b = diary.buckets.find((x) => x.bucket === bucket);
            if (!b) return null;
            return (
              <View key={bucket} style={styles.bucketRow} testID={`diary-bucket-${bucket}`}>
                <BucketIcon bucket={bucket} />
                <Text style={[textStyle('body'), styles.bucketLabel]}>{t(BUCKET_LABEL_KEY[bucket])}</Text>
                <Text style={[textStyle('body'), styles.value, styles.bucketValue]}>{typicalLine(b.avgDurationMs, b.avgDistanceMeters)}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {comparison ? <Text style={[textStyle('small'), styles.comment]}>{comparison}</Text> : null}
      {sniff ? <Text style={[textStyle('hand'), styles.hand]}>{sniff}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: material.yarn,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: material.chalk,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: { color: material.ink, marginBottom: spacing.xs },
  hand: { color: material.ink, marginTop: spacing.sm },
  row: { marginTop: spacing.sm },
  label: { color: material.muted },
  value: { color: material.inkGreen },
  note: { color: material.muted },
  buckets: { marginTop: spacing.md, gap: spacing.sm },
  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bucketValue: { flex: 1 },
  bucketLabel: { color: material.ink, minWidth: 76 },
  comment: { color: material.ink, marginTop: spacing.md },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  disc: { borderRadius: radii.pill },
  horizon: { position: 'absolute', bottom: 4, left: 2, right: 2, height: 3, borderRadius: 2, backgroundColor: material.feltUsual },
  moonBite: { position: 'absolute', width: 12, height: 12, top: 1, right: 2, backgroundColor: material.yarn },
});

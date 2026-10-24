import { formatDate, formatDistanceKm, formatNumber, t } from '../i18n';
import { roundedMeters, roundedMinutes, type DiaryBucket, type WalkDiary } from './walkDiary';

// Buddy's words for the diary: friendly rounding and the sniff comment. All copy is in i18n (`diary.*`).

/** "35 Min" / "1 Std 15 Min" (rounded, see roundedMinutes). */
export function friendlyDuration(ms: number): string {
  const total = roundedMinutes(ms);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return t('diary.dur.min', { m });
  return m === 0 ? t('diary.dur.hour', { h }) : t('diary.dur.hourMin', { h, m });
}

/** "650 m" / "2,1 km" (rounded, see roundedMeters); 100 km and more without decimals. */
export function friendlyDistance(meters: number): string {
  const rounded = roundedMeters(meters);
  if (rounded < 1000) return t('diary.dist.m', { n: formatNumber(rounded) });
  return formatDistanceKm(rounded / 1000, rounded >= 100000 ? 0 : 1);
}

/** "ca. 35 Min · 2,1 km" */
export function typicalLine(durationMs: number, distanceMeters: number): string {
  return t('diary.typicalValue', { duration: friendlyDuration(durationMs), distance: friendlyDistance(distanceMeters) });
}

/** "im Mai" / "in May": a soft month, never "3 days ago". */
export function softMonth(timestamp: number): string {
  return t('diary.longest.when', { month: formatDate(timestamp, { month: 'long' }) });
}

/** The line under the time-of-day rows: positive only, names the top bucket, or "every time of day is good". Null with fewer than two rows. */
export function bucketComparisonLine(diary: WalkDiary): string | null {
  if (diary.topBucket) return t(`diary.top.${diary.topBucket}`);
  return diary.evenBuckets ? t('diary.even') : null;
}

export const BUCKET_LABEL_KEY: Record<DiaryBucket, string> = {
  morning: 'diary.bucket.morning',
  midday: 'diary.bucket.midday',
  evening: 'diary.bucket.evening',
  night: 'diary.bucket.night',
};

const SAUSAGE_M = 0.15;
const PITCH_M = 105;
const NAP_MS = 30 * 60 * 1000;

/**
 * One sniff comment keyed to the data, including a dog-scale equivalent of the totals (sausage chains, football pitches,
 * naps). Which one shows rotates with the number of walks: the same all day, a new one after the next walk.
 */
export function sniffComment(diary: WalkDiary): string | null {
  if (!diary.ready || !diary.longest) return null;
  const options: string[] = [t('diary.sniff.sausage', { count: formatNumber(Math.round(diary.totalMeters / SAUSAGE_M)) })];
  const pitches = Math.round(diary.totalMeters / PITCH_M);
  if (pitches >= 2) options.push(t('diary.sniff.pitch', { count: formatNumber(pitches) }));
  const naps = Math.round(diary.totalDurationMs / NAP_MS);
  if (naps >= 2) options.push(t('diary.sniff.nap', { count: formatNumber(naps) }));
  options.push(t('diary.sniff.longest', { duration: friendlyDuration(diary.longest.durationMs) }));
  return options[diary.walkCount % options.length];
}

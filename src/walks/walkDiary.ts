import type { StoredWalk } from '../storage/WalkRepository';
import { walkDistanceMeters, walkHasMovement } from '../utils/geometry';

// Buddy's Spazier-Tagebuch (Album): friendly numbers about the household's tracked walks, derived on read, nothing stored
// except the two "seen" markers (DiarySeen). Pure: copy and React live in walkDiaryCopy.ts / WalkDiaryCard.tsx.
// Manual logs are left out on purpose: they carry no fixes (so no duration or distance) and their start time is only
// "earlier today / yesterday", not when the walk happened.

export type DiaryBucket = 'morning' | 'midday' | 'evening' | 'night';
export const BUCKET_ORDER: readonly DiaryBucket[] = ['morning', 'midday', 'evening', 'night'];

/** Walks needed before the diary appears, and before a time-of-day gets its own row. */
export const DIARY_MIN_WALKS = 3;
/** Time-of-day averages within this share of the best one count as "all equally good". */
export const DIARY_EVEN_SHARE = 0.1;
/** A "walk" longer than this is a forgotten stop button, not a walk: it is left out of the numbers. */
export const DIARY_MAX_WALK_MS = 8 * 60 * 60 * 1000;

/** Morgen 0-11 except night, Mittag 11-17, Abend 17-22, Nacht 22-5 (local hour). */
export function bucketForHour(hour: number): DiaryBucket {
  if (hour < 5 || hour >= 22) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 17) return 'midday';
  return 'evening';
}

/** How long a tracked walk took (start to last fix), or null when it has no usable span. */
export function walkDurationMs(walk: Pick<StoredWalk, 'startTime' | 'locations'>): number | null {
  const fixes = walk.locations;
  if (fixes.length < 2) return null;
  const ms = fixes[fixes.length - 1].timestamp - Math.min(walk.startTime, fixes[0].timestamp);
  return ms > 0 && ms <= DIARY_MAX_WALK_MS ? ms : null;
}

interface DiaryWalk {
  startTime: number;
  durationMs: number;
  distanceMeters: number;
  bucket: DiaryBucket;
}

/** Our dog's finished, tracked walks that went somewhere (partner walks included; they are stored like ours). */
function diaryWalks(walks: readonly StoredWalk[]): DiaryWalk[] {
  const out: DiaryWalk[] = [];
  for (const walk of walks) {
    if (walk.startSource === 'manual-log' || !walkHasMovement(walk)) continue;
    const durationMs = walkDurationMs(walk);
    if (durationMs === null) continue;
    out.push({ startTime: walk.startTime, durationMs, distanceMeters: walkDistanceMeters(walk), bucket: bucketForHour(new Date(walk.startTime).getHours()) });
  }
  return out;
}

export interface BucketAverage {
  bucket: DiaryBucket;
  count: number;
  avgDurationMs: number;
  avgDistanceMeters: number;
}

export interface WalkDiary {
  /** Walks the numbers are made of. */
  walkCount: number;
  /** At least DIARY_MIN_WALKS: the diary shows, otherwise only the teaser. */
  ready: boolean;
  /** Teaser: walks still needed (0 once ready). */
  walksToGo: number;
  typical: { durationMs: number; distanceMeters: number } | null;
  longest: { durationMs: number; startTime: number } | null;
  last: { durationMs: number; startTime: number } | null;
  totalMeters: number;
  totalDurationMs: number;
  /** Only buckets with at least DIARY_MIN_WALKS walks, in day order. */
  buckets: BucketAverage[];
  /** The bucket with the longest average walks; null with fewer than two buckets or when all are within DIARY_EVEN_SHARE. */
  topBucket: DiaryBucket | null;
  /** Two or more buckets and none stands out. */
  evenBuckets: boolean;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function buildWalkDiary(walks: readonly StoredWalk[]): WalkDiary {
  const list = diaryWalks(walks);
  const walkCount = list.length;
  const ready = walkCount >= DIARY_MIN_WALKS;
  const totalMeters = list.reduce((s, w) => s + w.distanceMeters, 0);
  const totalDurationMs = list.reduce((s, w) => s + w.durationMs, 0);

  const buckets: BucketAverage[] = [];
  for (const bucket of BUCKET_ORDER) {
    const inBucket = list.filter((w) => w.bucket === bucket);
    if (inBucket.length < DIARY_MIN_WALKS) continue;
    buckets.push({ bucket, count: inBucket.length, avgDurationMs: mean(inBucket.map((w) => w.durationMs)), avgDistanceMeters: mean(inBucket.map((w) => w.distanceMeters)) });
  }

  let topBucket: DiaryBucket | null = null;
  let evenBuckets = false;
  if (buckets.length >= 2) {
    const best = buckets.reduce((a, b) => (b.avgDurationMs > a.avgDurationMs ? b : a));
    const worst = buckets.reduce((a, b) => (b.avgDurationMs < a.avgDurationMs ? b : a));
    if ((best.avgDurationMs - worst.avgDurationMs) / best.avgDurationMs <= DIARY_EVEN_SHARE) evenBuckets = true;
    else topBucket = best.bucket;
  }

  const longestWalk = list.reduce<DiaryWalk | null>((a, w) => (!a || w.durationMs > a.durationMs ? w : a), null);
  const lastWalk = list.reduce<DiaryWalk | null>((a, w) => (!a || w.startTime > a.startTime ? w : a), null);

  return {
    walkCount,
    ready,
    walksToGo: Math.max(0, DIARY_MIN_WALKS - walkCount),
    typical: walkCount > 0 ? { durationMs: mean(list.map((w) => w.durationMs)), distanceMeters: totalMeters / walkCount } : null,
    longest: longestWalk && { durationMs: longestWalk.durationMs, startTime: longestWalk.startTime },
    last: lastWalk && { durationMs: lastWalk.durationMs, startTime: lastWalk.startTime },
    totalMeters,
    totalDurationMs,
    buckets,
    topBucket,
    evenBuckets,
  };
}

// ---- friendly rounding (the diary says "ca. 35 Min", never "34:47") ----

/** Under 10 min to the minute, from there to 5 minutes. At least 1. */
export function roundedMinutes(ms: number): number {
  const minutes = ms / 60000;
  return minutes < 10 ? Math.max(1, Math.round(minutes)) : Math.round(minutes / 5) * 5;
}

/** Under 1 km to 50 m (at least 50), from there to 100 m. */
export function roundedMeters(meters: number): number {
  return meters < 1000 ? Math.max(50, Math.round(meters / 50) * 50) : Math.round(meters / 100) * 100;
}

// ---- what the Album has already told the player ----

/** Persisted in settings: the intro line is said once, and the longest walk seen so far tells a new record from a repeat. */
export interface DiarySeen {
  introShown: boolean;
  longestMs: number;
}

export const DIARY_SEEN_NONE: DiarySeen = { introShown: false, longestMs: 0 };

export function normalizeDiarySeen(value: unknown): DiarySeen {
  if (!value || typeof value !== 'object') return { ...DIARY_SEEN_NONE };
  const v = value as Record<string, unknown>;
  return { introShown: v.introShown === true, longestMs: typeof v.longestMs === 'number' && Number.isFinite(v.longestMs) && v.longestMs > 0 ? v.longestMs : 0 };
}

export interface DiaryAnnouncements {
  /** "Ich hab ein Tagebuch angelegt, schau mal!": the first time the diary shows. */
  showIntro: boolean;
  /** A real new personal longest walk since the last time (never on the diary's first appearance). */
  newLongest: boolean;
  /** What to remember afterwards; null when nothing changes. */
  next: DiarySeen | null;
}

export function diaryAnnouncements(diary: WalkDiary, seen: DiarySeen): DiaryAnnouncements {
  if (!diary.ready || !diary.longest) return { showIntro: false, newLongest: false, next: null };
  const longestMs = diary.longest.durationMs;
  const newLongest = seen.longestMs > 0 && longestMs > seen.longestMs;
  const next: DiarySeen = { introShown: true, longestMs: Math.max(seen.longestMs, longestMs) };
  const changed = next.introShown !== seen.introShown || next.longestMs !== seen.longestMs;
  return { showIntro: !seen.introShown, newLongest, next: changed ? next : null };
}

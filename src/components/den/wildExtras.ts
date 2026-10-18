// Wild Extras: rare, cosmetic yard cameos (weird streak, docs/decisions/buddy-comes-alive.md).
// Pure decisions only; YardExtras.tsx animates them. No rewards, no timers, no streaks: an extra never
// gives anything and never counts anything. Rules: at most one extra now, at most once per day per extra,
// never the same extra twice in one session, random pick among the eligible.
import type { SessionKind } from '../doorstepSession';

export type WildExtraId =
  | 'daisy-abduction'
  | 'moon-cheese'
  | 'rain-squirrel'
  | 'bone-comet'
  | 'mailbox-periscope'
  | 'duck-parade'
  | 'level-up-fireflies'
  | 'tea-time';

export const WILD_EXTRA_IDS: readonly WildExtraId[] = [
  'daisy-abduction',
  'moon-cheese',
  'rain-squirrel',
  'bone-comet',
  'mailbox-periscope',
  'duck-parade',
  'level-up-fireflies',
  'tea-time',
];

/** Presentation-only tuning, not economy numbers. */
export const LONG_WALK_KM = 3;
export const MAILBOX_EVERY_NTH_WALK = 10;
/** Hours (local) at which the moon is up. */
export const NIGHT_FROM_HOUR = 21;
export const NIGHT_UNTIL_HOUR = 5;
export const AFTERNOON_FROM_HOUR = 14;
export const AFTERNOON_UNTIL_HOUR = 18;
/** Squirrel in a raincoat: no weather data, so autumn months stand in for rain (1-12). */
export const RAINY_MONTHS: readonly number[] = [10, 11];
/** Open-triggered extras (no walk behind them) fire on only this share of eligible opens, so they stay rare. */
export const AMBIENT_CHANCE = 0.4;
/** A walk-close trigger waits this long for the Den to open, then is dropped. */
export const WALK_TRIGGER_TTL_MS = 20 * 60 * 1000;

export interface WalkJustClosed {
  distanceKm: number;
  isWeekend: boolean;
  /** 1-based count of the player's walks including the one that just closed. */
  walkIndex: number;
}

export interface WildExtrasContext {
  /** ms since epoch. */
  now: number;
  sessionKind: SessionKind;
  walkJustClosed?: WalkJustClosed | null;
  levelUpJustHappened: boolean;
  /** 1-12 (local). */
  month: number;
  /** Local ISO day (YYYY-MM-DD) each extra last played. */
  lastShown: Record<string, string>;
  shownThisSession: readonly WildExtraId[];
  rng: () => number;
}

/** Local calendar day, YYYY-MM-DD. */
export function isoDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isWeekend(ms: number): boolean {
  const day = new Date(ms).getDay();
  return day === 0 || day === 6;
}

/** Extras whose own trigger is true right now (before the daily cap, session de-dupe and the ambient roll). */
export function triggeredExtras(ctx: WildExtrasContext): { walk: WildExtraId[]; ambient: WildExtraId[] } {
  const d = new Date(ctx.now);
  const hour = d.getHours();
  const walk: WildExtraId[] = [];
  const ambient: WildExtraId[] = [];
  const w = ctx.walkJustClosed;
  if (w?.isWeekend) walk.push('daisy-abduction');
  if (w && w.distanceKm >= LONG_WALK_KM) walk.push('bone-comet');
  if (w && w.walkIndex > 0 && w.walkIndex % MAILBOX_EVERY_NTH_WALK === 0) walk.push('mailbox-periscope');
  if (ctx.levelUpJustHappened) walk.push('level-up-fireflies');
  if (hour >= NIGHT_FROM_HOUR || hour < NIGHT_UNTIL_HOUR) ambient.push('moon-cheese');
  if (RAINY_MONTHS.includes(ctx.month)) ambient.push('rain-squirrel');
  if (d.getDay() === 1 && ctx.sessionKind === 'fresh-open') ambient.push('duck-parade');
  if (hour >= AFTERNOON_FROM_HOUR && hour < AFTERNOON_UNTIL_HOUR) ambient.push('tea-time');
  return { walk, ambient };
}

/** The two caps: not already played today, not already played this session. */
export function canPlay(
  id: WildExtraId,
  lastShown: Record<string, string>,
  shownThisSession: readonly WildExtraId[],
  now: number
): boolean {
  return lastShown[id] !== isoDay(now) && !shownThisSession.includes(id);
}

/** At most one extra to play now, or null. */
export function resolveWildExtras(ctx: WildExtrasContext): WildExtraId | null {
  const free = (id: WildExtraId) => canPlay(id, ctx.lastShown, ctx.shownThisSession, ctx.now);
  const { walk, ambient } = triggeredExtras(ctx);
  const pool = [...walk.filter(free)];
  const ambientFree = ambient.filter(free);
  // One roll for the whole ambient group, always drawn so a seeded rng stays predictable.
  const ambientRoll = ctx.rng();
  if (ambientFree.length > 0 && ambientRoll < AMBIENT_CHANCE) pool.push(...ambientFree);
  if (pool.length === 0) return null;
  const r = Math.min(0.999999, Math.max(0, ctx.rng()));
  return pool[Math.floor(r * pool.length)];
}

/** The `lastShown` map after `id` played now. */
export function markShown(lastShown: Record<string, string>, id: WildExtraId, now: number): Record<string, string> {
  return { ...lastShown, [id]: isoDay(now) };
}

/** Anything unreadable becomes {}; unknown ids and non-day values are dropped (migration-safe). */
export function normalizeLastShown(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const id of WILD_EXTRA_IDS) {
    const day = (value as Record<string, unknown>)[id];
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) out[id] = day;
  }
  return out;
}

/** Total length of each choreography (ms), all <= 6000. YardExtras and the tests both read this. */
export const WILD_EXTRA_MS: Record<WildExtraId, number> = {
  'daisy-abduction': 5500,
  'moon-cheese': 5000,
  'rain-squirrel': 6000,
  'bone-comet': 3600,
  'mailbox-periscope': 5500,
  'duck-parade': 6000,
  'level-up-fireflies': 5200,
  'tea-time': 6000,
};

// ----- session store: what happened this launch, shared between App (walk close) and the Den -----

interface PendingWalkTrigger {
  walk: WalkJustClosed | null;
  levelUp: boolean;
  at: number;
}

let pending: PendingWalkTrigger | null = null;
let shownThisSession: WildExtraId[] = [];

/** Called when a rewarded walk closes (App.tsx onRewards). Stored in memory until the Den next opens. */
export function queueWalkTrigger(walk: WalkJustClosed | null, levelUp: boolean, now: number = Date.now()): void {
  pending = { walk, levelUp, at: now };
}

/** Takes (and clears) the pending walk trigger unless it went stale. */
export function takeWalkTrigger(now: number = Date.now()): { walk: WalkJustClosed | null; levelUp: boolean } {
  const p = pending;
  pending = null;
  if (!p || now - p.at > WALK_TRIGGER_TTL_MS) return { walk: null, levelUp: false };
  return { walk: p.walk, levelUp: p.levelUp };
}

export function getShownThisSession(): readonly WildExtraId[] {
  return shownThisSession;
}

export function recordShownThisSession(id: WildExtraId): void {
  if (!shownThisSession.includes(id)) shownThisSession = [...shownThisSession, id];
}

/** Test helper. */
export function resetWildExtrasSession(): void {
  pending = null;
  shownThisSession = [];
}

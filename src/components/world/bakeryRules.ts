import { formatNumber } from '../../i18n';

// Pure helpers for the "bakery works visibly" decor in the world scene (presentation only: every
// number is read from the existing economy functions, nothing here changes or persists treats).

/** A bakery treat leaves the chimney every few seconds, never faster/slower than this. */
export const MIN_EMIT_MS = 3000;
export const MAX_EMIT_MS = 12000;

/**
 * How often a treat sprite flies from the bakery to the bowl. One sprite per real treat would be
 * 3600000 / rate ms; that is clamped to 3-12 s so a tiny rate still shows life and a huge one stays calm.
 */
export function bakeryEmitIntervalMs(ratePerHour: number): number {
  if (!Number.isFinite(ratePerHour) || ratePerHour <= 0) return MAX_EMIT_MS;
  return Math.round(Math.min(MAX_EMIT_MS, Math.max(MIN_EMIT_MS, 3_600_000 / ratePerHour)));
}

/**
 * How full the bowl looks: 0 when (nearly) empty, otherwise 1..5 proportional to treats / storageCap
 * (1 = a few, 5 = full). Level 1 is the painted `bowl` sprite alone; 2..5 add that many overlay treats on top.
 */
export function bowlFillLevel(treats: number, cap: number): number {
  if (!(cap > 0) || !(treats >= 1)) return 0;
  const frac = Math.min(1, treats / cap);
  return 1 + Math.min(4, Math.floor(frac * 4.999));
}

/** True when the bowl is at (or beyond) the Doghouse's storage cap; then one extra bone lies next to it. */
export function bowlAtCap(treats: number, cap: number): boolean {
  return cap > 0 && treats >= cap - 1e-6;
}

/** Treats shown in the bowl: stored treats plus what the bakery/territories accrued this session, never above the cap. */
export function projectedTreats(treats: number, sessionGain: number, cap: number): number {
  return Math.min(cap, treats + Math.max(0, sessionGain));
}

/**
 * The pile the bowl shows: the settled pile plus what the bakery/territories baked since `lastTickAt` (the same linear
 * rule applyPassiveAccrual uses), never beyond the room left next to the bank. Display only.
 */
export function projectedPile(pile: number, lastTickAt: number, now: number, ratePerHour: number, bank: number, cap: number): number {
  const hours = Math.max(0, now - lastTickAt) / 3_600_000;
  return Math.min(pile + hours * Math.max(0, ratePerHour), Math.max(0, cap - bank));
}

/** Passive treats per hour (bakery + territories) as the small "+N per hour" figure: one decimal below 10, whole above. */
export function formatRatePerHour(ratePerHour: number): string {
  if (ratePerHour >= 10) return formatNumber(Math.round(ratePerHour));
  return formatNumber(ratePerHour, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

/** Welcome-back burst: at most 8 sprites over about 1.3 s, so never more than 6 fly at once. */
export const BURST_MAX = 8;
export const BURST_STAGGER_MS = 100;
export const BURST_FLIGHT_MS = 600;
export function burstSpriteCount(accrued: number): number {
  return Math.max(1, Math.min(BURST_MAX, Math.floor(accrued)));
}

// Pure count-up maths for AnimatedNumber. No React imports so tests stay renderer-free.

export type Easing = (t: number) => number;

export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Value shown at `progress` (0..1) while counting from `from` to `to`.
 * - progress is clamped to 0..1; exact `to` at progress >= 1, exact `from` at <= 0.
 * - Truncated toward `from` to `decimals` places (0 = whole numbers), so the
 *   sequence is monotonic in both directions and never overshoots `to`.
 */
export function countUpValue(
  from: number,
  to: number,
  progress: number,
  easing: Easing = easeOutCubic,
  decimals = 0
): number {
  if (!Number.isFinite(progress) || progress <= 0) return from;
  if (progress >= 1) return to;
  const eased = Math.min(1, Math.max(0, easing(progress)));
  const scale = Math.pow(10, decimals);
  const delta = (to - from) * eased * scale;
  return from + Math.trunc(delta) / scale;
}

/** Default formatter: whole numbers, or fixed decimals. */
export function formatCount(value: number, decimals = 0): string {
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

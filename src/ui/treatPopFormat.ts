/** "+12 🦴". Whole numbers only; returns '' for amounts that round to <= 0 so callers render nothing. */
export function formatTreatPop(amount: number, emoji: string | null = '🦴'): string {
  const n = Math.round(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  return emoji ? `+${n} ${emoji}` : `+${n}`;
}

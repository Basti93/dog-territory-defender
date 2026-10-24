// Pure local-calendar helpers. No i18n, storage or React Native imports: the
// server build compiles this file by path (via cornerDetection -> territoryCluster).

/** Local calendar-day key (year-month-day), used anywhere "which day did this happen on" needs to be compared — e.g. the manual-log look-back window and the per-day reward multiplier in economy/walkRewards.ts. */
export function calendarDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Local calendar midnight (ms epoch) for the day containing `ms`. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole local-calendar-day gap between two timestamps (0 = same calendar day, 1 = yesterday vs. today, etc.). */
export function calendarDayGap(earlier: number, later: number): number {
  return Math.round((startOfLocalDay(later) - startOfLocalDay(earlier)) / (24 * 60 * 60 * 1000));
}

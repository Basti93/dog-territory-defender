import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/** SQL predicate: `column` falls on the same calendar day as `nowMs` in the household's timezone.
 * Same day notion as the reward multiplier (dayKeyInZone), so caps and rewards roll over together. */
export function sameLocalDay(column: AnyColumn, timeZone: string, nowMs: number): SQL {
  return sql`(${column} at time zone ${timeZone})::date = ${dayKeyInZone(nowMs, timeZone)}::date`;
}

/** YYYY-MM-DD of `ms` in an IANA timezone (the household's notion of "today"). */
export function dayKeyInZone(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return parts; // en-CA formats as YYYY-MM-DD
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

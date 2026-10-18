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

// ---- calendar helpers on YYYY-MM-DD day keys (household-local dates; pure, UTC arithmetic only)

const DAY_MS = 24 * 3600_000;

export function addDays(dayKey: string, n: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(dayKey: string): number {
  return (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Monday of the ISO week containing `dayKey`. */
export function weekStartOf(dayKey: string): string {
  return addDays(dayKey, -weekdayIndex(dayKey));
}

/** Minutes since local midnight of `ms` in `timeZone`. */
export function localMinutesOfDay(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** UTC ms of local `dayKey` at `minutes` after midnight in `timeZone` (DST-safe: two correction passes). */
export function localToUtcMs(dayKey: string, minutes: number, timeZone: string): number {
  const naive = Date.parse(`${dayKey}T00:00:00Z`) + minutes * 60_000;
  let guess = naive;
  for (let i = 0; i < 2; i++) {
    const asLocal = Date.parse(`${dayKeyInZone(guess, timeZone)}T00:00:00Z`) + localMinutesOfDay(guess, timeZone) * 60_000;
    guess += naive - asLocal;
  }
  return guess;
}

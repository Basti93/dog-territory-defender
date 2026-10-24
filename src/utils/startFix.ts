/** A fix older than this at the moment it is taken (or delivered after a start) is a position the OS cached, not "where we are now". */
export const STALE_FIX_MS = 30_000;

/** Was this fix taken more than STALE_FIX_MS before `referenceTime`? */
export function isStaleFix(fix: { timestamp: number }, referenceTime: number): boolean {
  return fix.timestamp < referenceTime - STALE_FIX_MS;
}

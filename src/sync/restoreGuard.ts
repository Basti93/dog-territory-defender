/**
 * Restoring an old backup file over live synced state would fork the
 * household's history (multiplayer-sync design.md Decision 9), so Restore is
 * off while this phone is joined. Leaving the household keeps local data and
 * re-enables it.
 */
export function isRestoreAllowed(joinedHousehold: boolean): boolean {
  return !joinedHousehold;
}

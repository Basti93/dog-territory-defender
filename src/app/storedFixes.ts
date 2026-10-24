import type { Location, Walk } from '../types';

/**
 * Takes over fixes the active-walk store holds that memory lacks (the location task stored them while the UI side was
 * frozen or in another runtime). Dedupes by timestamp, so a live fix that arrived while the store was being read does
 * not hide older stored ones. Returns the walk with every missing fix merged in time order, plus those fixes, oldest first.
 * Which of them are fed to auto-finish is the caller's call (only those newer than what it has already seen).
 */
export function appendStoredFixes(walk: Walk, stored: Location[]): { walk: Walk; added: Location[] } {
  const have = new Set(walk.locations.map((fix) => fix.timestamp));
  const added = stored.filter((fix) => !have.has(fix.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
  if (added.length === 0) return { walk, added };
  return { walk: { ...walk, locations: [...walk.locations, ...added].sort((a, b) => a.timestamp - b.timestamp) }, added };
}

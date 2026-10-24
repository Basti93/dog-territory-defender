// Plain facts the Territories screen shows per territory. Pure; no I/O, no i18n (the screen words them).
// Never ranked, never a warning: "last visited" is only ever a soft phrase.

import { Cell } from '../storage/HomeRangeRepository';
import { getDistance } from './geometry';
import { cellCentre } from './grid';
import { calendarDayGap } from './manualWalkLog';
import { territoryCentre } from './territoryCluster';

/** Km between the centres of two territories' cells; null when either has no cells. */
export function distanceKmBetween(a: readonly Cell[], b: readonly Cell[]): number | null {
  const ca = territoryCentre(a);
  const cb = territoryCentre(b);
  if (!ca || !cb) return null;
  const [latA, lonA] = cellCentre(ca.ix, ca.iy);
  const [latB, lonB] = cellCentre(cb.ix, cb.iy);
  return getDistance(latA, lonA, latB, lonB) / 1000;
}

export type LastVisit = 'today' | 'yesterday' | 'fewDays' | 'lastWeek' | 'awhile';

/** How long ago the newest cell of a territory was refreshed, in soft buckets (no day counts): beyond two weeks it is just "a while". Null without cells. */
export function lastVisitOf(cells: readonly Cell[], now: number): LastVisit | null {
  if (cells.length === 0) return null;
  const newest = cells.reduce((max, c) => Math.max(max, c.lastRefreshed), 0);
  const days = calendarDayGap(newest, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 6) return 'fewDays';
  if (days <= 14) return 'lastWeek';
  return 'awhile';
}

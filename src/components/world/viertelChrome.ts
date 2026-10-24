// Pure helpers for the Viertel's "chrome": the territory sign, the numbers sign and the handwritten notes on the map
// (handover/redesign/konzept.md section 3, mockups/02-viertel.html). No React, no I/O; useViertelChrome.ts feeds them.
// Numbers are the household's own, never comparisons.

import { Cell } from '../../storage/HomeRangeRepository';
import { Territory, TerritoryId } from '../../storage/TerritoryRepository';
import { cellCentre, cellForLocation, cellKey } from '../../utils/grid';
import { calendarDayGap } from '../../utils/manualWalkLog';
import { displayTerritoryName } from '../../utils/territoryDisplayName';
import { formatNumber, t, tPlural } from '../../i18n';

export interface MapNote {
  text: string;
  lat: number;
  lon: number;
  /** Where the text sits relative to the point: on it (default), just below it, or above a 38 px pin. */
  anchor?: 'center' | 'below' | 'abovePin';
  /** `chalk` = the faint hint on unknown ground. */
  kind?: 'ink' | 'chalk';
}

/** A corner as the map sign needs it: the id (tap target), the sign text and the centre cell. */
export interface ViertelCorner {
  id: string;
  name: string;
  ix: number;
  iy: number;
}

export interface LatLon {
  latitude: number;
  longitude: number;
}

/** The numbers sign, one entry per non-zero figure: "42 Runden", "31 Straßen", "3 Ecken". An empty list hides the sign. */
export function statsSignParts(stats: { walks: number; streets: number; corners: number }): string[] {
  const parts: string[] = [];
  if (stats.walks > 0) parts.push(tPlural('viertel.stats.walks', stats.walks));
  if (stats.streets > 0) parts.push(tPlural('viertel.stats.streets', stats.streets));
  if (stats.corners > 0) parts.push(tPlural('viertel.stats.corners', stats.corners));
  return parts;
}

export function statsSignText(stats: { walks: number; streets: number; corners: number }): string {
  return statsSignParts(stats).join(' · ');
}

/**
 * The handwritten notes: "heute genäht" below the cell painted most recently today, and "Zeit zum Schnuppern"
 * above the Somewhere-Wild pin. Either is left out when there is nothing to point at.
 */
export function pickViertelNotes(input: { cells: Cell[]; wildSpot: LatLon | null; now: number }): MapNote[] {
  const notes: MapNote[] = [];
  let newest: Cell | null = null;
  for (const c of input.cells) {
    if (calendarDayGap(c.lastRefreshed, input.now) !== 0) continue;
    if (!newest || c.lastRefreshed > newest.lastRefreshed) newest = c;
  }
  if (newest) {
    const [lat, lon] = cellCentre(newest.ix, newest.iy);
    notes.push({ text: t('viertel.note.today'), lat, lon, anchor: 'below' });
  }
  if (input.wildSpot) {
    notes.push({ text: t('viertel.note.wild'), lat: input.wildSpot.latitude, lon: input.wildSpot.longitude, anchor: 'abovePin' });
  }
  return notes;
}

/** The chalk hint at the centre of an empty Viertel. */
export function emptyRangeNote(center: LatLon): MapNote {
  return { text: t('viertel.note.explore'), lat: center.latitude, lon: center.longitude, anchor: 'center', kind: 'chalk' };
}

/** The territory the latest walk ended in (`lastWalkEnd`, see WalkRepository.getLastWalkEnd); falls back to the territory of the most recently painted cell. */
export function latestWalkTerritoryId(lastWalkEnd: LatLon | null, cells: Cell[]): TerritoryId | null {
  const byKey = new Map(cells.map((c) => [cellKey(c.ix, c.iy), c]));
  if (lastWalkEnd) {
    const cell = cellForLocation(lastWalkEnd.latitude, lastWalkEnd.longitude);
    const id = byKey.get(cellKey(cell.ix, cell.iy))?.territoryId;
    if (id) return id;
  }
  let recent: Cell | null = null;
  for (const c of cells) {
    if (c.territoryId && (!recent || c.lastRefreshed > recent.lastRefreshed)) recent = c;
  }
  return recent?.territoryId ?? null;
}

export interface TerritoryHeading {
  name: string;
}

/** Name of the territory the latest walk was in; null when there is none. */
export function territoryHeading(input: { territories: Territory[]; cells: Cell[]; lastWalkEnd: LatLon | null; now: number }): TerritoryHeading | null {
  const id = latestWalkTerritoryId(input.lastWalkEnd, input.cells);
  const territory = id ? input.territories.find((x) => x.id === id) : undefined;
  if (!territory) return null;
  return { name: displayTerritoryName(territory.name) };
}

/**
 * The stats sign's income line: "Euer Boden bringt 1,4 Leckerlis/Std." from 1 an hour, below that "alle 2 Std. ein
 * Leckerli", and "alle 3 Tage" when it is slower still. Null when there is no income at all. Always shown, no threshold.
 */
export function incomeLine(ratePerHour: number): string | null {
  if (!(ratePerHour > 0)) return null;
  if (ratePerHour >= 1) return t('viertel.income.perHour', { rate: formatNumber(Math.round(ratePerHour * 10) / 10, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
  const hours = Math.round(1 / ratePerHour);
  if (hours <= 48) return t('viertel.income.everyHours', { hours: Math.max(1, hours) });
  const days = Math.round(hours / 24);
  if (days <= 30) return t('viertel.income.everyDays', { days });
  return t('viertel.income.tiny');
}

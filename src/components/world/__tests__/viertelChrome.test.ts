import { Cell } from '../../../storage/HomeRangeRepository';
import { Territory } from '../../../storage/TerritoryRepository';
import { Walk } from '../../../types';
import { cellCentre } from '../../../utils/grid';
import { t } from '../../../i18n';
import { emptyRangeNote, latestWalkTerritoryId, pickViertelNotes, statsSignParts, statsSignText, territoryHeading } from '../viertelChrome';

const NOW = new Date(2026, 9, 18, 15, 0).getTime();
const HOUR = 60 * 60 * 1000;

const cell = (ix: number, iy: number, lastRefreshed: number, territoryId: string | null = 't1'): Cell => ({ ix, iy, lastRefreshed, lastTracked: lastRefreshed, visits: 1, territoryId });
const territory = (id: string, name: string, createdAt: number): Territory => ({ id, name, createdAt, walksHere: 1, treatsEarnedHere: 0 });
const walkEndingIn = (ix: number, iy: number, startTime: number): Walk => {
  const [latitude, longitude] = cellCentre(ix, iy);
  return { id: `w${startTime}`, startTime, locations: [{ latitude, longitude, timestamp: startTime, accuracy: 5 }], closed: true, startSource: 'button' };
};

describe('statsSignParts', () => {
  it('lists the household numbers with plurals', () => {
    expect(statsSignParts({ walks: 42, streets: 31, corners: 3 })).toEqual(['42 walks', '31 streets', '3 corners']);
    expect(statsSignParts({ walks: 1, streets: 1, corners: 1 })).toEqual(['1 walk', '1 street', '1 corner']);
  });

  it('hides a zero part, and the whole sign when everything is zero', () => {
    expect(statsSignParts({ walks: 5, streets: 0, corners: 0 })).toEqual(['5 walks']);
    expect(statsSignParts({ walks: 0, streets: 0, corners: 0 })).toEqual([]);
    expect(statsSignText({ walks: 2, streets: 0, corners: 3 })).toBe('2 walks · 3 corners');
  });
});

describe('pickViertelNotes', () => {
  it('puts "heute genäht" at the cell painted most recently today, below it', () => {
    const cells = [cell(10, 10, NOW - 30 * HOUR), cell(11, 10, NOW - 5 * HOUR), cell(12, 10, NOW - 1 * HOUR)];
    const [lat, lon] = cellCentre(12, 10);
    expect(pickViertelNotes({ cells, wildSpot: null, now: NOW })).toEqual([{ text: t('viertel.note.today'), lat, lon, anchor: 'below' }]);
  });

  it('has no "today" note when nothing was painted today', () => {
    expect(pickViertelNotes({ cells: [cell(1, 1, NOW - 40 * HOUR)], wildSpot: null, now: NOW })).toEqual([]);
  });

  it('puts the wild note above the Somewhere-Wild pin', () => {
    const notes = pickViertelNotes({ cells: [], wildSpot: { latitude: 52.5, longitude: 13.4 }, now: NOW });
    expect(notes).toEqual([{ text: t('viertel.note.wild'), lat: 52.5, lon: 13.4, anchor: 'abovePin' }]);
  });

  it('the empty-Range hint is a chalk note on the centre', () => {
    expect(emptyRangeNote({ latitude: 1, longitude: 2 })).toEqual({ text: t('viertel.note.explore'), lat: 1, lon: 2, anchor: 'center', kind: 'chalk' });
  });
});

describe('territoryHeading', () => {
  const territories = [territory('t1', 'Hinterm Park', 100), territory('t2', 'Am Fluss', 200)];
  const cells = [cell(10, 10, NOW - HOUR, 't1'), cell(50, 50, NOW - 30 * HOUR, 't2')];

  it('is the territory of the latest walk, with its character title', () => {
    const walks = [walkEndingIn(50, 50, NOW - 50 * HOUR), walkEndingIn(10, 10, NOW - 2 * HOUR)];
    expect(latestWalkTerritoryId(walks, cells)).toBe('t1');
    const heading = territoryHeading({ territories, cells, walks, now: NOW });
    expect(heading?.name).toBe('Hinterm Park');
    expect(heading?.title).toBe('Everyday'); // oldest territory takes the first title
  });

  it('falls back to the most recently painted territory without a usable walk', () => {
    expect(latestWalkTerritoryId([], cells)).toBe('t1');
    expect(latestWalkTerritoryId([walkEndingIn(999, 999, NOW)], cells)).toBe('t1');
  });

  it('is null without territories', () => {
    expect(territoryHeading({ territories: [], cells, walks: [], now: NOW })).toBeNull();
    expect(territoryHeading({ territories, cells: [], walks: [], now: NOW })).toBeNull();
  });

  it('has no title for a single territory', () => {
    expect(territoryHeading({ territories: [territories[0]], cells, walks: [], now: NOW })?.title).toBeNull();
  });
});

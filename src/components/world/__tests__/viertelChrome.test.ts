import { Cell } from '../../../storage/HomeRangeRepository';
import { Territory } from '../../../storage/TerritoryRepository';
import { cellCentre } from '../../../utils/grid';
import { setLocale, t } from '../../../i18n';
import { emptyRangeNote, incomeLine, latestWalkTerritoryId, pickViertelNotes, statsSignParts, statsSignText, territoryHeading } from '../viertelChrome';

const NOW = new Date(2026, 9, 18, 15, 0).getTime();
const HOUR = 60 * 60 * 1000;

const cell = (ix: number, iy: number, lastRefreshed: number, territoryId: string | null = 't1'): Cell => ({ ix, iy, lastRefreshed, lastTracked: lastRefreshed, visits: 1, territoryId });
const territory = (id: string, name: string, createdAt: number): Territory => ({ id, name, createdAt, walksHere: 1, treatsEarnedHere: 0 });
const endIn = (ix: number, iy: number): { latitude: number; longitude: number } => {
  const [latitude, longitude] = cellCentre(ix, iy);
  return { latitude, longitude };
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
  it('puts "hier wart ihr heute" at the cell painted most recently today, below it', () => {
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

  it('is the territory of the latest walk', () => {
    const lastWalkEnd = endIn(10, 10);
    expect(latestWalkTerritoryId(lastWalkEnd, cells)).toBe('t1');
    const heading = territoryHeading({ territories, cells, lastWalkEnd, now: NOW });
    expect(heading?.name).toBe('Hinterm Park');
  });

  it('falls back to the most recently painted territory without a usable walk', () => {
    expect(latestWalkTerritoryId(null, cells)).toBe('t1');
    expect(latestWalkTerritoryId(endIn(999, 999), cells)).toBe('t1');
  });

  it('is null without territories', () => {
    expect(territoryHeading({ territories: [], cells, lastWalkEnd: null, now: NOW })).toBeNull();
    expect(territoryHeading({ territories, cells: [], lastWalkEnd: null, now: NOW })).toBeNull();
  });
});

describe('incomeLine', () => {
  it('shows one decimal from 1 an hour, "every N hours" below, days when slower still, nothing without income', () => {
    setLocale('de');
    expect(incomeLine(1.44)).toBe('Euer Boden bringt 1,4 Leckerlis/Std.');
    expect(incomeLine(0.4)).toBe('Euer Boden bringt alle 3 Std. ein Leckerli');
    expect(incomeLine(0.02)).toBe('Euer Boden bringt alle 2 Tage ein Leckerli');
    expect(incomeLine(0.0001)).toBe('Euer Boden fängt gerade an, Leckerlis zu bringen');
    expect(incomeLine(0)).toBeNull();
    setLocale('en');
  });
});

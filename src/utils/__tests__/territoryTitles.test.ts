import { Cell } from '../../storage/HomeRangeRepository';
import { Territory } from '../../storage/TerritoryRepository';
import { assignTerritoryTitles } from '../territoryTitles';

const NOW = Date.parse('2026-08-22T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function territory(id: string, overrides: Partial<Territory> = {}): Territory {
  return { id, name: id, createdAt: 0, walksHere: 0, treatsEarnedHere: 0, ...overrides };
}

function cell(ix: number, iy: number, lastRefreshed: number): Cell {
  return { ix, iy, lastRefreshed, lastTracked: lastRefreshed, visits: 1, territoryId: null };
}

describe('assignTerritoryTitles', () => {
  it('a single territory gets no title at all', () => {
    const territories = [territory('a', { createdAt: 0 })];
    const cellsByTerritory = new Map([['a', [cell(0, 0, NOW)]]]);

    const titles = assignTerritoryTitles(territories, cellsByTerritory, NOW);

    expect(titles.size).toBe(0);
  });

  it('distinct winners per category resolve to distinct territories', () => {
    // "home" = oldest = territory A, at the origin.
    const territories = [
      territory('a', { createdAt: 0, walksHere: 1 }),
      // Most walks -> Everyday.
      territory('b', { createdAt: 1000, walksHere: 100 }),
      // Freshest wildness (never refreshed = fully wild) -> Wild One.
      territory('c', { createdAt: 2000, walksHere: 2 }),
      // Far from home's centroid -> Far One.
      territory('d', { createdAt: 3000, walksHere: 3 }),
    ];
    const cellsByTerritory = new Map<string, Cell[]>([
      ['a', [cell(0, 0, NOW)]], // home, freshly refreshed (wildness 0)
      ['b', [cell(1, 1, NOW)]], // freshly refreshed too, but most walks
      ['c', [cell(2, 2, NOW - 30 * MS_PER_DAY)]], // long unrefreshed -> fully wild
      ['d', [cell(100000, 100000, NOW)]], // far away in grid-index terms
    ]);

    const titles = assignTerritoryTitles(territories, cellsByTerritory, NOW);

    expect(titles.get('b')).toBe('Everyday');
    expect(titles.get('c')).toBe('Wild One');
    expect(titles.get('d')).toBe('Far One');
    expect(titles.has('a')).toBe(false);
  });

  it('a tie collapsing two categories onto one territory cascades to the next-best candidate for the lower-priority category', () => {
    // Territory B wins BOTH Everyday (most walks) and would also be the
    // Wild One if not already titled — Wild One priority is lower, so it
    // must cascade to the next-best wild candidate instead of double-stacking.
    const territories = [
      territory('a', { createdAt: 0, walksHere: 1 }),
      territory('b', { createdAt: 1000, walksHere: 100 }),
      territory('c', { createdAt: 2000, walksHere: 2 }),
    ];
    const cellsByTerritory = new Map<string, Cell[]>([
      ['a', [cell(0, 0, NOW)]],
      ['b', [cell(1, 1, NOW - 30 * MS_PER_DAY)]], // most walks AND wildest
      ['c', [cell(2, 2, NOW - 10 * MS_PER_DAY)]], // second-wildest
    ]);

    const titles = assignTerritoryTitles(territories, cellsByTerritory, NOW);

    expect(titles.get('b')).toBe('Everyday');
    expect(titles.get('c')).toBe('Wild One');
  });

  it('a category goes unawarded rather than forcing a hollow title when territories run out', () => {
    // Only two territories but three categories — one category must go
    // unawarded once both territories already hold a title.
    const territories = [
      territory('a', { createdAt: 0, walksHere: 1 }),
      territory('b', { createdAt: 1000, walksHere: 50 }),
    ];
    const cellsByTerritory = new Map<string, Cell[]>([
      ['a', [cell(0, 0, NOW)]],
      ['b', [cell(1, 1, NOW)]],
    ]);

    const titles = assignTerritoryTitles(territories, cellsByTerritory, NOW);

    // Everyday -> b, Wild One -> a (both equally fresh, but a is the only
    // remaining untitled territory once b takes Everyday), Far One has no
    // territory left to award to.
    expect(titles.size).toBe(2);
    expect(Array.from(titles.values())).not.toContain('Far One');
  });
});

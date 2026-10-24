import { setLocale, t } from '../../i18n';
import { createInMemoryTerritoryRepository } from '../../storage/inMemoryTerritoryRepository';
import type { StoredCorner } from '../../storage/CornerRepository';
import type { Cell } from '../../storage/HomeRangeRepository';
import type { Territory } from '../../storage/TerritoryRepository';
import { DAY_MS, manualWalk, newGroundIds, stillWalk, trackedWalk, TUESDAY_AFTERNOON } from '../../test/postcardFixtures';
import { cellForLocation } from '../../utils/grid';
import {
  BENCH_CARD_COUNT,
  benchCards,
  buildPostcards,
  daypartForHour,
  daypartPhrase,
  newStreetsPhrase,
  LINE_POOL_SIZES,
  pickBuddyLineKey,
  pickFavouriteId,
  postcardForWalk,
  cornerNameForWalk,
  postcardWords,
  territoryNameForWalk,
  type PostcardEntry,
  type PostcardFacts,
} from '../postcards';
import en from '../../i18n/en';
import de from '../../i18n/de';

const plainFacts: PostcardFacts = { firstPlace: false, newTerritory: false, longWalk: false, shortWalk: false, weekend: false, daypart: 'afternoon' };
const territory = (id: string, createdAt: number, name = 'Newt Range'): Territory => ({ id, name, createdAt, walksHere: 1, treatsEarnedHere: 0 });

beforeEach(() => setLocale('en'));
afterAll(() => setLocale('en'));

describe('daypart', () => {
  it('buckets every hour into Morgen, Vormittag, Mittag, Nachmittag, Abend, Nacht', () => {
    const at = (h: number) => daypartForHour(h);
    expect([0, 4].map(at)).toEqual(['night', 'night']);
    expect([5, 8].map(at)).toEqual(['morning', 'morning']);
    expect([9, 10].map(at)).toEqual(['forenoon', 'forenoon']);
    expect([11, 13].map(at)).toEqual(['midday', 'midday']);
    expect([14, 17].map(at)).toEqual(['afternoon', 'afternoon']);
    expect([18, 21].map(at)).toEqual(['evening', 'evening']);
    expect([22, 23].map(at)).toEqual(['night', 'night']);
  });

  it('writes weekday plus daypart in both languages (German as one compound)', () => {
    expect(daypartPhrase(TUESDAY_AFTERNOON)).toBe('Tuesday afternoon');
    setLocale('de');
    expect(daypartPhrase(TUESDAY_AFTERNOON)).toBe('Dienstagnachmittag');
    expect(daypartPhrase(new Date(2026, 9, 13, 10).getTime())).toBe('Dienstagvormittag');
    expect(daypartPhrase(new Date(2026, 9, 13, 12).getTime())).toBe('Dienstagmittag');
    expect(daypartPhrase(new Date(2026, 9, 13, 7).getTime())).toBe('Dienstagmorgen');
    expect(daypartPhrase(new Date(2026, 9, 13, 19).getTime())).toBe('Dienstagabend');
    expect(daypartPhrase(new Date(2026, 9, 13, 23).getTime())).toBe('Dienstagnacht');
  });
});

describe('postcard list derivation', () => {
  it('gives every tracked walk that went somewhere a card, newest first', () => {
    const walks = [
      trackedWalk('old', { startTime: TUESDAY_AFTERNOON - 3 * DAY_MS }),
      trackedWalk('new', { startTime: TUESDAY_AFTERNOON }),
      trackedWalk('mid', { startTime: TUESDAY_AFTERNOON - DAY_MS }),
    ];
    const cards = buildPostcards(walks, []);
    expect(cards.map((c) => c.id)).toEqual(['new', 'mid', 'old']);
    expect(cards.every((c) => c.kind === 'tracked')).toBe(true);
    expect(cards[0].distanceMeters).toBeGreaterThan(200);
  });

  it('gives a walk that painted nothing (no fixes, or standing still) no card', () => {
    const noFixes = trackedWalk('none', { locations: [] });
    const cards = buildPostcards([noFixes, stillWalk('still'), trackedWalk('real')], []);
    expect(cards.map((c) => c.id)).toEqual(['real']);
  });

  it('turns a manual log into a handwriting-only card without distance or streets', () => {
    const card = postcardForWalk(manualWalk('m1'), [])!;
    expect(card.kind).toBe('handwritten');
    expect(card.distanceMeters).toBe(0);
    expect(card.newStreets).toBe(0);
    const words = postcardWords(card, { dog: 'Rex', territoryName: null });
    expect(words.distance).toBeNull();
    expect(words.streets).toBeNull();
    expect(words.when).toBe('Tuesday'); // weekday only: the time of day of a log is when it was written, not walked
    expect(words.postmark).toBe(t('postcard.postmark.manual'));
  });

  it('counts new streets only from New Ground that clears the homecoming bar', () => {
    expect(postcardForWalk(trackedWalk('a', { newGroundCellIds: newGroundIds(11) }), [])!.newStreets).toBe(0);
    const some = postcardForWalk(trackedWalk('b', { newGroundCellIds: newGroundIds(33) }), [])!;
    expect(some.newStreets).toBe(3); // 11 cells per street
    expect(some.facts.firstPlace).toBe(true);
    expect(postcardForWalk(trackedWalk('c'), [])!.facts.firstPlace).toBe(false);
  });

  it('marks a new territory only when it was created during that walk', () => {
    const walk = trackedWalk('w');
    const during = territory('t1', TUESDAY_AFTERNOON + 60_000);
    const before = territory('t2', TUESDAY_AFTERNOON - DAY_MS);
    const muchLater = territory('t3', TUESDAY_AFTERNOON + 6 * 60 * 60 * 1000);
    expect(postcardForWalk(walk, [during])!.facts.newTerritory).toBe(true);
    expect(postcardForWalk(walk, [before, muchLater])!.facts.newTerritory).toBe(false);
  });

  it('flags a long walk at 3 km', () => {
    const short = postcardForWalk(trackedWalk('s'), [])!;
    expect(short.facts.longWalk).toBe(false);
    const long = trackedWalk('l', { locations: trackedWalk('x', { startTime: TUESDAY_AFTERNOON }).locations.map((p, i) => ({ ...p, longitude: 13.4 + i * 0.0005, timestamp: TUESDAY_AFTERNOON + i * 20_000 })) });
    // 120 fixes x 0.0005 deg (~34 m each, 20 s apart) is about 4 km
    expect(postcardForWalk(long, [])!.facts.longWalk).toBe(true);
  });

  it('shows the newest three on the bench', () => {
    const walks = Array.from({ length: 5 }, (_, i) => trackedWalk(`w${i}`, { startTime: TUESDAY_AFTERNOON - i * DAY_MS }));
    const shown = benchCards(buildPostcards(walks, []));
    expect(BENCH_CARD_COUNT).toBe(3);
    expect(shown.map((c) => c.id)).toEqual(['w0', 'w1', 'w2']);
  });
});

describe('Buddy line picker', () => {
  const entry = (id: string, facts: Partial<PostcardFacts> = {}, kind: PostcardEntry['kind'] = 'tracked') => ({ id, kind, facts: { ...plainFacts, ...facts } });

  it('is stable for a card and always resolves to real copy in both languages', () => {
    for (const locale of ['en', 'de'] as const) {
      setLocale(locale);
      const dict = locale === 'en' ? en : de;
      for (let i = 0; i < 40; i++) {
        const facts: PostcardFacts = {
          firstPlace: i % 2 === 0,
          newTerritory: i % 5 === 0,
          longWalk: i % 3 === 0,
          shortWalk: i % 4 === 0,
          weekend: i % 7 === 0,
          daypart: (['morning', 'forenoon', 'midday', 'afternoon', 'evening', 'night'] as const)[i % 6],
        };
        const key = pickBuddyLineKey(entry(`walk-${i}`, facts));
        expect(pickBuddyLineKey(entry(`walk-${i}`, facts))).toBe(key);
        expect(dict[key]).toBeDefined();
      }
    }
  });

  it('prefers a new territory over everything else', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickBuddyLineKey(entry(`t${i}`, { newTerritory: true, firstPlace: true, longWalk: true }))).toMatch(/^postcard\.line\.newTerritory\./);
    }
  });

  it('draws from what was special that day', () => {
    const firstPlaceOnly = Array.from({ length: 20 }, (_, i) => pickBuddyLineKey(entry(`f${i}`, { firstPlace: true })));
    expect(firstPlaceOnly.every((k) => /^postcard\.line\.firstPlace\./.test(k))).toBe(true);
    expect(pickBuddyLineKey(entry('e1', { daypart: 'evening' }))).toMatch(/^postcard\.line\.evening\./);
    expect(pickBuddyLineKey(entry('e2', { daypart: 'night' }))).toMatch(/^postcard\.line\.night\./);
    expect(pickBuddyLineKey(entry('e3', { daypart: 'forenoon' }))).toMatch(/^postcard\.line\.morning\./);
    expect(pickBuddyLineKey(entry('e4', { longWalk: true }))).toMatch(/^postcard\.line\.long\./);
  });

  it('falls back to the plain pool when nothing was special, and has its own pool for a handwritten card', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickBuddyLineKey(entry(`p${i}`))).toMatch(/^postcard\.line\.plain\./);
      expect(pickBuddyLineKey(entry(`m${i}`, { firstPlace: true }, 'handwritten'))).toMatch(/^postcard\.line\.manual\./);
    }
  });

  it('gives short walks, weekends and named corners their own pools, after the old specials only by seed', () => {
    expect(pickBuddyLineKey(entry('s1', { shortWalk: true }))).toMatch(/^postcard\.line\.short\./);
    expect(pickBuddyLineKey(entry('w1', { weekend: true }))).toMatch(/^postcard\.line\.weekend\./);
    expect(pickBuddyLineKey(entry('c1'), { cornerTouched: true })).toMatch(/^postcard\.line\.corner\./);
    expect(pickBuddyLineKey(entry('t1', { newTerritory: true, shortWalk: true, weekend: true }), { cornerTouched: true })).toMatch(/newTerritory/);
  });

  it('spreads the plain pool over several lines', () => {
    const keys = new Set(Array.from({ length: 60 }, (_, i) => pickBuddyLineKey(entry(`spread-${i}`))));
    expect(keys.size).toBeGreaterThan(1);
  });

  it('has copy for every pool line in en and de, numbered 1..N without gaps', () => {
    const pools = Object.entries(LINE_POOL_SIZES);
    for (const dict of [en, de] as Array<Record<string, string>>) {
      for (const [pool, n] of pools) {
        for (let i = 1; i <= n; i++) expect(dict[`postcard.line.${pool}.${i}`]).toBeDefined();
        expect(dict[`postcard.line.${pool}.${n + 1}`]).toBeUndefined();
      }
    }
  });
});

describe('favourite picker', () => {
  const card = (id: string, over: Partial<Omit<PostcardEntry, 'facts'>> & { facts?: Partial<PostcardFacts> } = {}): PostcardEntry => ({
    id,
    walk: trackedWalk(id),
    kind: 'tracked',
    startTime: 0,
    distanceMeters: 1000,
    newStreets: 0,
    ...over,
    facts: { ...plainFacts, ...over.facts },
  });

  it('is null for an empty album or one with only handwritten cards', () => {
    expect(pickFavouriteId([])).toBeNull();
    expect(pickFavouriteId([card('m', { kind: 'handwritten', distanceMeters: 0 })])).toBeNull();
  });

  it('prefers a first-time place (the newest), then a new territory, then the longest walk', () => {
    const longest = card('long', { distanceMeters: 9000 });
    const territoryCard = card('territory', { facts: { newTerritory: true } });
    const firstNew = card('first-new', { facts: { firstPlace: true } });
    const firstOld = card('first-old', { facts: { firstPlace: true } });
    expect(pickFavouriteId([longest, territoryCard, firstNew, firstOld])).toBe('first-new');
    expect(pickFavouriteId([longest, territoryCard])).toBe('territory');
    expect(pickFavouriteId([card('a', { distanceMeters: 500 }), longest, card('b', { distanceMeters: 700 })])).toBe('long');
  });

  it('picks exactly one card', () => {
    const cards = [card('x', { facts: { firstPlace: true } }), card('y', { facts: { firstPlace: true } })];
    expect(cards.filter((c) => c.id === pickFavouriteId(cards))).toHaveLength(1);
  });
});

describe('words on the card', () => {
  it('writes written-out street counts, and nothing for zero', () => {
    expect(newStreetsPhrase(0)).toBeNull();
    expect(newStreetsPhrase(1)).toBe('one new street');
    expect(newStreetsPhrase(3)).toBe('three new streets');
    expect(newStreetsPhrase(14)).toBe('14 new streets');
    setLocale('de');
    expect(newStreetsPhrase(1)).toBe('eine neue Straße');
    expect(newStreetsPhrase(3)).toBe('drei neue Straßen');
  });

  it('builds the back: when, distance, streets, Buddy line, signature, postmark', () => {
    setLocale('de');
    const card = postcardForWalk(trackedWalk('w', { newGroundCellIds: newGroundIds(33) }), [])!;
    const words = postcardWords(card, { dog: 'Rex', territoryName: 'Revier am Park' });
    expect(words.when).toBe('Dienstagnachmittag');
    expect(words.distance).toMatch(/^0,\d km$/);
    expect(words.streets).toBe('drei neue Straßen');
    expect(words.signature).toBe('- Rex');
    expect(words.postmark).toBe('Revier am Park');
    expect(words.buddyLine.length).toBeGreaterThan(5);
    expect(words.buddyLine).not.toMatch(/[{}]/);
  });

  it('postmarks with a neutral line when the territory is unknown, and leaves streets out when there are none', () => {
    const card = postcardForWalk(trackedWalk('w2'), [])!;
    const words = postcardWords(card, { dog: 'Rex', territoryName: null });
    expect(words.postmark).toBe(t('postcard.postmark.fallback'));
    expect(words.streets).toBeNull();
  });

  it('never compares with other walks and never puts the homecoming star number on the card', () => {
    const allLines = Object.entries(en).filter(([k]) => k.startsWith('postcard.line.')).map(([, v]) => v.toLowerCase());
    for (const line of allLines) expect(line).not.toMatch(/than last|shorter|longer than|more than|less than|record/);
    const card = postcardForWalk(trackedWalk('w3', { newGroundCellIds: newGroundIds(33) }), [])!;
    const words = postcardWords(card, { dog: 'Rex', territoryName: null });
    expect(Object.values(words).join(' ')).not.toMatch(/\+\d/);
  });
});

describe('postmark territory', () => {
  it('names the territory most of the walk lies in', async () => {
    const walk = trackedWalk('w');
    const repo = createInMemoryTerritoryRepository();
    const idA = await repo.createTerritory('Rex als Zweiter', 1);
    const idB = await repo.createTerritory('Revier am Park', 2);
    const territories = await repo.getTerritories();
    const cells: Cell[] = [];
    walk.locations.forEach((loc, i) => {
      const { ix, iy } = cellForLocation(loc.latitude, loc.longitude);
      cells.push({ ix, iy, lastRefreshed: 0, lastTracked: 0, visits: 1, territoryId: i < 100 ? idB : idA });
    });
    expect(territoryNameForWalk(walk, cells, territories)).toBe('Revier am Park');
    expect(territoryNameForWalk(walk, [], territories)).toBeNull();
    expect(territoryNameForWalk(walk, cells.map((c) => ({ ...c, territoryId: null })), territories)).toBeNull();
  });
});

describe('the postmark with a corner (Unsere Ecken)', () => {
  const walk = trackedWalk('w');
  // The walk runs east from (52.5, 13.4); a corner on its path:
  const onPath = cellForLocation(walk.locations[60].latitude, walk.locations[60].longitude);
  const farAway = cellForLocation(48.1, 11.5);
  const corner = (over: Partial<StoredCorner> = {}): StoredCorner => ({
    id: `${onPath.ix},${onPath.iy}`,
    ix: onPath.ix,
    iy: onPath.iy,
    createdAt: 1,
    walkId: 'old',
    street: null,
    name: null,
    nameBy: null,
    nameAt: null,
    ...over,
  });

  it('uses the corner name when the walk ran through a named corner, before the territory name', () => {
    setLocale('de');
    expect(cornerNameForWalk(walk, [corner({ name: 'Kiosk-Ecke' })])).toBe('Kiosk-Ecke');
    const card = postcardForWalk(walk, [])!;
    expect(postcardWords(card, { dog: 'Rex', territoryName: 'Revier am Park', cornerName: 'Kiosk-Ecke' }).postmark).toBe('Kiosk-Ecke');
    expect(postcardWords(card, { dog: 'Rex', territoryName: 'Revier am Park', cornerName: null }).postmark).toBe('Revier am Park');
    expect(postcardWords(card, { dog: 'Rex', territoryName: 'Revier am Park' }).postmark).toBe('Revier am Park');
  });

  it('falls back to "Ecke {street}" for an unnamed corner, and skips a corner with neither so the territory name stays', () => {
    setLocale('de');
    expect(cornerNameForWalk(walk, [corner({ street: 'Lindenstraße' })])).toBe('Ecke Lindenstraße');
    expect(cornerNameForWalk(walk, [corner()])).toBeNull();
  });

  it('is null when the walk missed every corner, and never postmarks a handwritten card', () => {
    expect(cornerNameForWalk(walk, [corner({ id: `${farAway.ix},${farAway.iy}`, ix: farAway.ix, iy: farAway.iy, name: 'Weit weg' })])).toBeNull();
    expect(cornerNameForWalk(walk, [])).toBeNull();
    const handwritten = postcardForWalk(manualWalk('m'), [])!;
    expect(postcardWords(handwritten, { dog: 'Rex', territoryName: null, cornerName: 'Kiosk-Ecke' }).postmark).toBe(t('postcard.postmark.manual'));
  });
});

import { tapCaption } from '../../components/buddy/buddyMood';
import { pickGreeting } from '../../components/DoorstepScreen';
import { currentTitleForLevel } from '../../economy/milestones';
import { ACHIEVEMENTS } from '../../economy/personalStats';
import de from '../de';
import en from '../en';
import {
  formatDate,
  formatDistanceKm,
  formatNumber,
  getLocale,
  resolveLocale,
  setLocale,
  t,
  tPlural,
} from '../index';

function placeholders(s: string): string[] {
  return (s.match(/\{(\w+)\}/g) ?? []).sort();
}

describe('i18n', () => {
  beforeEach(() => setLocale('en'));
  afterAll(() => setLocale('en'));

  describe('t / interpolation', () => {
    it('fills {name} placeholders', () => {
      expect(t('celebration.headline.2', { name: 'Rex' })).toBe('What a walk! Rex is thrilled.');
    });

    it('leaves unknown placeholders untouched', () => {
      expect(t('celebration.headline.2')).toBe('What a walk! {name} is thrilled.');
    });

    it('translates after setLocale', () => {
      setLocale('de');
      expect(getLocale()).toBe('de');
      expect(t('menu.settings')).toBe('Einstellungen');
    });
  });

  describe('tPlural', () => {
    it('picks .one for exactly 1 and .other otherwise, with {count}', () => {
      expect(tPlural('doorstep.bakerBaked', 1)).toBe('The Treat Bakery baked 1 treat.');
      expect(tPlural('doorstep.bakerBaked', 0)).toBe('The Treat Bakery baked 0 treats.');
      expect(tPlural('doorstep.bakerBaked', 7)).toBe('The Treat Bakery baked 7 treats.');
    });

    it('passes extra vars', () => {
      expect(tPlural('den.streetsByHeart', 2, { dog: 'Rex' })).toBe('Rex knows 2 streets by heart.');
      setLocale('de');
      expect(tPlural('den.streetsByHeart', 1, { dog: 'Rex' })).toBe('Rex kennt 1 Straße in- und auswendig.');
    });
  });

  describe('fallback chain', () => {
    const enOnly = 'test.only.en';
    const missingEverywhere = 'test.missing.everywhere';

    beforeAll(() => {
      en[enOnly] = 'English only {x}';
    });
    afterAll(() => {
      delete en[enOnly];
    });

    it('falls back from de to en for a missing de key', () => {
      setLocale('de');
      expect(t(enOnly, { x: 1 })).toBe('English only 1');
    });

    it('returns the key and warns once in dev when missing everywhere', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(t(missingEverywhere)).toBe(missingEverywhere);
      expect(t(missingEverywhere)).toBe(missingEverywhere);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });

  describe('resolveLocale', () => {
    it('maps device locales', () => {
      expect(resolveLocale('system', 'de-DE')).toBe('de');
      expect(resolveLocale('system', 'de_AT')).toBe('de');
      expect(resolveLocale('system', 'en-GB')).toBe('en');
      expect(resolveLocale('system', 'fr')).toBe('en');
      expect(resolveLocale('system', '')).toBe('en');
    });

    it('explicit preference wins over the device', () => {
      expect(resolveLocale('en', 'de-DE')).toBe('en');
      expect(resolveLocale('de', 'fr')).toBe('de');
    });
  });

  describe('formatting', () => {
    it('formats numbers and distances per locale', () => {
      expect(formatNumber(1234.5)).toBe('1,234.5');
      expect(formatDistanceKm(1.5)).toBe('1.50 km');
      setLocale('de');
      expect(formatNumber(1234.5)).toBe('1.234,5');
      expect(formatDistanceKm(1.5)).toBe('1,50 km');
    });

    it('formats weekdays per locale', () => {
      const monday = new Date(2026, 0, 5, 12);
      expect(formatDate(monday, { weekday: 'long' })).toBe('Monday');
      setLocale('de');
      expect(formatDate(monday, { weekday: 'long' })).toBe('Montag');
    });
  });

  describe('dictionaries', () => {
    const enKeys = Object.keys(en).sort();
    const deKeys = Object.keys(de).sort();

    it('every en key has a de key and vice versa', () => {
      expect(enKeys.filter((k) => !(k in de))).toEqual([]);
      expect(deKeys.filter((k) => !(k in en))).toEqual([]);
    });

    it('en and de use the same placeholders for every key', () => {
      const mismatches = enKeys
        .filter((k) => k in de)
        .filter((k) => placeholders(en[k]).join() !== placeholders(de[k]).join());
      expect(mismatches).toEqual([]);
    });

    it('every .one has a matching .other', () => {
      for (const dict of [en, de]) {
        for (const key of Object.keys(dict).filter((k) => k.endsWith('.one'))) {
          expect(dict[key.replace(/\.one$/, '.other')]).toBeDefined();
        }
      }
    });

    it('has no empty strings', () => {
      for (const dict of [en, de]) {
        expect(Object.entries(dict).filter(([, v]) => v.trim() === '')).toEqual([]);
      }
    });

    it('numbered copy pools are contiguous (pickers rely on 1..N)', () => {
      const pools: Array<[string, number]> = [
        ['celebration.headline', 3],
        ['doorstep.greeting.firstOpen', 2],
        ['doorstep.greeting.longAbsence', 1],
        ['buddy.tapCaption', 4],
        ['wild.cluster', 4],
        ['milestone.title', 8],
      ];
      for (const [prefix, count] of pools) {
        for (let i = 1; i <= count; i++) expect(en[`${prefix}.${i}`]).toBeDefined();
        expect(en[`${prefix}.${count + 1}`]).toBeUndefined();
      }
    });
  });
});

describe('German copy pools', () => {
  afterAll(() => setLocale('en'));

  it('pickers return German text without leftover placeholders', () => {
    setLocale('de');
    expect(tapCaption(2, 'Rex')).toBe('Rex liebt das!');
    expect(pickGreeting('long-absence', 'Rex')).toBe('Rex hat die Stellung gehalten.');
    expect(pickGreeting('first-open', null)).not.toMatch(/[{}]/);
    expect(currentTitleForLevel(2)).toBe('Haustür-Schnüffler');
    expect(ACHIEVEMENTS['first-steps'].name).toBe('Erste Schritte');
  });
});

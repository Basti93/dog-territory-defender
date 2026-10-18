import { setLocale, t } from '../../i18n';
import { cleanCornerName, cornerDisplayName } from '../cornerName';

afterEach(() => setLocale('en'));

describe('cleanCornerName', () => {
  it('trims, cuts at 24 characters and refuses a blank name', () => {
    expect(cleanCornerName('  Kiosk-Ecke ')).toBe('Kiosk-Ecke');
    expect(cleanCornerName('x'.repeat(40))).toBe('x'.repeat(24));
    expect(cleanCornerName('   ')).toBeNull();
    expect(cleanCornerName('')).toBeNull();
  });

  it('counts characters, not UTF-16 units: an emoji is never cut in half; control characters never get stored', () => {
    const name = cleanCornerName('🐕'.repeat(30))!;
    expect(Array.from(name)).toHaveLength(24);
    expect(name).toBe('🐕'.repeat(24));
    expect(cleanCornerName('a\u0000b\n')).toBe('a b');
    expect(cleanCornerName('\u0000\u0007')).toBeNull();
  });
});

describe('cornerDisplayName: a corner is never blank', () => {
  it('prefers the household name, then "Ecke {street}", then the neutral line', () => {
    setLocale('de');
    expect(cornerDisplayName({ name: 'Kiosk-Ecke', street: 'Lindenstraße' })).toBe('Kiosk-Ecke');
    expect(cornerDisplayName({ name: null, street: 'Lindenstraße' })).toBe('Ecke Lindenstraße');
    expect(cornerDisplayName({ name: null, street: null })).toBe('Unsere Ecke');
    expect(cornerDisplayName({ name: null, street: '   ' })).toBe('Unsere Ecke');
  });

  it('follows the language: "{street} corner" and "Our corner"', () => {
    setLocale('en');
    expect(cornerDisplayName({ name: null, street: 'Linden Street' })).toBe('Linden Street corner');
    expect(cornerDisplayName({ name: null, street: null })).toBe(t('corner.name.fallback'));
    expect(t('corner.name.fallback')).toBe('Our corner');
  });

  it('keeps a long street name within the 24 characters of a sign', () => {
    setLocale('de');
    const name = cornerDisplayName({ name: null, street: 'Kurfürstendammallee am Wasser' });
    expect(name.length).toBeLessThanOrEqual(24);
    expect(name.endsWith('…')).toBe(true);
  });
});

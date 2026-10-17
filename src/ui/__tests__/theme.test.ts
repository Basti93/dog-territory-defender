import { buildTextStyle, mix, palette, radii, type, MIN_FONT_SIZE, TypeName } from '../theme';
import { fonts, resolveFont } from '../fontMap';

describe('theme', () => {
  it('keeps every type step at or above 12', () => {
    for (const t of Object.values(type)) expect(t.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
  });
  it('matches the spec scale', () => {
    expect(type.display).toMatchObject({ fontSize: 32, weight: 800 });
    expect(type.h1).toMatchObject({ fontSize: 24, weight: 700 });
    expect(type.small.fontSize).toBe(13);
    expect(radii.card).toBe(24);
  });
  it('mixes colours', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(palette.meadowTint).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('falls back to fontWeight when no family, uses family otherwise', () => {
    (Object.keys(type) as TypeName[]).forEach((n) => {
      expect(buildTextStyle(n, undefined).fontWeight).toBe(String(type[n].weight));
      const s = buildTextStyle(n, 'Nunito-Bold');
      expect(s.fontFamily).toBe('Nunito-Bold');
      expect(s.fontWeight).toBeUndefined();
    });
  });
});

describe('fonts', () => {
  it('maps roles and falls back to undefined when not loaded', () => {
    expect(fonts.display).toBe('Nunito-ExtraBold');
    expect(resolveFont('body', () => true)).toBe('Nunito-SemiBold');
    expect(resolveFont('body', () => false)).toBeUndefined();
  });
});

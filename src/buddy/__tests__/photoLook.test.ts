import { FUR_ZONES, validateAppearance } from '../buddyAppearance';
import { appearanceFromAnalysis, nearestCoat } from '../photoLook';

const answer = (over: Record<string, unknown> = {}) => ({
  isDog: true,
  confidence: 'high',
  zones: Object.fromEntries(FUR_ZONES.map((z) => [z, '#B5651D'])),
  muzzle: 'long',
  furLength: 'fluffy',
  earStyle: 'pointy',
  tailStyle: 'curly',
  size: 'large',
  ...over,
});

describe('appearanceFromAnalysis', () => {
  it('builds a valid look with a fur block and a matching legacy coat', () => {
    const r = appearanceFromAnalysis(answer());
    expect(r?.kind).toBe('ok');
    if (r?.kind !== 'ok') return;
    expect(validateAppearance(r.appearance)).not.toBeNull();
    expect(r.appearance).toMatchObject({ earStyle: 'pointy', size: 'large', markings: 'none', fur: { muzzle: 'long', furLength: 'fluffy' } });
    expect(r.confidence).toBe('high');
  });

  it('softens neon colours', () => {
    const r = appearanceFromAnalysis(answer({ zones: Object.fromEntries(FUR_ZONES.map((z) => [z, '#00FF00'])) }));
    expect(r?.kind === 'ok' && r.appearance.fur?.zones.back).not.toBe('#00FF00');
  });

  it('reports not-a-dog and rejects unusable answers', () => {
    expect(appearanceFromAnalysis(answer({ isDog: false }))).toEqual({ kind: 'no-dog' });
    expect(appearanceFromAnalysis(answer({ isDog: 'yes' }))).toBeNull();
    expect(appearanceFromAnalysis(null)).toBeNull();
    expect(appearanceFromAnalysis(answer({ zones: { head: '#FFFFFF' } }))).toBeNull();
    expect(appearanceFromAnalysis(answer({ muzzle: 'giant' }))).toBeNull();
    expect(appearanceFromAnalysis(answer({ earStyle: 'wings' }))).toBeNull();
  });

  it('falls back to low confidence for an unknown value', () => {
    const r = appearanceFromAnalysis(answer({ confidence: 'super' }));
    expect(r?.kind === 'ok' && r.confidence).toBe('low');
  });
});

describe('nearestCoat', () => {
  it('maps colours to the closest preset', () => {
    expect(nearestCoat('#F8F4EC')).toBe('white');
    expect(nearestCoat('#4B4440')).toBe('charcoal');
    expect(nearestCoat('#C8672E')).toBe('ginger');
  });
});

import {
  BUDDY_COATS,
  CLAY_MAX_LIGHTNESS,
  CLAY_MAX_SATURATION,
  CLAY_MIN_LIGHTNESS,
  FUR_SWATCHES,
  FUR_ZONES,
  furFromLegacy,
  hexToHsl,
  normalizeAppearance,
  softenToClay,
  BUDDY_PALETTE,
  defaultBuddyAppearance,
  markingColourFor,
  noseColourFor,
} from '../buddyAppearance';

describe('buddyAppearance', () => {
  it('default is golden/none/floppy/curly/medium/cream', () => {
    expect(defaultBuddyAppearance()).toEqual({
      coat: 'golden',
      markings: 'none',
      earStyle: 'floppy',
      tailStyle: 'curly',
      size: 'medium',
      accentColour: 'cream',
    });
  });

  it('chocolate gets the brown nose, others dark', () => {
    expect(noseColourFor('chocolate')).toBe(BUDDY_PALETTE.nose.brown);
    for (const c of BUDDY_COATS.filter((x) => x !== 'chocolate')) {
      expect(noseColourFor(c)).toBe(BUDDY_PALETTE.nose.dark);
    }
  });

  it('marking colour differs from the coat', () => {
    for (const c of BUDDY_COATS) {
      expect(markingColourFor(c, 'patch')).not.toBe(BUDDY_PALETTE.coats[c]);
    }
  });
});

describe('softenToClay', () => {
  const hexes = ['#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#000000', '#FFFFFF', '#123456', '#FEDCBA', '#808080', '#00FFFF'];

  it('clamps saturation and lightness into the clay range', () => {
    for (const hex of hexes) {
      const { s, l } = hexToHsl(softenToClay(hex));
      expect(s).toBeLessThanOrEqual(CLAY_MAX_SATURATION + 0.01);
      expect(l).toBeGreaterThanOrEqual(CLAY_MIN_LIGHTNESS - 0.01);
      expect(l).toBeLessThanOrEqual(CLAY_MAX_LIGHTNESS + 0.01);
    }
  });

  it('is deterministic and idempotent, keeps neutrals neutral, and falls back on junk', () => {
    for (const hex of hexes) {
      expect(softenToClay(hex)).toBe(softenToClay(hex));
      expect(softenToClay(softenToClay(hex))).toBe(softenToClay(hex));
    }
    expect(hexToHsl(softenToClay('#FFFFFF')).s).toBe(0);
    expect(softenToClay('banana')).toBe('#E0A94E');
  });

  it('is idempotent over many random colours', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 20000; i++) {
      const hex = `#${Math.floor(rnd() * 0x1000000).toString(16).padStart(6, '0')}`.toUpperCase();
      const once = softenToClay(hex);
      expect(softenToClay(once)).toBe(once);
    }
  });

  it('leaves the curated swatches and the preset coats untouched', () => {
    for (const hex of FUR_SWATCHES) expect(softenToClay(hex)).toBe(hex);
    for (const coat of BUDDY_COATS) expect(softenToClay(BUDDY_PALETTE.coats[coat]).toLowerCase()).toBe(BUDDY_PALETTE.coats[coat].toLowerCase());
  });
});

describe('normalizeAppearance with fur', () => {
  it('old rows (no fur) load unchanged and without a fur block', () => {
    const old = { coat: 'ginger', markings: 'socks', earStyle: 'pointy', tailStyle: 'stubby', size: 'large', accentColour: 'tan' };
    expect(normalizeAppearance(old)).toEqual(old);
    expect('fur' in normalizeAppearance(old)).toBe(false);
    expect(normalizeAppearance(null)).toEqual(defaultBuddyAppearance());
  });

  it('falls back per field and softens zone colours', () => {
    const a = normalizeAppearance({
      coat: 'charcoal',
      fur: { zones: { back: '#00FF00', paws: 'nope', tail: '#FFFFFF' }, muzzle: 'huge', furLength: 'fluffy' },
    });
    expect(a.fur?.muzzle).toBe('medium');
    expect(a.fur?.furLength).toBe('fluffy');
    expect(a.fur?.zones.back).toBe(softenToClay('#00FF00'));
    expect(a.fur?.zones.paws).toBe(furFromLegacy({ coat: 'charcoal', markings: 'none' }).zones.paws);
    expect(a.fur?.zones.tail).toBe(softenToClay('#FFFFFF'));
    for (const z of FUR_ZONES) expect(a.fur?.zones[z]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('a legacy-seeded fur block round-trips', () => {
    const fur = furFromLegacy({ coat: 'tricolour', markings: 'patch' });
    expect(normalizeAppearance({ ...defaultBuddyAppearance(), coat: 'tricolour', markings: 'patch', fur }).fur).toEqual(fur);
  });
});

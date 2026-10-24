// Buddy appearance model: option lists, palette, defaults, safe parsing.
// Lives in src/buddy (not components/) so storage can import it without
// pulling in React. Palette hexes come from the buddy-comes-alive
// visual-design delta ("Buddy Coat Palette") — do not add colours here
// without updating docs/specs/visual-design.md.

export const BUDDY_COATS = ['cream', 'golden', 'ginger', 'chocolate', 'charcoal', 'grey', 'white', 'tricolour'] as const;
export const BUDDY_MARKINGS = ['none', 'patch', 'socks', 'mask'] as const;
export const BUDDY_EAR_STYLES = ['floppy', 'pointy', 'folded'] as const;
export const BUDDY_TAIL_STYLES = ['curly', 'straight', 'stubby'] as const;
export const BUDDY_SIZES = ['small', 'medium', 'large'] as const;
export const BUDDY_ACCENTS = ['cream', 'white', 'tan'] as const;

// Free fur colours (owner decision 2026-10-24, reopens the old "no free colour picker" rejection).
export const FUR_ZONES = ['head', 'muzzle', 'eyepatch', 'ears', 'back', 'belly', 'chest', 'legs', 'paws', 'tail'] as const;
export const BUDDY_MUZZLES = ['short', 'medium', 'long'] as const;
export const BUDDY_FUR_LENGTHS = ['short', 'medium', 'fluffy'] as const;

export type FurZone = (typeof FUR_ZONES)[number];
export type BuddyMuzzle = (typeof BUDDY_MUZZLES)[number];
export type BuddyFurLength = (typeof BUDDY_FUR_LENGTHS)[number];

/** Optional zone-colour look. Absent = the legacy coat/markings look, unchanged. Zone hexes are always clay-softened. */
export interface BuddyFur {
  zones: Record<FurZone, string>;
  muzzle: BuddyMuzzle;
  furLength: BuddyFurLength;
}

export type BuddyCoat = (typeof BUDDY_COATS)[number];
export type BuddyMarkings = (typeof BUDDY_MARKINGS)[number];
export type BuddyEarStyle = (typeof BUDDY_EAR_STYLES)[number];
export type BuddyTailStyle = (typeof BUDDY_TAIL_STYLES)[number];
export type BuddySize = (typeof BUDDY_SIZES)[number];
export type BuddyAccent = (typeof BUDDY_ACCENTS)[number];

export interface BuddyAppearance {
  coat: BuddyCoat;
  markings: BuddyMarkings;
  earStyle: BuddyEarStyle;
  tailStyle: BuddyTailStyle;
  size: BuddySize;
  accentColour: BuddyAccent;
  fur?: BuddyFur;
}

export const BUDDY_PALETTE = {
  coats: {
    cream: '#F3E3C3',
    golden: '#E0A94E',
    ginger: '#C8672E',
    chocolate: '#6B4429',
    charcoal: '#4A423E',
    grey: '#A9A8A2',
    white: '#F7F2EA',
    tricolour: '#F7F2EA', // base; ginger + charcoal patches are drawn on top
  } as Record<BuddyCoat, string>,
  accents: {
    cream: '#FBEFD5',
    white: '#FFFDF7',
    tan: '#E8C99A',
  } as Record<BuddyAccent, string>,
  nose: {
    dark: '#2B2523',
    brown: '#5A3A28',
    pink: '#E59A9A', // also tongue and cheek blush
  },
  // Tricolour patches reuse the ginger and charcoal coat values.
  tricolourPatches: { ginger: '#C8672E', charcoal: '#4A423E' },
} as const;

export function defaultBuddyAppearance(): BuddyAppearance {
  return {
    coat: 'golden',
    markings: 'none',
    earStyle: 'floppy',
    tailStyle: 'curly',
    size: 'medium',
    accentColour: 'cream',
  };
}

// ---------- clay softening (avatar-only free colours) ----------

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_HEX = '#E0A94E';
/** Clay pastel limits: no neon (saturation), no pitch black or glaring white (lightness). Neutrals stay neutral. */
export const CLAY_MAX_SATURATION = 0.7;
export const CLAY_MIN_LIGHTNESS = 0.22;
export const CLAY_MAX_LIGHTNESS = 0.95;
const CLAY_EPSILON = 0.01;

/** Curated picker swatches (all already clay-soft; see test). Free tone/lightness rows go through softenToClay. */
export const FUR_SWATCHES = [
  '#F7F2EA', '#F3E3C3', '#E8D2A8', '#E0A94E', '#D8B07A', '#C8672E', '#9A6B43',
  '#6B4429', '#4A423E', '#A9A8A2', '#C9C4BC', '#E8B4A8', '#B7C9A8', '#A8C4D8',
] as const;

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`.toUpperCase();
}

/** Pure: pull any colour into the clay pastel range. Idempotent. Invalid input gives the golden coat. */
export function softenToClay(hex: string): string {
  if (!isHex(hex)) return FALLBACK_HEX;
  const { h, s, l } = hexToHsl(hex);
  const s2 = Math.min(s, CLAY_MAX_SATURATION);
  const l2 = Math.min(CLAY_MAX_LIGHTNESS, Math.max(CLAY_MIN_LIGHTNESS, l));
  // Epsilon: a colour already within the limits (up to hex rounding) is returned as is, which makes this idempotent.
  if (s <= CLAY_MAX_SATURATION + CLAY_EPSILON && l >= CLAY_MIN_LIGHTNESS - CLAY_EPSILON && l <= CLAY_MAX_LIGHTNESS + CLAY_EPSILON) {
    return hex.toUpperCase();
  }
  return hslToHex(h, s2, l2);
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = (pa >> shift) & 255;
    const y = (pb >> shift) & 255;
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`.toUpperCase();
}

/** Zone colours that approximate a legacy coat + markings look (seed for the picker, vector fallback, back poses). */
export function furZonesFromLegacy(a: Pick<BuddyAppearance, 'coat' | 'markings'>): Record<FurZone, string> {
  const coat = BUDDY_PALETTE.coats[a.coat];
  const tri = a.coat === 'tricolour';
  const accent = tri || a.coat === 'white' ? BUDDY_PALETTE.accents.white : mixHex(coat, BUDDY_PALETTE.accents.cream, 0.65);
  const mark = markingColourFor(a.coat, a.markings === 'none' ? 'patch' : a.markings);
  const zones: Record<FurZone, string> = {
    head: tri ? BUDDY_PALETTE.accents.white : coat,
    muzzle: accent,
    eyepatch: tri ? BUDDY_PALETTE.tricolourPatches.ginger : coat,
    ears: tri ? BUDDY_PALETTE.tricolourPatches.charcoal : mixHex(coat, '#5A3A28', 0.16),
    back: tri ? BUDDY_PALETTE.tricolourPatches.charcoal : coat,
    belly: coat,
    chest: accent,
    legs: tri ? BUDDY_PALETTE.tricolourPatches.ginger : coat,
    paws: coat,
    tail: tri ? BUDDY_PALETTE.tricolourPatches.charcoal : coat,
  };
  if (a.markings === 'patch') zones.eyepatch = mark;
  if (a.markings === 'socks') zones.paws = markingColourFor(a.coat, 'socks');
  if (a.markings === 'mask') {
    zones.eyepatch = mark;
    zones.muzzle = mark;
  }
  for (const z of FUR_ZONES) zones[z] = softenToClay(zones[z]);
  return zones;
}

/** A fur block that looks like the legacy look (used when a player starts editing zones or shapes). */
export function furFromLegacy(a: Pick<BuddyAppearance, 'coat' | 'markings'>): BuddyFur {
  return { zones: furZonesFromLegacy(a), muzzle: 'medium', furLength: 'short' };
}

function normalizeFur(input: unknown, legacy: Pick<BuddyAppearance, 'coat' | 'markings'>): BuddyFur | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const o = input as Record<string, unknown>;
  const fallback = furZonesFromLegacy(legacy);
  const given = (typeof o.zones === 'object' && o.zones !== null ? o.zones : {}) as Record<string, unknown>;
  const zones = {} as Record<FurZone, string>;
  for (const z of FUR_ZONES) zones[z] = isHex(given[z]) ? softenToClay(given[z]) : fallback[z];
  return {
    zones,
    muzzle: pick(BUDDY_MUZZLES, o.muzzle, 'medium'),
    furLength: pick(BUDDY_FUR_LENGTHS, o.furLength, 'short'),
  };
}

function pick<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Per-field fallback: an unknown/missing field gets its default, others are kept. */
export function normalizeAppearance(input: unknown): BuddyAppearance {
  const d = defaultBuddyAppearance();
  const o = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const base: BuddyAppearance = {
    coat: pick(BUDDY_COATS, o.coat, d.coat),
    markings: pick(BUDDY_MARKINGS, o.markings, d.markings),
    earStyle: pick(BUDDY_EAR_STYLES, o.earStyle, d.earStyle),
    tailStyle: pick(BUDDY_TAIL_STYLES, o.tailStyle, d.tailStyle),
    size: pick(BUDDY_SIZES, o.size, d.size),
    accentColour: pick(BUDDY_ACCENTS, o.accentColour, d.accentColour),
  };
  // Old rows have no `fur`: they keep the legacy art path and look exactly as before.
  const fur = normalizeFur(o.fur, base);
  return fur ? { ...base, fur } : base;
}

/** Largest accepted look as JSON (a full fur block is ~500 bytes). */
export const MAX_APPEARANCE_JSON_BYTES = 2048;

/**
 * Strict twin of `normalizeAppearance` for untrusted input (the server): every base field must be a known option and a
 * `fur` block, when present, must carry a hex for all zones and known shapes. Returns the normalised (clay-softened)
 * look, or null when anything is off. Pure: the server compiles this file by path, so no React/i18n imports here.
 */
export function validateAppearance(input: unknown): BuddyAppearance | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const inList = (options: readonly string[], v: unknown) => typeof v === 'string' && options.includes(v);
  if (
    !inList(BUDDY_COATS, o.coat) ||
    !inList(BUDDY_MARKINGS, o.markings) ||
    !inList(BUDDY_EAR_STYLES, o.earStyle) ||
    !inList(BUDDY_TAIL_STYLES, o.tailStyle) ||
    !inList(BUDDY_SIZES, o.size) ||
    !inList(BUDDY_ACCENTS, o.accentColour)
  ) {
    return null;
  }
  if (o.fur !== undefined) {
    const fur = o.fur as Record<string, unknown> | null;
    if (typeof fur !== 'object' || fur === null) return null;
    const zones = fur.zones as Record<string, unknown> | null;
    if (typeof zones !== 'object' || zones === null) return null;
    if (!FUR_ZONES.every((z) => isHex(zones[z]))) return null;
    if (!inList(BUDDY_MUZZLES, fur.muzzle) || !inList(BUDDY_FUR_LENGTHS, fur.furLength)) return null;
  }
  const json = JSON.stringify(input);
  if (json === undefined || json.length > MAX_APPEARANCE_JSON_BYTES) return null;
  return normalizeAppearance(input);
}

/** Chocolate gets the brown nose, everyone else the dark one. */
export function noseColourFor(coat: BuddyCoat): string {
  return coat === 'chocolate' ? BUDDY_PALETTE.nose.brown : BUDDY_PALETTE.nose.dark;
}

/** Colour for patch/mask/socks, chosen from the palette so it contrasts with the coat. */
export function markingColourFor(coat: BuddyCoat, markings: BuddyMarkings): string {
  if (markings === 'socks') {
    return coat === 'white' || coat === 'cream' || coat === 'tricolour'
      ? BUDDY_PALETTE.accents.tan
      : BUDDY_PALETTE.accents.white;
  }
  if (coat === 'chocolate' || coat === 'charcoal') return BUDDY_PALETTE.coats.cream;
  if (coat === 'tricolour') return BUDDY_PALETTE.coats.ginger;
  return BUDDY_PALETTE.coats.chocolate;
}

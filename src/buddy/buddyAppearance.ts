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

function pick<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Per-field fallback: an unknown/missing field gets its default, others are kept. */
export function normalizeAppearance(input: unknown): BuddyAppearance {
  const d = defaultBuddyAppearance();
  const o = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  return {
    coat: pick(BUDDY_COATS, o.coat, d.coat),
    markings: pick(BUDDY_MARKINGS, o.markings, d.markings),
    earStyle: pick(BUDDY_EAR_STYLES, o.earStyle, d.earStyle),
    tailStyle: pick(BUDDY_TAIL_STYLES, o.tailStyle, d.tailStyle),
    size: pick(BUDDY_SIZES, o.size, d.size),
    accentColour: pick(BUDDY_ACCENTS, o.accentColour, d.accentColour),
  };
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

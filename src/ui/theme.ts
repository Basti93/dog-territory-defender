import { Platform, TextStyle, ViewStyle } from 'react-native';
import { tokens } from './tokens';
import { FontRole } from './fontMap';
import { font } from './fonts';

/** Linear mix of two #RRGGBB colours. t=0 -> a, t=1 -> b. Used so tints stay derived from tokens. */
export function mix(a: string, b: string, t: number): string {
  const p = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(p(a, i) * (1 - t) + p(b, i) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`.toUpperCase();
}

// Card white is pure white BY DECISION (clay cards lift off the cream background);
// it is the one deliberate non-token colour, every tint below derives from it.
const CARD_WHITE = '#FFFFFF';

export const palette = {
  background: tokens.white, // cream #FAFAF8
  card: CARD_WHITE,
  text: tokens.text,
  // Darkened from tokens.muted (#8A9A8A) so 13pt muted text passes ~4.5:1 on cream (~#5F6F5F).
  muted: mix(tokens.text, tokens.muted, 0.62),
  // Darker green for green TEXT on cream/white (ghost buttons, selected labels). The
  // primary Button keeps cream-on-tokens.green (brand), so tokens.green stays for fills.
  greenText: mix(tokens.green, tokens.text, 0.3),
  primary: tokens.green,
  border: mix(tokens.meadow, tokens.white, 0.4),
  meadowTint: mix(CARD_WHITE, tokens.meadow, 0.45),
  skyTint: mix(CARD_WHITE, tokens.blue, 0.14),
  warmTint: mix(CARD_WHITE, tokens.warm, 0.14),
  shadow: mix(tokens.brown, tokens.text, 0.3), // warm, never pure black
} as const;

export const radii = { card: 24, pill: 999, chip: 14, button: 28, tile: 20 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export type TypeName = 'display' | 'h1' | 'h2' | 'body' | 'small' | 'min';

export const MIN_FONT_SIZE = 12;

export const type: Record<TypeName, { fontSize: number; lineHeight: number; weight: 400 | 600 | 700 | 800; role: FontRole }> = {
  display: { fontSize: 32, lineHeight: 38, weight: 800, role: 'display' },
  h1: { fontSize: 24, lineHeight: 30, weight: 700, role: 'heading' },
  h2: { fontSize: 18, lineHeight: 24, weight: 700, role: 'heading' },
  body: { fontSize: 16, lineHeight: 22, weight: 600, role: 'body' },
  small: { fontSize: 13, lineHeight: 18, weight: 600, role: 'body' },
  min: { fontSize: 12, lineHeight: 16, weight: 600, role: 'body' },
};

/** Pure: style for a type step given a resolved family (undefined -> system font + fontWeight). */
export function buildTextStyle(name: TypeName, family: string | undefined): TextStyle {
  const t = type[name];
  const base: TextStyle = { fontSize: t.fontSize, lineHeight: t.lineHeight, color: palette.text };
  return family
    ? { ...base, fontFamily: family }
    : { ...base, fontWeight: String(t.weight) as TextStyle['fontWeight'] };
}

/** Text style for a type step. Spread into a Text style: `[textStyle('h1'), { color }]`. */
export function textStyle(name: TypeName): TextStyle {
  return buildTextStyle(name, font(type[name].role));
}

const shadow = (offsetY: number, opacity: number, radius: number, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({
    android: { elevation, shadowColor: palette.shadow },
    default: {
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
  }) as ViewStyle;

export const shadows = {
  soft: shadow(2, 0.1, 6, 2),
  card: shadow(4, 0.14, 12, 4),
  floating: shadow(8, 0.2, 18, 8),
};

export { tokens };

export const theme = { tokens, palette, radii, spacing, type, shadows };

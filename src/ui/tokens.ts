// Spec design tokens (docs/specs/visual-design.md). No module held these
// before; screens still keep local COLORS copies. New code imports from here.
// Do not add colours without updating the spec.
export const tokens = {
  green: '#2ECC71',
  blue: '#3498DB',
  warm: '#F39C12',
  brown: '#8B6F47',
  meadow: '#DCE8BE',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
} as const;

export type TokenName = keyof typeof tokens;

/** Confetti palette: spec colours only, spring-like. */
export const CONFETTI_COLORS: readonly string[] = [
  tokens.green,
  tokens.blue,
  tokens.warm,
  tokens.brown,
  tokens.meadow,
];

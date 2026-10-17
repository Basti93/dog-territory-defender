// Pure font-name mapping (no expo-font import so it is trivially testable).
export const fonts = {
  display: 'Nunito-ExtraBold',
  heading: 'Nunito-Bold',
  body: 'Nunito-SemiBold',
  text: 'Nunito-Regular',
} as const;

export type FontRole = keyof typeof fonts;

/** Returns the family when `isLoaded(family)` is true, otherwise undefined (system font). */
export function resolveFont(role: FontRole, isLoaded: (family: string) => boolean): string | undefined {
  const family = fonts[role];
  return isLoaded(family) ? family : undefined;
}

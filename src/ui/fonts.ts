import { useFonts } from 'expo-font';
import { isLoaded } from 'expo-font';
import { resolveFont, FontRole } from './fontMap';

export { fonts, resolveFont } from './fontMap';
export type { FontRole } from './fontMap';

/**
 * Loads the four Nunito files. Call once in App.tsx and either gate render on
 * `loaded` (recommended, avoids a font flash) or ignore it: until loaded,
 * `font()` returns undefined and text renders in the system font.
 */
export function useAppFonts(): { loaded: boolean; error: Error | null } {
  const [loaded, error] = useFonts({
    'Nunito-Regular': require('../../assets/fonts/Nunito-Regular.ttf'),
    'Nunito-SemiBold': require('../../assets/fonts/Nunito-SemiBold.ttf'),
    'Nunito-Bold': require('../../assets/fonts/Nunito-Bold.ttf'),
    'Nunito-ExtraBold': require('../../assets/fonts/Nunito-ExtraBold.ttf'),
  });
  // On error we still report loaded so the app is never stuck on a splash.
  return { loaded: loaded || error !== null, error };
}

/** Family name if that font is loaded right now, else undefined (system font). */
export function font(role: FontRole): string | undefined {
  try {
    return resolveFont(role, isLoaded);
  } catch {
    return undefined;
  }
}

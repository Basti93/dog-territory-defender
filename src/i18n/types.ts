export type Locale = 'en' | 'de';
export type LocalePreference = 'system' | Locale;

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'de'];
export const DEFAULT_LOCALE: Locale = 'en';

import { useSyncExternalStore } from 'react';

import de from './de';
import en from './en';
import { DEFAULT_LOCALE, Locale, LocalePreference } from './types';

export type { Locale, LocalePreference } from './types';

export type TranslationVars = Record<string, string | number>;

const dictionaries: Record<Locale, Record<string, string>> = { en, de };

let currentLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();
const warnedKeys = new Set<string>();

// ---------------------------------------------------------------- locale state

/** 'de', 'de-DE', 'de_AT' -> 'de'; anything unsupported -> 'en'. */
export function resolveLocale(pref: LocalePreference, deviceLocale: string): Locale {
  if (pref === 'en' || pref === 'de') return pref;
  const language = (deviceLocale ?? '').toLowerCase().split(/[-_]/)[0];
  return language === 'de' ? 'de' : 'en';
}

/** Device language via Hermes' Intl; never throws. */
export function getDeviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the calling component when the language switches. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

// ------------------------------------------------------------------ translate

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

function lookup(key: string): string {
  const value = dictionaries[currentLocale][key] ?? dictionaries.en[key];
  if (value !== undefined) return value;
  if (__DEV__ && !warnedKeys.has(key)) {
    warnedKeys.add(key);
    console.warn(`[i18n] missing translation key: ${key}`);
  }
  return key;
}

export function t(key: string, vars?: TranslationVars): string {
  return interpolate(lookup(key), vars);
}

/** Picks `{key}.one` when count === 1, else `{key}.other`; `{count}` is always available. */
export function tPlural(key: string, count: number, vars?: TranslationVars): string {
  const suffix = count === 1 ? 'one' : 'other';
  return t(`${key}.${suffix}`, { count: formatNumber(count), ...vars });
}

// ------------------------------------------------------------------ formatting

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(currentLocale, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatDistanceKm(km: number, fractionDigits = 2): string {
  return `${formatNumber(km, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })} km`;
}

export function formatDate(when: number | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof when === 'number' ? new Date(when) : when;
  try {
    return new Intl.DateTimeFormat(currentLocale, options ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  } catch {
    return date.toDateString();
  }
}

export function formatTime(when: number | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof when === 'number' ? new Date(when) : when;
  try {
    return new Intl.DateTimeFormat(currentLocale, options ?? { hour: 'numeric', minute: '2-digit' }).format(date);
  } catch {
    return date.toTimeString();
  }
}

import de from '../i18n/de';
import en from '../i18n/en';
import { t } from '../i18n';

// Territory names are generated once and stored in whatever language the device had at that moment (resolveTerritoryName),
// or by the server ("A new corner", server/src/services/walks.ts). So a German phone can hold "Newt's New Range".
// This shows such generated defaults in the current language, at display time; a name the player typed is never touched.

const dictionaries = [en, de] as Record<string, string>[];

interface Matcher {
  key: string;
  re: RegExp;
  vars: string[];
}

function matcherFor(template: string, key: string): Matcher {
  const vars: string[] = [];
  const source = template
    .split(/(\{\w+\})/)
    .map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m) {
        vars.push(m[1]);
        return '(.+?)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return { key, re: new RegExp(`^${source}$`), vars };
}

// The fallback is tested before the place form: "Newt's New Range" would also read as place "New".
const MATCHERS: Matcher[] = ['territory.name.fallback', 'territory.name.withPlace'].flatMap((key) => dictionaries.map((d) => matcherFor(d[key], key)));
const SERVER_DEFAULTS = dictionaries.map((d) => d['territory.name.serverDefault']);

/** The territory name to show: generated defaults (any language, server default included) re-rendered in the current language. */
export function displayTerritoryName(stored: string): string {
  if (SERVER_DEFAULTS.includes(stored)) return t('territory.name.serverDefault');
  for (const { key, re, vars } of MATCHERS) {
    const m = re.exec(stored);
    if (!m) continue;
    const values: Record<string, string> = {};
    vars.forEach((name, i) => {
      values[name] = m[i + 1];
    });
    return t(key, values);
  }
  return stored;
}

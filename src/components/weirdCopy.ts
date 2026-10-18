// The sweet weird streak's copy (keys `weird.*`): warm first, weird second, and rare. Every picker is seeded
// (same seed, same answer across re-renders) and returns a weird line for only 1 seed in WEIRD_ONE_IN.
import { t } from '../i18n';

export const WEIRD_ONE_IN = 4;

export function seedHash(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

/** One of `keys` for 1 in WEIRD_ONE_IN seeds, else null. */
export function pickWeirdKey(hash: number, keys: readonly string[]): string | null {
  if (keys.length === 0 || hash % WEIRD_ONE_IN !== 0) return null;
  return keys[Math.floor(hash / WEIRD_ONE_IN) % keys.length];
}

export const WEIRD_HEADLINE_KEYS = ['weird.headline.floating', 'weird.headline.moon'] as const;
export const WEIRD_LEVEL_UP_KEYS = ['weird.levelUp.comet'] as const;

/** Rare extra sentence under the level-up beat, or null. */
export function weirdLevelUpLine(walkId: string | null | undefined): string | null {
  const key = pickWeirdKey(seedHash(`levelup:${walkId ?? ''}`), WEIRD_LEVEL_UP_KEYS);
  return key ? t(key) : null;
}

const UPGRADE_KEY = {
  doghouse: 'weird.upgrade.doghouse',
  bakery: 'weird.upgrade.bakery',
  sniffGarden: 'weird.upgrade.garden',
} as const;

/** Rare note after a Den upgrade of a late-stage building (the caller gates on the level), or null. */
export function weirdUpgradeLine(building: keyof typeof UPGRADE_KEY, newLevel: number): string | null {
  const key = pickWeirdKey(seedHash(`upgrade:${building}:${newLevel}`), [UPGRADE_KEY[building]]);
  return key ? t(key) : null;
}

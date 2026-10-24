// Turns the vision model's JSON answer about a dog photo into a Buddy look. Pure (no React, no i18n): the server
// compiles this file by path, and the app tests it directly. Nothing here trusts the model: colours are
// clay-softened, every option is checked by validateAppearance, anything odd gives null.
import {
  BUDDY_COATS,
  BUDDY_EAR_STYLES,
  BUDDY_FUR_LENGTHS,
  BUDDY_MUZZLES,
  BUDDY_PALETTE,
  BUDDY_SIZES,
  BUDDY_TAIL_STYLES,
  FUR_ZONES,
  isHex,
  softenToClay,
  validateAppearance,
  type BuddyAppearance,
  type BuddyCoat,
} from './buddyAppearance';

export const PHOTO_CONFIDENCES = ['low', 'medium', 'high'] as const;
export type PhotoConfidence = (typeof PHOTO_CONFIDENCES)[number];

export type PhotoLookResult =
  | { kind: 'ok'; appearance: BuddyAppearance; confidence: PhotoConfidence }
  | { kind: 'no-dog' };

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The legacy preset coat closest to a colour: keeps the legacy fields (bots, old apps, vector fallback) sensible. */
export function nearestCoat(hex: string): BuddyCoat {
  const [r, g, b] = rgb(hex);
  let best: BuddyCoat = 'golden';
  let bestDistance = Infinity;
  for (const coat of BUDDY_COATS) {
    if (coat === 'tricolour') continue; // a tricolour is two-toned; the zones carry that, the preset stays plain
    const [cr, cg, cb] = rgb(BUDDY_PALETTE.coats[coat]);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = coat;
    }
  }
  return best;
}

/** `raw` is the parsed model JSON. null = unusable answer; `no-dog` = the model says the photos show no dog. */
export function appearanceFromAnalysis(raw: unknown): PhotoLookResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.isDog !== true) return o.isDog === false ? { kind: 'no-dog' } : null;
  const confidence = (PHOTO_CONFIDENCES as readonly unknown[]).includes(o.confidence) ? (o.confidence as PhotoConfidence) : 'low';
  const given = o.zones;
  if (typeof given !== 'object' || given === null) return null;
  const zones: Record<string, string> = {};
  for (const z of FUR_ZONES) {
    const hex = (given as Record<string, unknown>)[z];
    if (!isHex(hex)) return null;
    zones[z] = softenToClay(hex);
  }
  const candidate = {
    coat: nearestCoat(zones.back),
    markings: 'none',
    earStyle: o.earStyle,
    tailStyle: o.tailStyle,
    size: o.size,
    accentColour: 'cream',
    fur: { zones, muzzle: o.muzzle, furLength: o.furLength },
  };
  const appearance = validateAppearance(candidate);
  return appearance ? { kind: 'ok', appearance, confidence } : null;
}

/** The option lists the model must pick from (used for its response schema and the prompt). */
export const PHOTO_LOOK_OPTIONS = {
  muzzle: BUDDY_MUZZLES,
  furLength: BUDDY_FUR_LENGTHS,
  earStyle: BUDDY_EAR_STYLES,
  tailStyle: BUDDY_TAIL_STYLES,
  size: BUDDY_SIZES,
} as const;

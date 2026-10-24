// Default Buddy skin: pre-rendered PNG layers (assets/buddy). Wraps
// createImageSkin and adds the size scale. Markings are separate overlay layers;
// the accent colour is baked into the art and NOT rendered by this skin.
import { BuddyAppearance, BuddySize, FUR_ZONES } from './buddyAppearance';
import { BuddySkin, createImageSkin, PivotPoint } from './buddySkin';
import { BUDDY_IMAGE_GROUND_Y, BUDDY_IMAGE_PIVOTS, buddyCommonSources, buddyImageSources } from './imageSkinSources';
import { zoneParts } from './zoneSkin';

// Only a medium model exists; small/large are a uniform scale about the feet.
const SIZE_SCALE: Record<BuddySize, number> = { small: 0.88, medium: 1, large: 1.12 };

/**
 * The image canvas is square but the dog's feet sit at BUDDY_IMAGE_GROUND_Y of it,
 * so the bottom (1 - groundY) * size px of the box is empty. Screens subtract this
 * from `bottom` so the FEET (not the box) land on the scene's ground line.
 */
export function buddyFeetInset(size: number): number {
  return size * (1 - BUDDY_IMAGE_GROUND_Y);
}

// Small LRU: free colours make the key space unbounded. A skin in use keeps its own reference, so eviction is safe.
const CACHE_LIMIT = 24;
const cache = new Map<string, BuddySkin>();

/** Scale a canvas point about (0.5, groundY) so it follows the scaled artwork. */
function scalePoint(p: PivotPoint, s: number): PivotPoint {
  return { x: 0.5 + (p.x - 0.5) * s, y: BUDDY_IMAGE_GROUND_Y + (p.y - BUDDY_IMAGE_GROUND_Y) * s };
}

function build(appearance: BuddyAppearance): BuddySkin {
  const s = SIZE_SCALE[appearance.size] ?? 1;
  const opts = { scale: s, scaleOriginY: BUDDY_IMAGE_GROUND_Y };
  const fur = appearance.fur;
  const base = fur
    ? createImageSkin(buddyCommonSources(fur.muzzle), BUDDY_IMAGE_PIVOTS, opts)
    : createImageSkin(buddyImageSources(appearance), BUDDY_IMAGE_PIVOTS, opts);
  if (fur) Object.assign(base.parts, zoneParts(appearance, fur, opts));
  return {
    ...base,
    groundY: BUDDY_IMAGE_GROUND_Y,
    pivots: () => ({
      head: scalePoint(BUDDY_IMAGE_PIVOTS.head, s),
      tail: scalePoint(BUDDY_IMAGE_PIVOTS.tail, s),
      earLeft: scalePoint(BUDDY_IMAGE_PIVOTS.earLeft, s),
      earRight: scalePoint(BUDDY_IMAGE_PIVOTS.earRight, s),
    }),
  };
}

/** Memoised per look, so the rig's skin identity is stable across renders. */
export function imageSkinFor(appearance: BuddyAppearance): BuddySkin {
  const f = appearance.fur;
  const furKey = f ? `|fur:${FUR_ZONES.map((z) => f.zones[z]).join('')}|${f.muzzle}|${f.furLength}` : '';
  const key = `${appearance.coat}|${appearance.earStyle}|${appearance.tailStyle}|${appearance.size}|${appearance.markings}${furKey}`;
  let skin = cache.get(key);
  if (skin) {
    cache.delete(key); // re-insert: most recently used goes last
  } else {
    skin = build(appearance);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, skin);
  return skin;
}

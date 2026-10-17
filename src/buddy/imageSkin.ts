// Default Buddy skin: pre-rendered PNG layers (assets/buddy). Wraps
// createImageSkin and adds the size scale. Markings and accent colour are baked
// into / absent from the art, so they are NOT rendered by this skin.
import { BuddyAppearance, BuddySize } from './buddyAppearance';
import { BuddySkin, createImageSkin, PivotPoint } from './buddySkin';
import { BUDDY_IMAGE_GROUND_Y, BUDDY_IMAGE_PIVOTS, buddyImageSources } from './imageSkinSources';

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

const cache = new Map<string, BuddySkin>();

/** Scale a canvas point about (0.5, groundY) so it follows the scaled artwork. */
function scalePoint(p: PivotPoint, s: number): PivotPoint {
  return { x: 0.5 + (p.x - 0.5) * s, y: BUDDY_IMAGE_GROUND_Y + (p.y - BUDDY_IMAGE_GROUND_Y) * s };
}

function build(appearance: BuddyAppearance): BuddySkin {
  const s = SIZE_SCALE[appearance.size] ?? 1;
  const base = createImageSkin(buddyImageSources(appearance), BUDDY_IMAGE_PIVOTS, {
    scale: s,
    scaleOriginY: BUDDY_IMAGE_GROUND_Y,
  });
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
  const key = `${appearance.coat}|${appearance.earStyle}|${appearance.tailStyle}|${appearance.size}`;
  let skin = cache.get(key);
  if (!skin) {
    skin = build(appearance);
    cache.set(key, skin);
  }
  return skin;
}

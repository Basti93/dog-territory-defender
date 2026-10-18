import { buddyFeetInset } from '../../buddy/imageSkin';
import { BuildingLevel } from '../../art/artAssets';
import { HitBox, LayoutBox, STAGE_SIZE, YARD_ORDER, YardBuildingKey, YardLayout, artTierForLevel, groundBox } from '../den/YardScene';

// Pure geometry of the world scene (redesign step 1: one scene, three heights).
// Content, top to bottom: SKY, VIERTEL (embedded map portrait), then one viewport-high "tail" =
// fence zone + yard (Hof). The scroll starts at the tail, so what the player sees first is the
// gate sign at the top and the yard below it, with no scrolling needed to start a walk
// (konzept section 5). Everything is in pt; `top*` values are measured from the content top.

export const HINT_H = 28;
/** Gap between the hint strip and the gate sign. */
const HINT_GAP = 8;
/** Height of the wide gate sign incl. rim. */
export const GATE_SIGN_H = 66;
/** The gate canvas is square; the gate itself fills only the lower part of it. */
export const GATE_BOX = 190;
/** The gate's top (post caps) sits this share of the gate canvas below the canvas top. */
const GATE_VISIBLE_TOP_FRAC = 0.39;
/** The gate sign overlaps the post caps by this much so it looks mounted on them. */
const GATE_SIGN_OVERLAP = 14;
/** Fence tile (512x256 sprite) width; height is half. */
export const FENCE_SEG_W = 200;
export const FENCE_SEG_H = FENCE_SEG_W / 2;
/** Sprites rest a few px below the nominal fence line (transparent margin under the pickets). */
export const FENCE_FOOT_PAD = 6;

export const SKY_H = 260;
export const VIERTEL_H = 440;
/** Bench, bowl and mailbox live in this strip under the buildings' yard. */
export const BOTTOM_ROW_H = 190;
export const MIN_YARD_H = 300;

export const BUDDY_SIZE = 130;
/** Gap between the fence line and the top of Buddy's box. */
const BUDDY_TOP_GAP = 4;

export interface SceneLayout {
  viewportH: number;
  width: number;
  insetsTop: number;
  contentH: number;
  /** ScrollView offset the scene opens at (the tail: gate + yard). */
  startOffset: number;
  skyH: number;
  viertelH: number;
  /** Content y where the tail (fence zone + yard) begins. */
  tailTop: number;
  /** Tail-relative y values (0 = tail top = viewport top at the start offset). */
  hintTop: number;
  gateSignTop: number;
  gateBoxTop: number;
  fenceBottom: number;
  /** Yard (Hof) region: buildings + Buddy, then the bottom row. Tail-relative. */
  hofTop: number;
  hofH: number;
  yardH: number;
  bottomRowTop: number;
  /** Where the gate sign sits in the viewport at the start offset (== gateSignTop). Must be >= insetsTop + hint. */
  gateSignTopInViewport: number;
  gateBottomInViewport: number;
}

/** Pure: all vertical positions of the scene for a window. */
export function sceneLayout(windowHeight: number, width: number, insetsTop: number): SceneLayout {
  const hintTop = insetsTop + 4;
  const gateSignTop = hintTop + HINT_H + HINT_GAP;
  const gateVisibleTop = gateSignTop + GATE_SIGN_H - GATE_SIGN_OVERLAP;
  const gateBoxTop = gateVisibleTop - GATE_BOX * GATE_VISIBLE_TOP_FRAC;
  const fenceBottom = gateBoxTop + GATE_BOX - FENCE_FOOT_PAD;
  const hofH = Math.max(windowHeight - fenceBottom, MIN_YARD_H + BOTTOM_ROW_H);
  const yardH = hofH - BOTTOM_ROW_H;
  const tailH = fenceBottom + hofH; // >= windowHeight; equal on every real phone
  const tailTop = SKY_H + VIERTEL_H;
  return {
    viewportH: windowHeight,
    width,
    insetsTop,
    contentH: tailTop + tailH,
    startOffset: tailTop + tailH - windowHeight,
    skyH: SKY_H,
    viertelH: VIERTEL_H,
    tailTop,
    hintTop,
    gateSignTop,
    gateBoxTop,
    fenceBottom,
    hofTop: fenceBottom,
    hofH,
    yardH,
    bottomRowTop: yardH,
    gateSignTopInViewport: gateSignTop,
    gateBottomInViewport: gateBoxTop + GATE_BOX,
  };
}

/** True when the gate sign and gate are fully inside the window at the opening scroll position. */
export function gateVisibleAtStart(layout: SceneLayout): boolean {
  return layout.gateSignTopInViewport >= layout.insetsTop + HINT_H && layout.gateBottomInViewport <= layout.viewportH;
}

// Building placement in the yard: centre x share of the width and tile-base y share of the yard height.
const PLACEMENT: Record<YardBuildingKey, { cx: number; baseTop: number }> = {
  doghouse: { cx: 0.26, baseTop: 0.6 },
  bakery: { cx: 0.76, baseTop: 0.62 },
  sniffGarden: { cx: 0.5, baseTop: 0.9 },
};
const SPRITE_BASE_FRAC = 0.86;
const HIT_WIDTH_FRAC = 0.64;
const HIT_HEIGHT_FRAC = 0.3;
const BADGE_W = 72;

/** Where a building's sign hangs (tile-base relative), plus the pennant spot above the roof. */
export interface WorldBuildingBox {
  sprite: LayoutBox;
  hit: HitBox;
  /** Centre x of the sign and its top in yard px from the yard top. */
  signCx: number;
  signTop: number;
  pennantLeft: number;
  pennantBottom: number;
}

export interface WorldYardLayout extends YardLayout {
  world: Record<YardBuildingKey, WorldBuildingBox>;
  /** Doormat under the gate, centred on Buddy's resting spot. */
  doormat: { left: number; top: number; width: number; height: number };
}

/**
 * Yard geometry for the scene. It returns a `YardLayout` (what YardBuddy's walk geometry and the
 * Wild Extras need) with Buddy resting at the gate (top of the yard) and the buildings below him.
 * `bottom` values are px up from the yard floor (= yard height down).
 */
export function worldYardLayout(width: number, yardH: number, levels: Record<YardBuildingKey, number>): WorldYardLayout {
  const buddy: LayoutBox = {
    left: width / 2 - BUDDY_SIZE / 2,
    bottom: yardH - BUDDY_TOP_GAP - BUDDY_SIZE,
    size: BUDDY_SIZE,
  };
  const sprites = {} as Record<YardBuildingKey, LayoutBox>;
  const hits = {} as Record<YardBuildingKey, HitBox>;
  const badges = {} as Record<YardBuildingKey, LayoutBox>;
  const world = {} as Record<YardBuildingKey, WorldBuildingBox>;
  for (const key of YARD_ORDER) {
    const size = STAGE_SIZE[artTierForLevel(levels[key]) as BuildingLevel];
    const place = PLACEMENT[key];
    const left = Math.max(-size * 0.1, Math.min(width - size * 0.9, width * place.cx - size / 2));
    const baseY = yardH * place.baseTop; // from the yard top
    const bottom = yardH - baseY - (1 - SPRITE_BASE_FRAC) * size;
    sprites[key] = { left, bottom, size };
    const hitW = size * HIT_WIDTH_FRAC;
    hits[key] = { left: left + size / 2 - hitW / 2, bottom: bottom + (1 - SPRITE_BASE_FRAC) * size, width: hitW, height: size * HIT_HEIGHT_FRAC };
    badges[key] = { left: left + size / 2 - BADGE_W / 2, bottom: yardH - baseY - 32, size: BADGE_W };
    world[key] = {
      sprite: sprites[key],
      hit: hits[key],
      signCx: left + size / 2,
      signTop: baseY + 6,
      pennantLeft: left + size * 0.62,
      pennantBottom: bottom + size * 0.62,
    };
  }
  return {
    sprites,
    hits,
    badges,
    buddy,
    ground: groundBox(width, yardH),
    world,
    doormat: { left: width / 2 - 70, top: BUDDY_TOP_GAP + BUDDY_SIZE - buddyFeetInset(BUDDY_SIZE) - 40, width: 140, height: 70 },
  };
}

/** Scroll offset that shows the Viertel (the map strip) with the fence edge just visible at the bottom. */
export function viertelScrollTarget(layout: SceneLayout): number {
  return Math.max(0, layout.tailTop + layout.fenceBottom * 0.6 - layout.viewportH);
}

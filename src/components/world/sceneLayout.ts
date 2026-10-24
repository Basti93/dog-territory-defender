import { buddyFeetInset } from '../../buddy/imageSkin';
import { BUILDING_SIZE, LayoutBox, SPRITE_GROUND_Y_FRAC, YardBuildingKey, YardLayout, groundBox } from '../den/YardScene';

// Pure geometry of the world scene (redesign step 1: one scene, three pages).
// Content, top to bottom: SKY, VIERTEL (embedded map portrait), one viewport-high "tail" =
// fence zone + yard (Hof), then the BUILDINGS page (one more viewport). The scroll starts at the tail, so what the
// player sees first is the gate sign at the top and the yard below it, with no scrolling needed to start a walk
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
/** Bench and mailbox live in this strip under the yard (the bowl sits higher, in the yard); its last ~60 pt hold the "down to the buildings" strip and the home-indicator inset. */
export const BOTTOM_ROW_H = 232;
export const MIN_YARD_H = 300;

export const BUDDY_SIZE = 130;
/** Smallest gap between the fence line and the top of Buddy's box (the leaving trot starts from the resting box). */
const BUDDY_TOP_GAP = 4;

export interface SceneLayout {
  viewportH: number;
  width: number;
  insetsTop: number;
  contentH: number;
  /** ScrollView offset the scene opens at (the tail: gate + yard). */
  startOffset: number;
  /** Content y where the buildings page begins, its height (>= the viewport) and the ScrollView offset that shows it. */
  buildingsTop: number;
  /** Height of the layer: the page (>= a viewport) plus PANEL_ROOM of grass the docked upgrade sign can scroll the rows up into. */
  buildingsH: number;
  /** The page itself (>= viewport); `buildingsOffset` shows it with its bottom at the screen bottom. */
  buildingsPageH: number;
  buildingsOffset: number;
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
  /** "Down to the buildings" strip at the bottom of the Hof (Hof-relative top). */
  hintDownTop: number;
  /** Where the gate sign sits in the viewport at the start offset (== gateSignTop). Must be >= insetsTop + hint. */
  gateSignTopInViewport: number;
  gateBottomInViewport: number;
}

/** Pure: all vertical positions of the scene for a window. */
export function sceneLayout(windowHeight: number, width: number, insetsTop: number, insetsBottom = 0): SceneLayout {
  const hintTop = insetsTop + 4;
  const gateSignTop = hintTop + HINT_H + HINT_GAP;
  const gateVisibleTop = gateSignTop + GATE_SIGN_H - GATE_SIGN_OVERLAP;
  const gateBoxTop = gateVisibleTop - GATE_BOX * GATE_VISIBLE_TOP_FRAC;
  const fenceBottom = gateBoxTop + GATE_BOX - FENCE_FOOT_PAD;
  const hofH = Math.max(windowHeight - fenceBottom, MIN_YARD_H + BOTTOM_ROW_H);
  const yardH = hofH - BOTTOM_ROW_H;
  const tailH = fenceBottom + hofH; // >= windowHeight; equal on every real phone
  const tailTop = SKY_H + VIERTEL_H;
  const buildingsTop = tailTop + tailH;
  const buildingsPageH = Math.max(windowHeight, buildingsPageNeededH(insetsTop));
  const buildingsH = buildingsPageH + PANEL_ROOM;
  return {
    viewportH: windowHeight,
    width,
    insetsTop,
    contentH: buildingsTop + buildingsH,
    startOffset: tailTop + tailH - windowHeight,
    buildingsTop,
    buildingsH,
    buildingsPageH,
    buildingsOffset: buildingsTop + buildingsPageH - windowHeight,
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
    hintDownTop: hofH - HINT_H - insetsBottom,
    gateSignTopInViewport: gateSignTop,
    gateBottomInViewport: gateBoxTop + GATE_BOX,
  };
}

/** True when the gate sign and gate are fully inside the window at the opening scroll position. */
export function gateVisibleAtStart(layout: SceneLayout): boolean {
  return layout.gateSignTopInViewport >= layout.insetsTop + HINT_H && layout.gateBottomInViewport <= layout.viewportH;
}

// ---- Buildings page: 2 x 2 slots on one shared ground strip; every building sprite has the same size ----

/** Slot order, row by row. `null` is the reserved slot of the future Friend Lounge: it renders nothing. */
export const BUILDING_SLOTS: ReadonlyArray<YardBuildingKey | null> = ['doghouse', 'bakery', 'sniffGarden', null];
const SLOT_COLUMNS = 2;
/** Slot centres as a share of the page width. */
const SLOT_CX = [0.25, 0.75];
/** Gap between the "back to the Hof" strip and the first sprite canvas. */
const BUILDINGS_TOP_GAP = 8;
/** Distance between the two ground lines (a share of the sprite size): row 1's sign hangs below its art and ends above row 2's roof. */
const ROW_PITCH_FRAC = 1.2;
const BUILDINGS_BOTTOM_PAD = 24;
/**
 * Hand-set, deterministic per-slot offsets (pt) so the buildings do not read as a grid: the left column sits a bit lower, the
 * right one higher, each slightly off its column. Slot order as BUILDING_SLOTS. A column's lower slot never moves up relative to
 * the upper one (its sign still ends above the next roof). The sprite size stays BUILDING_SIZE: one world scale.
 */
export const SLOT_JITTER: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: -8, dy: 6 },
  { dx: 6, dy: -14 },
  { dx: 10, dy: 14 },
  { dx: -6, dy: -8 },
];
const SLOT_JITTER_MAX_DOWN = Math.max(...SLOT_JITTER.map((j) => j.dy));
const HIT_WIDTH_FRAC = 0.6;
const HIT_HEIGHT_FRAC = 0.5;
/** Share of the sprite size above the canvas top where a pennant's lower end sits: pennant stands on the roof area. */
const PENNANT_Y_FRAC = 0.38;
export const PENNANT_H = 72;
/** The Lv sign hangs this far below the ground line: clear of the baked shadow and tufts (art ends ~0.15-0.25 S below it; garden stage 4 is the longest). */
const SIGN_BELOW_GROUND_FRAC = 0.25;
/** Tallest sign (two lines: "Upgrade possible" + next effect). */
const SIGN_H = 64;
/** Screen height the docked upgrade sign covers at the bottom (sign + home indicator + margin). */
export const PANEL_ROOM = 220;

function firstGroundY(insetsTop: number): number {
  return insetsTop + 4 + HINT_H + BUILDINGS_TOP_GAP + SPRITE_GROUND_Y_FRAC * BUILDING_SIZE;
}

/** Page height the two rows need (the page is at least a viewport high). */
function buildingsPageNeededH(insetsTop: number): number {
  const lastGround = firstGroundY(insetsTop) + ROW_PITCH_FRAC * BUILDING_SIZE + SLOT_JITTER_MAX_DOWN;
  return lastGround + (1 - SPRITE_GROUND_Y_FRAC) * BUILDING_SIZE + BUILDINGS_BOTTOM_PAD;
}

/** One building on the buildings page. All values in px from the page top. */
export interface WorldBuildingBox {
  /** The sprite canvas (always BUILDING_SIZE square). */
  sprite: { left: number; top: number; size: number };
  /** Tap target over the building's body. */
  hit: { left: number; top: number; width: number; height: number };
  /** Centre x of the Lv sign and its top. */
  signCx: number;
  signTop: number;
  pennantLeft: number;
  pennantTop: number;
}

export interface BuildingsLayout {
  /** Top of the "back to the Hof" strip. */
  backTop: number;
  /** Nominal ground line y of each row (a slot's own `groundY` is this plus its SLOT_JITTER dy). */
  rowGroundY: number[];
  /** Slot order as BUILDING_SLOTS; an empty slot is `null` (reserved, draws nothing). */
  slots: Array<{ key: YardBuildingKey | null; cx: number; groundY: number }>;
  world: Record<YardBuildingKey, WorldBuildingBox>;
}

/**
 * Buildings page geometry. Each sprite's footprint centre (canvas 0.5, 0.69) is placed on its slot's ground point, so all
 * buildings stand on their slot's ground point whatever their stage. Slack height (tall phones) moves the rows down a little.
 */
export function buildingsLayout(width: number, insetsTop: number, pageH: number): BuildingsLayout {
  const slack = Math.max(0, pageH - buildingsPageNeededH(insetsTop));
  const shift = Math.min(60, slack * 0.3);
  const rows = Math.ceil(BUILDING_SLOTS.length / SLOT_COLUMNS);
  const rowGroundY = Array.from({ length: rows }, (_, r) => firstGroundY(insetsTop) + shift + r * ROW_PITCH_FRAC * BUILDING_SIZE);
  const S = BUILDING_SIZE;
  const world = {} as Record<YardBuildingKey, WorldBuildingBox>;
  const slots: BuildingsLayout['slots'] = [];
  BUILDING_SLOTS.forEach((key, i) => {
    const groundY = rowGroundY[Math.floor(i / SLOT_COLUMNS)] + SLOT_JITTER[i].dy;
    const cx = width * SLOT_CX[i % SLOT_COLUMNS] + SLOT_JITTER[i].dx;
    slots.push({ key, cx, groundY });
    if (!key) return;
    // The widest sprite uses 86% of the canvas: keep it on screen.
    const left = Math.max(-0.07 * S, Math.min(width - 0.93 * S, cx - S / 2));
    const top = groundY - SPRITE_GROUND_Y_FRAC * S;
    const spriteCx = left + S / 2;
    world[key] = {
      sprite: { left, top, size: S },
      hit: { left: spriteCx - (S * HIT_WIDTH_FRAC) / 2, top: groundY - S * HIT_HEIGHT_FRAC, width: S * HIT_WIDTH_FRAC, height: S * HIT_HEIGHT_FRAC },
      signCx: spriteCx,
      signTop: groundY + SIGN_BELOW_GROUND_FRAC * S,
      pennantLeft: left + S * 0.62,
      pennantTop: top + S * PENNANT_Y_FRAC - PENNANT_H,
    };
  });
  return { backTop: insetsTop + 4, rowGroundY, slots, world };
}

// ---- Hof (yard) geometry ----

export interface WorldYardLayout extends YardLayout {
  /** Doormat under Buddy's resting spot (his bed in the middle of the yard). */
  doormat: { left: number; top: number; width: number; height: number };
  /** Distance Buddy's resting box rises while he trots up to the gate (the gate is above the yard). */
  gateRise: number;
  /** Ground y (px from the yard top) of his feet at the resting spot: the decor is placed around it. */
  feetY: number;
  /** Top (px from the yard top) of the treat bowl's box: just below the doormat, centred, so it sits in the yard and not in the bottom row. */
  bowlTop: number;
}

/** Gap between the doormat's bottom edge and the bowl's box. */
const BOWL_MAT_GAP = 4;

/**
 * Hof geometry for the scene. It returns a `YardLayout` (what YardBuddy's walk geometry and the Wild Extras need) with Buddy
 * resting (and lying down) in the middle of the yard on his doormat. `bottom` values are px up from the yard floor (= yard height down).
 */
export function worldYardLayout(width: number, yardH: number): WorldYardLayout {
  const top = Math.max(BUDDY_TOP_GAP, Math.round((yardH - BUDDY_SIZE) / 2));
  const buddy: LayoutBox = {
    left: width / 2 - BUDDY_SIZE / 2,
    bottom: yardH - top - BUDDY_SIZE,
    size: BUDDY_SIZE,
  };
  return {
    buddy,
    ground: groundBox(width, yardH),
    extras: { daisyCx: width * 0.24, duckBaseY: yardH * 0.7, fireflyCx: width * 0.26, teaCx: width * 0.7, teaBaseY: yardH * 0.8 },
    doormat: { left: width / 2 - 70, top: top + BUDDY_SIZE - buddyFeetInset(BUDDY_SIZE) - 40, width: 140, height: 70 },
    gateRise: top - BUDDY_TOP_GAP + BUDDY_SIZE * 0.9 + buddyFeetInset(BUDDY_SIZE),
    feetY: top + BUDDY_SIZE - buddyFeetInset(BUDDY_SIZE),
    bowlTop: top + BUDDY_SIZE - buddyFeetInset(BUDDY_SIZE) - 40 + 70 + BOWL_MAT_GAP,
  };
}

/** Scroll offset that shows the Viertel (the map strip) with the fence edge just visible at the bottom. */
export function viertelScrollTarget(layout: SceneLayout): number {
  return Math.max(0, layout.tailTop + layout.fenceBottom * 0.6 - layout.viewportH);
}

/**
 * ScrollView offset for opening a building's upgrade sign: the buildings page, scrolled further down (into the PANEL_ROOM grass)
 * just enough that the building's sign stays above the docked panel.
 */
export function buildingSelectOffset(layout: SceneLayout, b: BuildingsLayout, key: YardBuildingKey): number {
  const signBottom = layout.buildingsTop + b.world[key].signTop + SIGN_H;
  const needed = signBottom - (layout.viewportH - PANEL_ROOM);
  return Math.min(layout.contentH - layout.viewportH, Math.max(layout.buildingsOffset, needed));
}

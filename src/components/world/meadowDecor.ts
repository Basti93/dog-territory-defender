import { BUILDING_SIZE } from '../den/YardScene';
import type { ArtKey } from '../../art/artAssets';
import type { BuildingsLayout } from './sceneLayout';

// Pure placement of the static meadow decor (Hof corners and the buildings page): bushes, hedge, tree, flowers, stones, tufts,
// worn paths and soft ground patches. Hand-set anchors plus one seeded scatter, so the layout is identical on every launch and
// nothing is computed per frame. Rendering lives in MeadowLayer.tsx. All values are pt, page- or yard-relative.

export type MeadowArt = Extract<ArtKey, `meadow-${string}`>;

/** Canvas aspect (w / h) and the canvas fraction (from the top) where the sprite touches the ground (baked shadow included). */
const SPRITES: Record<MeadowArt, { aspect: number; foot: number }> = {
  'meadow-bush': { aspect: 384 / 256, foot: 0.9 },
  'meadow-hedge': { aspect: 768 / 256, foot: 0.88 },
  'meadow-tree': { aspect: 384 / 512, foot: 0.86 },
  'meadow-flowers': { aspect: 256 / 192, foot: 0.9 },
  'meadow-stones': { aspect: 256 / 160, foot: 0.82 },
  'meadow-tuft': { aspect: 256 / 192, foot: 0.9 },
};

export interface DecorItem {
  art: MeadowArt;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Mirrors the sprite so repeated props do not look copied. */
  flip: boolean;
}

/** A flat soft ellipse: a worn-path stone (`path`) or a lighter / darker tone of the ground (`light` | `dark`). */
export interface Patch {
  kind: 'path' | 'light' | 'dark';
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotateDeg: number;
}

/** Sprite of width `w` standing with its ground point at (cx, groundY). */
export function place(art: MeadowArt, cx: number, groundY: number, w: number, flip = false): DecorItem {
  const { aspect, foot } = SPRITES[art];
  const height = w / aspect;
  return { art, left: cx - w / 2, top: groundY - height * foot, width: w, height, flip };
}

/** Small deterministic generator (mulberry32): the scatter is the same on every launch and phone. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The Hof: cosy props around Buddy's mat. Everything stays behind him and clear of the bowl, pile and the mailbox path. */
export function hofDecor(width: number, yardH: number, feetY: number): DecorItem[] {
  const low = Math.min(yardH - 10, feetY + 70);
  const high = Math.max(70, feetY - 120);
  return [
    // upper meadow, under the fence: the yard is not an empty field above Buddy
    place('meadow-bush', width * 0.06, high + 20, 86),
    place('meadow-bush', width * 0.95, high + 54, 80, true),
    place('meadow-flowers', width * 0.24, high + 8, 60, true),
    place('meadow-tuft', width * 0.76, high - 8, 54),
    place('meadow-stones', width * 0.14, high + 62, 46),
    // beside the mat
    place('meadow-bush', width * 0.03, feetY - 6, 92),
    place('meadow-bush', width * 0.97, feetY - 8, 84, true),
    // below the mat, above the bowl row
    place('meadow-flowers', width * 0.17, low - 4, 66),
    place('meadow-tuft', width * 0.8, low - 6, 58, true),
    place('meadow-stones', width * 0.9, low + 2, 48),
    place('meadow-tuft', width * 0.33, low + 6, 50),
  ];
}

export interface MeadowLayout {
  hedges: DecorItem[];
  items: DecorItem[];
  patches: Patch[];
  /** Height of the fade from the Hof's ground colour into the meadow colour, from the page top. */
  fadeH: number;
}

const HEDGE_H_ABOVE_BACK = 100; // ground line of the hedge row, below the "back to the Hof" strip
const HINT_STRIP = 28;

/** Chain of path stones from a to b, bent sideways by `sag` in the middle so it curves instead of running ruler-straight. */
function pathBetween(ax: number, ay: number, bx: number, by: number, sag: number): Patch[] {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const n = Math.max(2, Math.round(dist / 30));
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const out: Patch[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bend = Math.sin(t * Math.PI) * sag + (i % 2 === 0 ? 3 : -3);
    out.push({
      kind: 'path',
      cx: ax + dx * t + (-dy / dist) * bend,
      cy: ay + dy * t + (dx / dist) * bend,
      width: 52 + (i % 3) * 6,
      height: 26 + (i % 2) * 4,
      rotateDeg: angle + (i % 2 ? 5 : -5),
    });
  }
  return out;
}

/**
 * The buildings page as a meadow that continues the Hof: a fade from the Hof's ground colour, a hedge row, soft ground
 * patches, worn paths between the slots and scattered flowers, tufts and stones that keep clear of the buildings and signs.
 */
export function meadowLayout(width: number, contentH: number, b: BuildingsLayout): MeadowLayout {
  const S = BUILDING_SIZE;
  const backBottom = b.backTop + HINT_STRIP;
  const hedgeGround = backBottom + HEDGE_H_ABOVE_BACK;
  const hedges = [
    place('meadow-hedge', width * 0.27, hedgeGround + 6, width * 0.62),
    place('meadow-hedge', width * 0.76, hedgeGround - 4, width * 0.6, true),
  ];

  const [doghouse, bakery, garden, lounge] = b.slots;
  const items: DecorItem[] = [];
  // Rects to keep clear: each building's body down to its sign, the hedge row and the reserved slot's footprint.
  const avoid: Array<{ l: number; t: number; r: number; b: number }> = [
    { l: 0, t: 0, r: width, b: hedgeGround + 4 },
    { l: lounge.cx - 0.5 * S, t: lounge.groundY - 0.6 * S, r: lounge.cx + 0.5 * S, b: lounge.groundY + 0.25 * S },
  ];
  for (const slot of [doghouse, bakery, garden]) {
    avoid.push({ l: slot.cx - 0.5 * S, t: slot.groundY - 0.6 * S, r: slot.cx + 0.5 * S, b: slot.groundY + 0.25 * S + 70 });
  }

  // Trees and bushes at the low margin of row 2, in the meadow under the reserved slot and left of it.
  const lowGround = garden.groundY + 0.25 * S + 110;
  items.push(place('meadow-tree', width * 0.8, lowGround + 36, 118));
  items.push(place('meadow-bush', width * 0.14, lowGround + 20, 96));
  items.push(place('meadow-bush', width * 0.55, lowGround + 30, 70, true));
  // The meadow beside the first row: a bush tucked behind each end of the hedge line gives the edge some depth.
  items.push(place('meadow-bush', width * 0.02, hedgeGround + 50, 78));
  items.push(place('meadow-bush', width * 0.99, hedgeGround + 40, 74, true));

  // Seeded scatter of small things on free ground (also in the grass below, which the docked upgrade sign scrolls into).
  const rng = seeded(24);
  const cycle: MeadowArt[] = ['meadow-flowers', 'meadow-tuft', 'meadow-tuft', 'meadow-stones', 'meadow-flowers', 'meadow-tuft'];
  const scatterTop = hedgeGround + 24;
  const scatterBottom = Math.min(contentH - 20, lowGround + 120);
  let placed = 0;
  for (let tries = 0; tries < 160 && placed < 22; tries++) {
    const x = 18 + rng() * (width - 36);
    const y = scatterTop + rng() * (scatterBottom - scatterTop);
    const art = cycle[placed % cycle.length];
    const w = (art === 'meadow-stones' ? 36 : 46) + rng() * 16;
    const flip = rng() > 0.5;
    const item = place(art, x, y, w, flip);
    const pad = 6;
    const hit = avoid.some((r) => item.left < r.r + pad && item.left + item.width > r.l - pad && item.top < r.b + pad && item.top + item.height > r.t - pad);
    const crowded = items.some((o) => Math.hypot(o.left + o.width / 2 - x, o.top + o.height - y) < 48);
    if (hit || crowded) continue;
    items.push(item);
    placed += 1;
  }
  items.sort((p, q) => p.top + p.height - (q.top + q.height)); // back to front

  const patches: Patch[] = [
    { kind: 'light', cx: width * 0.5, cy: backBottom + 150, width: width * 1.1, height: 130, rotateDeg: -3 },
    { kind: 'dark', cx: width * 0.1, cy: doghouse.groundY + 0.6 * S, width: width * 0.7, height: 120, rotateDeg: 4 },
    { kind: 'light', cx: width * 0.88, cy: bakery.groundY + 0.55 * S, width: width * 0.7, height: 130, rotateDeg: -5 },
    { kind: 'dark', cx: width * 0.7, cy: garden.groundY + 0.1 * S, width: width * 0.8, height: 140, rotateDeg: 3 },
    { kind: 'light', cx: width * 0.3, cy: lowGround, width: width * 0.9, height: 150, rotateDeg: 2 },
  ];
  // Worn paths: across the front doors of row 1, down the left column, along row 2 towards the reserved slot.
  const door = (s: typeof doghouse) => ({ x: s.cx, y: s.groundY + 0.07 * S });
  const a = door(doghouse);
  const c = door(bakery);
  const g = door(garden);
  const l = door(lounge);
  patches.push(...pathBetween(a.x + 40, a.y + 6, c.x - 40, c.y + 6, 10));
  patches.push(...pathBetween(a.x + 30, a.y + 22, g.x + 30, g.y - 0.34 * S, 12));
  patches.push(...pathBetween(g.x + 60, g.y + 4, l.x - 20, l.y + 4, 8));
  return { hedges, items, patches, fadeH: hedgeGround + 30 };
}

import { ACHIEVEMENTS, AchievementId, PersonalStatsState, thresholdAchievementProgress } from '../../economy/personalStats';
import type { UnlockedAchievement } from '../../storage/PersonalStatsRepository';
import type { ArtKey } from '../../art/artAssets';

// Fence badges (redesign step 6, handover/redesign/konzept.md "Erinnern"): every unlocked achievement hangs as a
// clay rosette on a peg on the yard fence. Pure helpers only (which badges, where they hang, which empty hook shows);
// the drawing is FenceBadges.tsx. The fence is personal to this device and never synced.

export type FenceFamily = 'walks' | 'distance' | 'treats' | 'den';

/**
 * Badges that stay OFF the fence for now. The three territory badges are cleared by any single qualifying
 * walk (the home-range cell footprint is 400 m^2, so 50 / 1000 / 5000 m^2 mean "had one real walk"), which would put
 * three free rosettes on the fence after the first walk. Their thresholds are NOT changed here; see the dated bullet
 * about the fence in docs/decisions/LOG.md. They still show in the Stats screen and in the homecoming sign.
 */
export const FENCE_EXCLUDED_ACHIEVEMENTS: readonly AchievementId[] = ['ground-claimed', 'big-backyard', 'whole-city-block'];

const FAMILY: Partial<Record<AchievementId, FenceFamily>> = {
  'first-steps': 'walks',
  'paws-on-the-pavement': 'walks',
  'familiar-trails': 'walks',
  'neighborhood-legend': 'walks',
  'hundred-walks': 'walks',
  'round-the-block': 'distance',
  'cross-town-trotter': 'distance',
  'century-trail': 'distance',
  'long-way-round': 'distance',
  'first-bakery-batch': 'treats',
  'treat-jar-overflowing': 'treats',
  'treats-for-days': 'treats',
  'moving-in': 'den',
  'handy-homebody': 'den',
  'cozy-den': 'den',
};

/** Sprite of the rosette in a family's colour. */
export function rosetteArt(family: FenceFamily): ArtKey {
  return `rosette-${family}`;
}

/** The fence family of a badge, or null when the badge does not hang on the fence. */
export function fenceFamily(id: AchievementId): FenceFamily | null {
  if (FENCE_EXCLUDED_ACHIEVEMENTS.includes(id)) return null;
  return FAMILY[id] ?? null;
}

export interface FenceBadge {
  id: AchievementId;
  family: FenceFamily;
  unlockedAt: number;
}

const ORDER = Object.keys(ACHIEVEMENTS) as AchievementId[];

/** Unlocked badges that hang on the fence, oldest first (ties in the achievements' own order). */
export function fenceBadgeList(unlocked: readonly UnlockedAchievement[]): FenceBadge[] {
  const out: FenceBadge[] = [];
  const seen = new Set<AchievementId>();
  for (const u of unlocked) {
    const family = fenceFamily(u.id);
    if (!family || seen.has(u.id)) continue;
    seen.add(u.id);
    out.push({ id: u.id, family, unlockedAt: u.unlockedAt });
  }
  return out.sort((a, b) => a.unlockedAt - b.unlockedAt || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}

// ---- the empty hook ----

/** Progress share (0..1) from which a threshold badge shows its empty hook. */
export const HOOK_FROM_PROGRESS = 0.8;

export interface EmptyHook {
  id: AchievementId;
  family: FenceFamily;
}

/**
 * At most ONE empty hook: the not-yet-earned threshold badge closest to its goal, only from 80 % of the way.
 * Den badges never get one (the Den is where they are earned), and neither do badges that stay off the fence.
 */
export function pickEmptyHook(stats: PersonalStatsState, unlocked: readonly UnlockedAchievement[]): EmptyHook | null {
  const have = new Set(unlocked.map((u) => u.id));
  let best: { id: AchievementId; family: FenceFamily; ratio: number; target: number } | null = null;
  for (const id of ORDER) {
    const family = fenceFamily(id);
    if (!family || family === 'den' || have.has(id)) continue;
    const progress = thresholdAchievementProgress(id, stats);
    if (!progress) continue;
    const { current, target } = progress;
    const ratio = target > 0 ? current / target : 0;
    if (ratio < HOOK_FROM_PROGRESS || ratio >= 1) continue;
    if (!best || ratio > best.ratio || (ratio === best.ratio && target < best.target)) best = { id, family, ratio, target };
  }
  return best ? { id: best.id, family: best.family } : null;
}

// ---- homecoming: which new badges arrive on the fence ----

/** At most this many new things show in beat 3 of a homecoming; the rest hang there on the next open. */
export const MAX_BADGE_ARRIVALS = 2;

/** The first (up to) two newly unlocked badges of a walk: fence badges first, then the ones that only get a sign. */
export function planBadgeArrivals(unlocked: readonly AchievementId[]): AchievementId[] {
  const onFence = unlocked.filter((id) => fenceFamily(id) !== null);
  const offFence = unlocked.filter((id) => fenceFamily(id) === null);
  return [...onFence, ...offFence].slice(0, MAX_BADGE_ARRIVALS);
}

// ---- where the pegs hang ----

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FenceSlot {
  /** Top-left of the peg box (size x size), in tail coordinates (the fence layer's own space). */
  x: number;
  y: number;
}

export interface FenceLayoutInput {
  width: number;
  /** Tail-relative y of the fence line (SceneLayout.fenceBottom). */
  fenceBottom: number;
  /** Number of badges that want a peg. */
  count: number;
  /** Reserve one slot (bottom row, far left) for the empty hook. */
  withHook: boolean;
  /** Areas that must stay free (the strip signs under the fence). */
  keepOut: readonly Rect[];
}

export interface FenceLayout {
  /** Rosette edge in pt (it shrinks as the fence fills). */
  size: number;
  /** One slot per badge, oldest first. Shorter than `count` when the fence is full. */
  slots: FenceSlot[];
  /** Badges that do not fit: the OLDEST `overflow` ones are left off (new ones must always show). */
  overflow: number;
  /** Where the empty hook hangs, or null when none is wanted or it does not fit. */
  hook: FenceSlot | null;
}

/** Rosette sizes, tried from the biggest: the fence stays calm while it is empty, and shrinks before it clips. */
export const FENCE_PEG_SIZES = [30, 26, 22, 18, 15] as const;
/** The visible pickets: from this far above the fence line down to this far above it (the sprite has a transparent foot). */
const BAND_TOP = 90;
const BAND_BOTTOM = 14;
/** Horizontal room kept free for the end posts and the gate (the gate's posts reach about 90 pt from the middle). */
const END_POST_INSET = 31;
const GATE_HALF_WIDTH = 92;
/** Space between neighbouring rosettes (the sprites carry a little transparent margin of their own). */
const GAP = 2;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

interface Candidate extends FenceSlot {
  row: number;
  dist: number;
}

function candidatesFor(input: FenceLayoutInput, size: number): Candidate[] {
  const { width, fenceBottom, keepOut } = input;
  const pitchX = size + GAP;
  const pitchY = size + GAP;
  const bandTop = fenceBottom - BAND_TOP;
  const bottomY = fenceBottom - BAND_BOTTOM;
  const mid = width / 2;
  const regions = [
    { x0: END_POST_INSET, x1: mid - GATE_HALF_WIDTH },
    { x0: mid + GATE_HALF_WIDTH, x1: width - END_POST_INSET },
  ];
  const out: Candidate[] = [];
  for (let row = 0; bottomY - size - row * pitchY >= bandTop; row++) {
    for (const r of regions) {
      const cols = Math.floor((r.x1 - r.x0 + GAP) / pitchX);
      if (cols <= 0) continue;
      const start = r.x0 + (r.x1 - r.x0 - (cols * pitchX - GAP)) / 2;
      for (let c = 0; c < cols; c++) {
        // A small deterministic lift keeps the rows from reading like a table.
        const lift = (c * 7 + row * 3) % 3;
        const x = start + c * pitchX;
        const y = bottomY - size - row * pitchY - lift;
        if (y < bandTop) continue;
        const box = { x, y, w: size, h: size };
        if (keepOut.some((k) => overlaps(box, k))) continue;
        out.push({ x, y, row, dist: Math.abs(x + size / 2 - mid) });
      }
    }
  }
  // Lowest row first, then the pegs closest to the gate: a few badges hang in two tidy groups beside the gate.
  return out.sort((a, b) => a.row - b.row || a.dist - b.dist);
}

/** Pure: pick the biggest rosette size at which all badges (and the hook) fit; else the smallest and report the overflow. */
export function fenceLayout(input: FenceLayoutInput): FenceLayout {
  const wanted = input.count + (input.withHook ? 1 : 0);
  let chosen: { size: number; cands: Candidate[] } | null = null;
  for (const size of FENCE_PEG_SIZES) {
    const cands = candidatesFor(input, size);
    chosen = { size, cands };
    if (cands.length >= wanted) break;
  }
  const { size, cands } = chosen as { size: number; cands: Candidate[] };
  let hook: FenceSlot | null = null;
  let pool = cands;
  if (input.withHook) {
    // Far left of the bottom row: its little sign hangs below the fence line over the grass, away from Buddy.
    const bottomRow = cands.filter((c) => c.row === 0 && c.x + size / 2 < input.width / 2);
    const pick = bottomRow.sort((a, b) => a.x - b.x)[0];
    if (pick) {
      hook = { x: pick.x, y: pick.y };
      pool = cands.filter((c) => c !== pick);
    }
  }
  const take = Math.min(input.count, pool.length);
  return {
    size,
    slots: pool.slice(0, take).map((c) => ({ x: c.x, y: c.y })),
    overflow: input.count - take,
    hook,
  };
}

// ---- the signs under the fence ----
// The picket band belongs to the badges. The dog-name sign (right) and the territory / co-op / partner signs (left,
// stacked) hang in the strip of grass just under the fence line, either side of Buddy. WorldScene positions them from
// `signStrip`, and `fenceKeepOut` hands the same rectangles to the layout so nothing here can drift apart.

/** Strip top, below the fence line: clear of the empty hook's tiny sign, which hangs just under the bottom row. */
export const SIGN_STRIP_TOP = 10;
const STRIP_EDGE = 6;
const STRIP_MAX_W = 150;
/** Buddy (and his doormat) keep this much of the middle free. */
const STRIP_BUDDY_HALF = 66;
const DOG_SIGN_H = { title: 46, plain: 40 };
/** Estimates for a status sign that wraps to three lines (WorldScene lays the signs out by their real height). */
const STATUS_SIGN_H = 62;
const STATUS_PITCH = 66;

export interface SignStripInput {
  width: number;
  /** Tail-relative y of the fence line (SceneLayout.fenceBottom). */
  fenceBottom: number;
  /** The dog-name sign has two lines (name + milestone title) when a title is set. */
  hasTitle: boolean;
  /** How many of territory / co-op / partner are showing (they stack on the left). */
  statusCount: number;
}

export interface SignStrip {
  /** Width of the signs in the strip. */
  signW: number;
  dog: Rect;
  /** One rect per status sign, top to bottom. */
  status: Rect[];
  /** Strip height under the fence line on each side: the yard's notes (speech bubble right, paper note left) start below it. */
  rightH: number;
  leftH: number;
}

/** Pure: where the strip signs hang, in tail coordinates. Estimated heights (the signs size to their text). */
export function signStrip(input: SignStripInput): SignStrip {
  const signW = Math.min(STRIP_MAX_W, input.width / 2 - STRIP_BUDDY_HALF);
  const top = input.fenceBottom + SIGN_STRIP_TOP;
  const dogH = input.hasTitle ? DOG_SIGN_H.title : DOG_SIGN_H.plain;
  const status: Rect[] = [];
  for (let i = 0; i < input.statusCount; i++) status.push({ x: STRIP_EDGE, y: top + i * STATUS_PITCH, w: signW, h: STATUS_SIGN_H });
  return {
    signW,
    dog: { x: input.width - STRIP_EDGE - signW, y: top, w: signW, h: dogH },
    status,
    rightH: SIGN_STRIP_TOP + dogH + 6,
    leftH: input.statusCount > 0 ? SIGN_STRIP_TOP + (input.statusCount - 1) * STATUS_PITCH + STATUS_SIGN_H + 6 : 0,
  };
}

/** Pure: the strip's rectangles with 3 pt of padding each (the signs are tilted a little). Nothing in the picket band. */
export function fenceKeepOut(input: SignStripInput): Rect[] {
  const pad = 3;
  const strip = signStrip(input);
  return [strip.dog, ...strip.status].map((r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad }));
}

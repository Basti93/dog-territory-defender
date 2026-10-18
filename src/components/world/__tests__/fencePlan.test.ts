import { AchievementId, ACHIEVEMENTS, defaultPersonalStatsState } from '../../../economy/personalStats';
import type { UnlockedAchievement } from '../../../storage/PersonalStatsRepository';
import {
  FENCE_EXCLUDED_ACHIEVEMENTS,
  FENCE_PEG_SIZES,
  FenceLayoutInput,
  MAX_BADGE_ARRIVALS,
  Rect,
  fenceBadgeList,
  fenceFamily,
  fenceKeepOut,
  fenceLayout,
  pickEmptyHook,
  planBadgeArrivals,
  signStrip,
} from '../fencePlan';
import { sceneLayout } from '../sceneLayout';

const ALL = Object.keys(ACHIEVEMENTS) as AchievementId[];
const unlock = (ids: AchievementId[], at = 1000): UnlockedAchievement[] => ids.map((id, i) => ({ id, unlockedAt: at + i }));
const stats = (over: Partial<ReturnType<typeof defaultPersonalStatsState>>) => ({ ...defaultPersonalStatsState(), ...over });

describe('fence badge list', () => {
  it('keeps the three trivially cleared territory badges off the fence', () => {
    expect(FENCE_EXCLUDED_ACHIEVEMENTS).toEqual(['ground-claimed', 'big-backyard', 'whole-city-block']);
    const list = fenceBadgeList(unlock(ALL));
    expect(list.map((b) => b.id)).not.toEqual(expect.arrayContaining(['ground-claimed']));
    expect(list).toHaveLength(ALL.length - 3);
    for (const id of FENCE_EXCLUDED_ACHIEVEMENTS) expect(fenceFamily(id)).toBeNull();
  });

  it('every other achievement has a family (so a new achievement id cannot silently vanish)', () => {
    for (const id of ALL.filter((x) => !FENCE_EXCLUDED_ACHIEVEMENTS.includes(x))) expect(fenceFamily(id)).not.toBeNull();
  });

  it('orders oldest first, ignores duplicates and carries the unlock date', () => {
    const list = fenceBadgeList([
      { id: 'round-the-block', unlockedAt: 300 },
      { id: 'first-steps', unlockedAt: 100 },
      { id: 'first-steps', unlockedAt: 999 },
    ]);
    expect(list).toEqual([
      { id: 'first-steps', family: 'walks', unlockedAt: 100 },
      { id: 'round-the-block', family: 'distance', unlockedAt: 300 },
    ]);
  });

  it('is empty with nothing unlocked', () => {
    expect(fenceBadgeList([])).toEqual([]);
  });
});

describe('empty hook', () => {
  it('shows nothing below 80 % progress', () => {
    expect(pickEmptyHook(stats({ totalWalksClosed: 19 }), unlock(['first-steps', 'paws-on-the-pavement']))).toBeNull(); // 19/25 = 76 %
  });

  it('shows the threshold badge from 80 % on', () => {
    expect(pickEmptyHook(stats({ totalWalksClosed: 20 }), unlock(['first-steps', 'paws-on-the-pavement']))).toEqual({ id: 'familiar-trails', family: 'walks' });
  });

  it('picks only ONE, the one closest to its goal', () => {
    const s = stats({ totalWalksClosed: 22, lifetimeDistanceMeters: 4800, totalTreatsEarnedLifetime: 950 }); // 88 %, 96 %, 95 %
    const hook = pickEmptyHook(s, unlock(['first-steps', 'paws-on-the-pavement']));
    expect(hook).toEqual({ id: 'round-the-block', family: 'distance' });
  });

  it('skips badges that are already earned, and never shows one at or past its goal', () => {
    expect(pickEmptyHook(stats({ totalWalksClosed: 25 }), unlock(['first-steps', 'paws-on-the-pavement', 'familiar-trails']))).toBeNull();
    // 25 walks but familiar-trails somehow not unlocked: it is not a "soon", the hook stays away.
    expect(pickEmptyHook(stats({ totalWalksClosed: 25 }), unlock(['first-steps', 'paws-on-the-pavement']))).toBeNull();
  });

  it('never hangs one for the excluded territory badges', () => {
    expect(pickEmptyHook(stats({ biggestTerritoryAreaM2: 45 }), [])).toBeNull(); // 90 % of ground-claimed
  });

  it('never hangs one for Den badges', () => {
    const hook = pickEmptyHook(stats({}), []);
    expect(hook).toBeNull();
    for (const id of ['moving-in', 'handy-homebody', 'cozy-den'] as const) expect(fenceFamily(id)).toBe('den');
  });
});

describe('badge arrivals in the homecoming', () => {
  it('caps at two, fence badges first', () => {
    expect(MAX_BADGE_ARRIVALS).toBe(2);
    expect(planBadgeArrivals(['ground-claimed', 'first-steps', 'round-the-block', 'first-bakery-batch'])).toEqual(['first-steps', 'round-the-block']);
  });

  it('is empty without new badges and still names an excluded badge when it is the only one', () => {
    expect(planBadgeArrivals([])).toEqual([]);
    expect(planBadgeArrivals(['big-backyard'])).toEqual(['big-backyard']);
  });
});

describe('sign strip', () => {
  const base = { width: 390, fenceBottom: 300, hasTitle: true, statusCount: 0 };

  it('hangs under the fence line, never in the picket band', () => {
    for (const statusCount of [0, 1, 2, 3]) {
      const strip = signStrip({ ...base, statusCount });
      expect(strip.status).toHaveLength(statusCount);
      for (const r of [strip.dog, ...strip.status]) expect(r.y).toBeGreaterThanOrEqual(base.fenceBottom);
    }
  });

  it('keeps the middle free for Buddy and the signs apart from each other, on narrow and wide phones', () => {
    for (const width of [360, 390, 430]) {
      const strip = signStrip({ ...base, width, statusCount: 3 });
      for (const r of [strip.dog, ...strip.status]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(width);
      }
      const left = strip.status.map((r) => r.x + r.w);
      expect(Math.max(...left)).toBeLessThanOrEqual(width / 2 - 60);
      expect(strip.dog.x).toBeGreaterThanOrEqual(width / 2 + 60);
      for (let i = 1; i < strip.status.length; i++) expect(strip.status[i].y).toBeGreaterThanOrEqual(strip.status[i - 1].y + strip.status[i - 1].h);
    }
  });

  it('reports how far down the yard notes must start', () => {
    expect(signStrip({ ...base, statusCount: 0 }).leftH).toBe(0);
    expect(signStrip({ ...base, statusCount: 2 }).leftH).toBeGreaterThan(signStrip({ ...base, statusCount: 1 }).leftH);
    expect(signStrip({ ...base, hasTitle: true }).rightH).toBeGreaterThan(signStrip({ ...base, hasTitle: false }).rightH);
  });

  it('the keep-out rects are the strip signs with a little padding', () => {
    const rects = fenceKeepOut({ ...base, statusCount: 2 });
    expect(rects).toHaveLength(3);
  });
});

describe('slot layout', () => {
  const layout = sceneLayout(844, 390, 47);
  const stripInput = { width: 390, fenceBottom: layout.fenceBottom, hasTitle: true, statusCount: 0 };
  const keepOut = fenceKeepOut(stripInput);
  const input = (count: number, over: Partial<FenceLayoutInput> = {}): FenceLayoutInput => ({
    width: 390,
    fenceBottom: layout.fenceBottom,
    count,
    withHook: false,
    keepOut,
    ...over,
  });
  const box = (s: { x: number; y: number }, size: number): Rect => ({ x: s.x, y: s.y, w: size, h: size });
  const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  function expectSane(count: number, withHook: boolean, over: Partial<FenceLayoutInput> = {}) {
    const width = over.width ?? 390;
    const fullStrip = fenceKeepOut({ width, fenceBottom: layout.fenceBottom, hasTitle: true, statusCount: 3 });
    const out = fenceLayout(input(count, { withHook, keepOut: fullStrip, ...over }));
    const boxes = [...out.slots, ...(out.hook ? [out.hook] : [])].map((s) => box(s, out.size));
    for (const b of boxes) {
      for (const k of fullStrip) expect(hits(b, k)).toBe(false); // the strip signs under the fence stay clear, even all four
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(width);
      expect(b.y + b.h).toBeLessThanOrEqual(layout.fenceBottom); // on the planks, not in the yard
      // The gate itself (about 92 pt either side of the middle) stays clear.
      expect(b.x + b.w <= width / 2 - 90 || b.x >= width / 2 + 90).toBe(true);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(hits(boxes[i], boxes[j])).toBe(false);
    return out;
  }

  it('0 badges: nothing to place, and no hook slot unless asked', () => {
    const out = expectSane(0, false);
    expect(out.slots).toEqual([]);
    expect(out.overflow).toBe(0);
    expect(out.hook).toBeNull();
  });

  it('3 badges: big calm rosettes, all placed, and a reserved hook fits as well', () => {
    const out = expectSane(3, false);
    expect(out.size).toBe(FENCE_PEG_SIZES[0]);
    expect(out.slots).toHaveLength(3);
    expect(out.overflow).toBe(0);
    const withHook = expectSane(3, true);
    expect(withHook.slots).toHaveLength(3);
    expect(withHook.hook).not.toBeNull();
  });

  it('a full fence (15 badges plus the hook) keeps the rosettes at 22 pt or more on a normal phone', () => {
    const out = expectSane(15, true);
    expect(out.slots).toHaveLength(15);
    expect(out.overflow).toBe(0);
    expect(out.size).toBeGreaterThanOrEqual(22);
    expect(out.hook).not.toBeNull();
  });

  it('up to 18 badges fit at 22 pt or more when the phone is 390 pt wide or more', () => {
    for (const width of [390, 411, 430]) {
      const out = expectSane(18, false, { width });
      expect(out.overflow).toBe(0);
      expect(out.size).toBeGreaterThanOrEqual(22);
    }
  });

  it('badges use both halves of the fence, in at most three rows', () => {
    const out = expectSane(15, false);
    const size = out.size;
    expect(out.slots.some((s) => s.x + size / 2 < 195)).toBe(true);
    expect(out.slots.some((s) => s.x + size / 2 > 195)).toBe(true);
    const rows = new Set(out.slots.map((s) => Math.round((layout.fenceBottom - s.y) / (size + 4))));
    expect(rows.size).toBeLessThanOrEqual(3);
  });

  it('a narrow phone shrinks the pegs further instead of overlapping', () => {
    const out = expectSane(15, true, { width: 360 });
    expect(out.slots.length + out.overflow).toBe(15);
  });

  it('beyond capacity the overflow is reported instead of drawn', () => {
    const out = expectSane(40, true);
    expect(out.size).toBe(FENCE_PEG_SIZES[FENCE_PEG_SIZES.length - 1]);
    expect(out.slots.length + out.overflow).toBe(40);
    expect(out.overflow).toBeGreaterThan(0);
  });
});

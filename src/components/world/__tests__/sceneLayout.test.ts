import { BUILDING_SIZE, SPRITE_GROUND_Y_FRAC } from '../../den/YardScene';
import { BOTTOM_ROW_H, BUILDING_SLOTS, HINT_H, PANEL_ROOM, buildingSelectOffset, buildingsLayout, gateVisibleAtStart, sceneLayout, viertelScrollTarget, worldYardLayout } from '../sceneLayout';
import { dayPhaseForHour, skyTintForPhase } from '../timeOfDay';

// [window height, safe-area top]: small Android, iPhone SE-ish, iPhone 14, tall Pixel/Pro Max
const phones: Array<[number, number]> = [
  [640, 24],
  [667, 20],
  [844, 47],
  [932, 59],
];

describe('sceneLayout', () => {

  it.each(phones)('the gate is visible at the opening scroll without scrolling (%d tall, inset %d)', (h, inset) => {
    const l = sceneLayout(h, 390, inset);
    expect(gateVisibleAtStart(l)).toBe(true);
    expect(l.gateSignTopInViewport).toBeGreaterThanOrEqual(inset);
    // the opening offset shows the Hof (the tail) exactly; the buildings page hangs below it
    expect(l.buildingsTop - l.startOffset).toBe(h);
  });

  it('the yard keeps a usable height on a short phone', () => {
    expect(sceneLayout(568, 320, 20).yardH).toBeGreaterThanOrEqual(300);
  });

  it('keeps the gate on screen no matter how tall the window is (the yard grows downward)', () => {
    const tall = sceneLayout(1200, 390, 47);
    expect(tall.gateSignTopInViewport).toBe(sceneLayout(844, 390, 47).gateSignTopInViewport);
  });

  it('the Viertel scroll target is inside the scroll range', () => {
    const l = sceneLayout(844, 390, 47);
    const y = viertelScrollTarget(l);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(l.startOffset);
  });
});

describe('buildings page', () => {
  it.each(phones)('hangs one page below the Hof, reachable by scrolling (%d tall, inset %d)', (h, inset) => {
    const l = sceneLayout(h, 390, inset);
    expect(l.buildingsTop).toBe(l.tailTop + l.hofTop + l.hofH);
    expect(l.buildingsPageH).toBeGreaterThanOrEqual(h);
    expect(l.buildingsH).toBe(l.buildingsPageH + PANEL_ROOM);
    expect(l.contentH).toBe(l.buildingsTop + l.buildingsH);
    expect(l.buildingsOffset).toBe(l.contentH - PANEL_ROOM - h);
    expect(l.buildingsOffset).toBeGreaterThan(l.startOffset);
    // the page shows at the end of the scroll range, and the opening offset still lands on the Hof
    expect(l.startOffset).toBe(l.buildingsTop - h);
  });

  it('puts the "down to the buildings" strip at the bottom of the Hof, inside the opening viewport', () => {
    const l = sceneLayout(844, 390, 47, 34);
    expect(l.hintDownTop + HINT_H + 34).toBe(l.hofH); // above the home indicator
    expect(l.tailTop + l.hofTop + l.hintDownTop + HINT_H + 34 - l.startOffset).toBe(844);
    // clear of the bowl sign (row-relative 96..166)
    expect(l.hintDownTop - l.bottomRowTop).toBeGreaterThanOrEqual(166);
    expect(BOTTOM_ROW_H).toBeGreaterThanOrEqual(166 + HINT_H + 34);
  });

  const levelsToWidth: Array<[number, number]> = [[360, 24], [390, 47], [430, 59]];
  it.each(levelsToWidth)('every building shares one size and stands on its slot ground point, on screen (width %d)', (width, inset) => {
    const b = buildingsLayout(width, inset, 844);
    for (const k of ['doghouse', 'bakery', 'sniffGarden'] as const) {
      const w = b.world[k];
      expect(w.sprite.size).toBe(BUILDING_SIZE);
      expect(w.sprite.left).toBeGreaterThanOrEqual(-0.07 * BUILDING_SIZE - 0.001);
      expect(w.sprite.left + w.sprite.size).toBeLessThanOrEqual(width + 0.07 * BUILDING_SIZE + 0.001);
    }
    // each sprite's ground point (0.5, 0.69 of the canvas) is its slot's (jittered) ground point
    const ground = (k: 'doghouse' | 'bakery' | 'sniffGarden') => b.world[k].sprite.top + SPRITE_GROUND_Y_FRAC * BUILDING_SIZE;
    expect(ground('doghouse')).toBeCloseTo(b.slots[0].groundY, 5);
    expect(ground('bakery')).toBeCloseTo(b.slots[1].groundY, 5);
    expect(ground('sniffGarden')).toBeCloseTo(b.slots[2].groundY, 5);
    // organic, not a grid: the two buildings of row 1 do not share a ground line, but stay within a row-pitch fraction of it
    expect(Math.abs(b.slots[0].groundY - b.slots[1].groundY)).toBeGreaterThan(10);
    expect(Math.abs(b.slots[0].groundY - b.slots[1].groundY)).toBeLessThan(0.25 * BUILDING_SIZE);
    // a column's lower slot never rises above the upper one, so the upper sign still ends above the next roof
    expect(b.slots[2].groundY - b.slots[0].groundY).toBeGreaterThanOrEqual(b.rowGroundY[1] - b.rowGroundY[0]);
    // the two neighbours of a row do not overlap by more than their transparent margins
    expect(b.world.bakery.sprite.left - (b.world.doghouse.sprite.left + BUILDING_SIZE)).toBeGreaterThan(-0.2 * BUILDING_SIZE);
  });

  it('keeps a 4th, empty slot for the Friend Lounge that draws nothing, and the first row clear of the back strip', () => {
    expect(BUILDING_SLOTS).toHaveLength(4);
    expect(BUILDING_SLOTS[3]).toBeNull();
    const b = buildingsLayout(390, 47, 844);
    expect(b.slots[3].key).toBeNull();
    expect(Object.keys(b.world)).toHaveLength(3);
    expect(b.world.doghouse.sprite.top + 0.1 * BUILDING_SIZE).toBeGreaterThan(b.backTop + HINT_H - 0.001);
  });

  it('opening a row-2 building scrolls it above the docked panel; row 1 stays at the page', () => {
    for (const [h, inset] of [[667, 20], [740, 24], [844, 47]] as Array<[number, number]>) {
      const l = sceneLayout(h, 390, inset, 34);
      const b = buildingsLayout(390, inset, l.buildingsPageH);
      expect(buildingSelectOffset(l, b, 'doghouse')).toBeGreaterThanOrEqual(l.buildingsOffset);
      const y = buildingSelectOffset(l, b, 'sniffGarden');
      const signBottomOnScreen = l.buildingsTop + b.world.sniffGarden.signTop + 64 - y;
      expect(signBottomOnScreen).toBeLessThanOrEqual(h - PANEL_ROOM + 0.001);
      expect(y).toBeLessThanOrEqual(l.contentH - h);
    }
    const l = sceneLayout(667, 390, 20, 34);
    const b = buildingsLayout(390, 20, l.buildingsPageH);
    expect(buildingSelectOffset(l, b, 'sniffGarden')).toBeGreaterThan(l.buildingsOffset);
  });

  it('hangs each sign below the baked shadow (>= 0.25 S under the ground line)', () => {
    const b = buildingsLayout(390, 47, 844);
    expect(b.world.doghouse.signTop - b.slots[0].groundY).toBeGreaterThanOrEqual(0.25 * 206 - 0.001);
  });

  it('keeps both rows and their signs inside the page, also on a short phone', () => {
    const l = sceneLayout(640, 390, 24);
    const b = buildingsLayout(390, 24, l.buildingsPageH);
    for (const k of ['doghouse', 'bakery', 'sniffGarden'] as const) {
      expect(b.world[k].signTop + 64).toBeLessThanOrEqual(l.buildingsPageH);
    }
  });
});

describe('worldYardLayout', () => {
  it('rests Buddy in the middle of the yard on his mat, inside it, with the Extras anchored on fixed Hof points', () => {
    const y = worldYardLayout(390, 405);
    expect(y.buddy.bottom + y.buddy.size).toBeLessThanOrEqual(405);
    const top = 405 - y.buddy.bottom - y.buddy.size;
    expect(Math.abs(top + y.buddy.size / 2 - 405 / 2)).toBeLessThanOrEqual(1);
    expect(y.gateRise).toBeGreaterThan(top);
    expect(y.feetY).toBeGreaterThan(y.doormat.top);
    expect(y.extras.teaBaseY).toBeLessThan(405);
    expect(y.doormat.width).toBeGreaterThan(0);
  });
});

describe('time of day', () => {
  it('maps hours to phases', () => {
    expect([5, 6, 9, 10, 16, 17, 20, 21, 0].map(dayPhaseForHour)).toEqual([
      'night', 'morning', 'morning', 'day', 'day', 'evening', 'evening', 'night', 'night',
    ]);
  });
  it('leaves the day sky untinted and tints the others', () => {
    expect(skyTintForPhase('day').color).toBeNull();
    for (const p of ['morning', 'evening', 'night'] as const) expect(skyTintForPhase(p).color).not.toBeNull();
  });
});

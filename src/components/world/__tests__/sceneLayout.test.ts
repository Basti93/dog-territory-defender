import { gateVisibleAtStart, sceneLayout, viertelScrollTarget, worldYardLayout } from '../sceneLayout';
import { dayPhaseForHour, skyTintForPhase } from '../timeOfDay';

describe('sceneLayout', () => {
  // [window height, safe-area top]: small Android, iPhone SE-ish, iPhone 14, tall Pixel/Pro Max
  const phones: Array<[number, number]> = [
    [640, 24],
    [667, 20],
    [844, 47],
    [932, 59],
  ];

  it.each(phones)('the gate is visible at the opening scroll without scrolling (%d tall, inset %d)', (h, inset) => {
    const l = sceneLayout(h, 390, inset);
    expect(gateVisibleAtStart(l)).toBe(true);
    expect(l.gateSignTopInViewport).toBeGreaterThanOrEqual(inset);
    // the opening offset shows the bottom of the content: the tail fills the window exactly
    expect(l.contentH - l.startOffset).toBe(h);
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

describe('worldYardLayout', () => {
  const levels = { doghouse: 1, bakery: 1, sniffGarden: 1 };
  it('rests Buddy at the top of the yard, above every building tile', () => {
    const y = worldYardLayout(390, 405, levels);
    const buddyBottomEdge = y.buddy.bottom; // px up from the yard floor
    for (const k of ['doghouse', 'bakery', 'sniffGarden'] as const) {
      expect(y.hits[k].bottom + y.hits[k].height).toBeLessThan(buddyBottomEdge);
    }
  });

  it('building hit boxes never overlap Buddy', () => {
    const y = worldYardLayout(390, 405, { doghouse: 12, bakery: 12, sniffGarden: 12 });
    for (const k of ['doghouse', 'bakery', 'sniffGarden'] as const) {
      const h = y.hits[k];
      const overlapsY = h.bottom < y.buddy.bottom + y.buddy.size && h.bottom + h.height > y.buddy.bottom;
      const overlapsX = h.left < y.buddy.left + y.buddy.size && h.left + h.width > y.buddy.left;
      expect(overlapsY && overlapsX).toBe(false);
    }
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

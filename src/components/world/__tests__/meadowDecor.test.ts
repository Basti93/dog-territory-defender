import { BUILDING_SIZE } from '../../den/YardScene';
import { hofDecor, meadowLayout } from '../meadowDecor';
import { buildingsLayout, sceneLayout, worldYardLayout } from '../sceneLayout';

describe('meadowDecor', () => {
  const l = sceneLayout(844, 390, 47, 34);
  const b = buildingsLayout(390, 47, l.buildingsPageH);

  it('is deterministic: the same window gives the same meadow', () => {
    expect(meadowLayout(390, l.buildingsH, b)).toEqual(meadowLayout(390, l.buildingsH, b));
  });

  it('keeps the scattered props off the buildings, their signs and the reserved Friend Lounge slot', () => {
    const m = meadowLayout(390, l.buildingsH, b);
    const S = BUILDING_SIZE;
    const body = (s: { cx: number; groundY: number }) => ({ l: s.cx - 0.5 * S, r: s.cx + 0.5 * S, t: s.groundY - 0.6 * S, b: s.groundY + 0.25 * S });
    const small = m.items.filter((i) => ['meadow-flowers', 'meadow-tuft', 'meadow-stones'].includes(i.art) && i.width < 70);
    expect(small.length).toBeGreaterThan(8);
    for (const slot of b.slots) {
      const r = body(slot);
      for (const it of small) {
        const overlaps = it.left < r.r && it.left + it.width > r.l && it.top < r.b && it.top + it.height > r.t;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('has a fade and a hedge row at the top of the page, and paths between the slots', () => {
    const m = meadowLayout(390, l.buildingsH, b);
    expect(m.fadeH).toBeGreaterThan(80);
    expect(m.hedges).toHaveLength(2);
    expect(m.patches.filter((p) => p.kind === 'path').length).toBeGreaterThan(8);
  });

  it('keeps the Hof decor inside the yard, on screen width, and off the yard bottom row', () => {
    for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
      const sl = sceneLayout(h, w, 40, 0);
      const y = worldYardLayout(w, sl.yardH);
      for (const it of hofDecor(w, sl.yardH, y.feetY)) {
        expect(it.top).toBeGreaterThan(0);
        expect(it.top + it.height).toBeLessThanOrEqual(sl.yardH + 4);
        expect(it.left + it.width).toBeGreaterThan(0);
        expect(it.left).toBeLessThan(w);
      }
    }
  });
});

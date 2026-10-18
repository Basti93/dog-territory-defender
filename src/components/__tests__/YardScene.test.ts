import { YARD_MIN_HEIGHT, yardLayout, yardWalkGeometry } from '../den/YardScene';

const STAGE_3 = { doghouse: 260, bakery: 260, sniffGarden: 260 };

describe('yardLayout (stage 3, min yard height)', () => {
  for (const width of [360, 390]) {
    const L = yardLayout(width, YARD_MIN_HEIGHT, STAGE_3);

    it(`keeps buildings on screen (side ones may overlap an edge by <=10%) at width ${width}`, () => {
      for (const box of Object.values(L.sprites)) {
        expect(box.left).toBeGreaterThanOrEqual(-0.1 * box.size - 0.001);
        expect(box.left + box.size).toBeLessThanOrEqual(width + 0.1 * box.size + 0.001);
      }
    });

    it(`covers the bottom 0.78H with a 2:1 hill that bleeds past both sides at width ${width}`, () => {
      const H = YARD_MIN_HEIGHT;
      const g = L.ground;
      expect(g.top + g.height).toBeCloseTo(H, 3);
      expect(g.height).toBeGreaterThanOrEqual(0.78 * H - 0.001);
      expect(g.width).toBeCloseTo(2 * g.height, 3);
      expect(g.left).toBeCloseTo((width - g.width) / 2, 3);
      expect(g.left).toBeLessThan(0);
      expect(g.left + g.width).toBeGreaterThan(width);
      expect(g.width).toBeGreaterThanOrEqual(1.25 * width - 0.001);
    });

    it(`puts the horizon near 0.42H and every tile base on the grass, inside the yard at width ${width}`, () => {
      const H = YARD_MIN_HEIGHT;
      expect(L.ground.horizonY).toBeGreaterThanOrEqual(0.38 * H);
      expect(L.ground.horizonY).toBeLessThanOrEqual(0.46 * H);
      for (const box of Object.values(L.sprites)) {
        const baseFromTop = H - box.bottom - 0.14 * box.size;
        expect(baseFromTop).toBeGreaterThan(L.ground.horizonY);
        expect(baseFromTop).toBeLessThanOrEqual(H);
      }
    });

    it(`keeps building hit boxes in their sprite's lower half and clear of Buddy at width ${width}`, () => {
      for (const key of ['doghouse', 'bakery', 'sniffGarden'] as const) {
        const hit = L.hits[key];
        const sprite = L.sprites[key];
        expect(hit.width).toBeGreaterThan(20);
        expect(hit.bottom).toBeGreaterThanOrEqual(sprite.bottom - 0.001);
        expect(hit.bottom + hit.height).toBeLessThanOrEqual(sprite.bottom + 0.5 * sprite.size + 0.001);
        expect(hit.left).toBeGreaterThanOrEqual(sprite.left - 0.001);
        expect(hit.left + hit.width).toBeLessThanOrEqual(sprite.left + sprite.size + 0.001);
        const apart =
          hit.left + hit.width <= L.buddy.left + 0.001 ||
          hit.left >= L.buddy.left + L.buddy.size - 0.001 ||
          hit.bottom + hit.height <= L.buddy.bottom + 0.001 ||
          hit.bottom >= L.buddy.bottom + L.buddy.size - 0.001;
        expect(apart).toBe(true);
      }
    });

    it(`keeps Buddy's whole box inside the yard at width ${width}`, () => {
      expect(L.buddy.bottom).toBeGreaterThanOrEqual(0);
      expect(L.buddy.bottom + L.buddy.size).toBeLessThanOrEqual(YARD_MIN_HEIGHT);
      expect(L.buddy.left).toBeGreaterThanOrEqual(0);
      expect(L.buddy.left + L.buddy.size).toBeLessThanOrEqual(width);
    });

    it(`keeps the doghouse badge off Buddy's head at width ${width}`, () => {
      // Head = top 55% of Buddy's box; badge must sit entirely above that box's top edge or beside it.
      const buddyTop = L.buddy.bottom + L.buddy.size;
      const headBottom = buddyTop - 0.55 * L.buddy.size;
      for (const key of ['doghouse', 'bakery', 'sniffGarden'] as const) {
        const badge = L.badges[key];
        const overlapsHeadVertically = badge.bottom < buddyTop && badge.bottom + 28 > headBottom;
        const overlapsHeadHorizontally = badge.left < L.buddy.left + L.buddy.size && badge.left + 72 > L.buddy.left;
        expect(overlapsHeadVertically && overlapsHeadHorizontally).toBe(false);
      }
    });

    it(`keeps every wander spot on the grass, apart from the others, below the doghouse base at width ${width}`, () => {
      const G = yardWalkGeometry(L, width);
      const xs = Object.values(G.spots);
      for (const x of xs) {
        expect(x).toBeGreaterThanOrEqual(G.range.min);
        expect(x).toBeLessThanOrEqual(G.range.max);
      }
      xs.forEach((a, i) => xs.slice(i + 1).forEach((b) => expect(Math.abs(a - b)).toBeGreaterThanOrEqual(25)));
      // Buddy never changes y: his head stays below the doghouse tile base, so he never covers an upper half.
      const doghouseBaseFromTop = YARD_MIN_HEIGHT - L.sprites.doghouse.bottom - 0.14 * L.sprites.doghouse.size;
      const buddyTopFromTop = YARD_MIN_HEIGHT - L.buddy.bottom - L.buddy.size;
      expect(buddyTopFromTop + 0.3 * L.buddy.size).toBeGreaterThan(doghouseBaseFromTop - 0.001);
      expect(G.spots.front).toBeCloseTo(G.baseCx, 5);
    });
  }
});

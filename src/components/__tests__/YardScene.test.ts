import {
  ART_TIER_2_FROM_LEVEL,
  ART_TIER_3_FROM_LEVEL,
  ART_TIER_4_FROM_LEVEL,
  ART_TIER_5_FROM_LEVEL,
  BUILDING_SIZE,
  SPRITE_GROUND_Y_FRAC,
  YARD_MIN_HEIGHT,
  artTierForLevel,
  yardWalkGeometry,
} from '../den/YardScene';
import { worldYardLayout } from '../world/sceneLayout';

describe('Hof layout (min yard height)', () => {
  for (const width of [360, 390]) {
    const L = worldYardLayout(width, YARD_MIN_HEIGHT);

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

    it(`puts the horizon near 0.42H at width ${width}`, () => {
      expect(L.ground.horizonY).toBeGreaterThanOrEqual(0.38 * YARD_MIN_HEIGHT);
      expect(L.ground.horizonY).toBeLessThanOrEqual(0.46 * YARD_MIN_HEIGHT);
    });

    it(`keeps Buddy's whole box inside the yard at width ${width}`, () => {
      expect(L.buddy.bottom).toBeGreaterThanOrEqual(0);
      expect(L.buddy.bottom + L.buddy.size).toBeLessThanOrEqual(YARD_MIN_HEIGHT);
      expect(L.buddy.left).toBeGreaterThanOrEqual(0);
      expect(L.buddy.left + L.buddy.size).toBeLessThanOrEqual(width);
    });

    it(`keeps every wander spot on the grass and apart from the others at width ${width}`, () => {
      const G = yardWalkGeometry(L, width);
      const xs = Object.values(G.spots);
      for (const x of xs) {
        expect(x).toBeGreaterThanOrEqual(G.range.min);
        expect(x).toBeLessThanOrEqual(G.range.max);
      }
      xs.forEach((a, i) => xs.slice(i + 1).forEach((b) => expect(Math.abs(a - b)).toBeGreaterThanOrEqual(25)));
      expect(G.spots.front).toBeCloseTo(G.baseCx, 5);
      // bench on the left, mailbox on the right (where the props are)
      expect(G.spots.bench).toBeLessThan(G.spots.front);
      expect(G.spots.mailbox).toBeGreaterThan(G.spots.front);
    });

    it(`gives the Wild Extras fixed anchors inside the yard at width ${width}`, () => {
      for (const x of [L.extras.daisyCx, L.extras.fireflyCx, L.extras.teaCx]) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(width);
      }
      for (const y of [L.extras.duckBaseY, L.extras.teaBaseY]) {
        expect(y).toBeGreaterThan(L.ground.horizonY);
        expect(y).toBeLessThan(YARD_MIN_HEIGHT);
      }
    });
  }
});

describe('artTierForLevel (five stages)', () => {
  it('uses the logged thresholds 4 / 10 / 20 / 35', () => {
    expect([ART_TIER_2_FROM_LEVEL, ART_TIER_3_FROM_LEVEL, ART_TIER_4_FROM_LEVEL, ART_TIER_5_FROM_LEVEL]).toEqual([4, 10, 20, 35]);
  });

  it('maps every level to its stage at the boundaries', () => {
    const cases: Array<[number, number]> = [[1, 1], [3, 1], [4, 2], [9, 2], [10, 3], [19, 3], [20, 4], [34, 4], [35, 5], [100, 5]];
    for (const [level, tier] of cases) expect(artTierForLevel(level)).toBe(tier);
  });
});

describe('one world scale for the building art', () => {
  it('a stage-5 sprite (widest: 86% of the canvas) fits half a 360 pt page, and the ground point is the baked 0.69', () => {
    expect(BUILDING_SIZE * 0.86).toBeLessThanOrEqual(360 / 2);
    expect(SPRITE_GROUND_Y_FRAC).toBe(0.69);
  });
});

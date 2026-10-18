import { eastwardTrail, TUESDAY_AFTERNOON } from '../../test/postcardFixtures';
import type { Location } from '../../types';
import { MAX_THUMB_POINTS, simplifiedTrail, trailDrawing } from '../trailPath';

describe('simplifiedTrail', () => {
  it('keeps a short trail as it is', () => {
    const runs = simplifiedTrail(eastwardTrail(TUESDAY_AFTERNOON, 20));
    expect(runs.flat().length).toBeLessThanOrEqual(20);
    expect(runs.flat().length).toBeGreaterThan(2);
  });

  it('reduces a long wiggly trail to at most 60 points and keeps both ends', () => {
    const trail = eastwardTrail(TUESDAY_AFTERNOON, 2000, 0.00002);
    const runs = simplifiedTrail(trail);
    const points = runs.flat();
    expect(points.length).toBeLessThanOrEqual(MAX_THUMB_POINTS);
    expect(points.length).toBeGreaterThan(10);
    expect(runs).toHaveLength(1);
  });

  it('cuts at gaps instead of drawing a line across a jump', () => {
    const a = eastwardTrail(TUESDAY_AFTERNOON, 40);
    const b = eastwardTrail(TUESDAY_AFTERNOON + 200_000, 40, 0.00004, 52.6, 13.5); // ~11 km away
    const runs = simplifiedTrail([...a, ...b]);
    expect(runs).toHaveLength(2);
    expect(runs.flat().length).toBeLessThanOrEqual(MAX_THUMB_POINTS);
  });

  it('never exceeds the budget even with many fragments', () => {
    const fragments: Location[] = [];
    for (let k = 0; k < 80; k++) fragments.push(...eastwardTrail(TUESDAY_AFTERNOON + k * 400_000, 6, 0.00004, 52.5 + k * 0.01, 13.4));
    expect(simplifiedTrail(fragments).flat().length).toBeLessThanOrEqual(MAX_THUMB_POINTS);
  });

  it('returns nothing for no fixes and a dot for one fix', () => {
    expect(simplifiedTrail([])).toEqual([]);
    expect(simplifiedTrail(eastwardTrail(TUESDAY_AFTERNOON, 1)).flat()).toHaveLength(1);
  });
});

describe('trailDrawing', () => {
  it('fits the drawing inside the box with padding', () => {
    const drawing = trailDrawing(eastwardTrail(TUESDAY_AFTERNOON, 300), 120, 80, 8);
    const numbers = drawing.paths.join(' ').match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(7.9);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(112.1);
    expect(drawing.start).not.toBeNull();
    expect(drawing.pointCount).toBeLessThanOrEqual(MAX_THUMB_POINTS);
  });

  it('is empty for an empty trail', () => {
    expect(trailDrawing([], 100, 60, 4)).toEqual({ paths: [], start: null, pointCount: 0 });
  });
});

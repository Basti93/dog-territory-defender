import { Cell } from '../../storage/HomeRangeRepository';
import { EMBEDDED_MAX_CELLS_H, EMBEDDED_MAX_CELLS_W, embeddedFitFrame, embeddedRangeFrame } from '../embeddedFit';

const cell = (ix: number, iy: number, lastRefreshed = 1000): Cell => ({ ix, iy, lastRefreshed, lastTracked: lastRefreshed, visits: 1, territoryId: null });
const block = (ix0: number, iy0: number, w: number, h: number, lastRefreshed: number): Cell[] => {
  const out: Cell[] = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) out.push(cell(ix0 + x, iy0 + y, lastRefreshed));
  return out;
};

describe('embeddedRangeFrame', () => {
  it('is null without cells', () => {
    expect(embeddedRangeFrame([])).toBeNull();
  });

  it('frames a single cluster exactly', () => {
    expect(embeddedRangeFrame(block(100, 200, 10, 8, 5))).toEqual({ origin: [100, 200], w: 10, h: 8 });
  });

  it('leaves a far-away cluster out of the frame (never the whole city) and anchors on the newest paint', () => {
    const near = block(100, 100, 12, 12, 9000);
    const far = block(100 + 400, 100 + 300, 5, 5, 100);
    expect(embeddedRangeFrame([...far, ...near])).toEqual({ origin: [100, 100], w: 12, h: 12 });
    // newest paint far away -> the far cluster is the anchor instead
    const newestFar = block(100 + 400, 100 + 300, 5, 5, 99999);
    expect(embeddedRangeFrame([...newestFar, ...near])).toEqual({ origin: [500, 400], w: 5, h: 5 });
  });

  it('adds a nearby second cluster when everything still fits at zoom 15', () => {
    const a = block(100, 100, 8, 8, 9000);
    const b = block(130, 105, 8, 8, 100);
    expect(embeddedRangeFrame([...a, ...b])).toEqual({ origin: [100, 100], w: 38, h: 13 });
  });

  it('crops one huge cluster to a window around the newest cell', () => {
    const huge = block(0, 0, 200, 200, 1);
    huge.push(cell(120, 90, 5000));
    const frame = embeddedRangeFrame(huge)!;
    expect(frame.w).toBeLessThanOrEqual(EMBEDDED_MAX_CELLS_W);
    expect(frame.h).toBeLessThanOrEqual(EMBEDDED_MAX_CELLS_H);
    expect(frame.origin[0]).toBeLessThanOrEqual(120);
    expect(frame.origin[0] + frame.w).toBeGreaterThan(120);
    expect(frame.origin[1]).toBeLessThanOrEqual(90);
    expect(frame.origin[1] + frame.h).toBeGreaterThan(90);
  });
});

describe('embeddedFitFrame', () => {
  it('keeps our Range frame when no extra fits, and widens it for a nearby neighbour', () => {
    const cells = block(100, 100, 20, 20, 10);
    expect(embeddedFitFrame(cells, [])).toEqual({ origin: [100, 100], w: 20, h: 20 });
    const neighbour = { id: 'b', name: 'Momo', cells: [{ ix: 130, iy: 110 }], label: { ix: 130, iy: 110 } };
    expect(embeddedFitFrame(cells, [neighbour])).toEqual({ origin: [100, 100], w: 31, h: 20 });
  });
});

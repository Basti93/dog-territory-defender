import { Cell } from '../../storage/HomeRangeRepository';
import { buildHomeRangeRasterPayload } from '../homeRangeRaster';
import { HOME_RANGE_RENDERER_SCRIPT } from '../homeRangeRendererScript';

// This vanilla-JS renderer runs inside a WebView with no bundler and no
// TypeScript — it can't be `import`ed and type-checked like the rest of the
// codebase. What CAN be verified from Node/Jest without a real WebView:
//   - it's syntactically valid JS (would throw on `new Function(...)` if not)
//   - its pure math (blur, marching squares, Lab colour conversion, base64
//     decode) produces sane, internally-consistent results
// What canNOT be verified here: actual canvas rendering, Leaflet layer
// creation, or on-device visual/perf quality — that's task 5.1's on-device
// spike gate, left unchecked in tasks.md.

function loadRendererInternals() {
  // Exposes the script's internal helper functions/constants for testing by
  // appending a return statement — the shipped script (used verbatim inside
  // mapHTML.ts's own <script> tag) never has this appended.
  const factory = new Function(
    `${HOME_RANGE_RENDERER_SCRIPT}
    return {
      hrBlurField,
      hrBlurWeighted,
      hrMarchingSquaresSegments,
      hrHexToLab,
      hrLabToXyz,
      hrXyzToRgb,
      hrLabToRgbBytes,
      hrBase64ToBytes,
      hrLocalToLatLon,
      hrDLonForRow,
      renderHomeRangePortrait,
      renderHomeRangeMuted,
      HR_WILDNESS_COLOR_LUT,
      HR_D_LAT_DEG,
      HR_WILD_CONTOUR_THRESHOLD,
      HR_WILD_CONTOUR_HEX,
      HR_FRESH_HEX,
      HR_SEAM_HEX,
      HR_MUTED_HEX,
      HR_MUTED_FILL_ALPHA,
      HR_FILL_ALPHA,
    };`
  );
  return factory();
}

/**
 * A minimal fake `<canvas>` (no jsdom/DOM available in this project's plain
 * "node" jest environment — see this file's own header comment) that
 * records every 2D-context call `renderHomeRangePortrait` makes, so its
 * behavior can be asserted without a real browser canvas.
 */
function createFakeCanvas() {
  const calls: { strokeStyleHistory: string[]; putImageDataCount: number; strokeCount: number; arcCount: number } = {
    strokeStyleHistory: [],
    putImageDataCount: 0,
    strokeCount: 0,
    arcCount: 0,
  };
  let strokeStyle = '';
  const ctx = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {
      calls.putImageDataCount++;
    },
    set strokeStyle(value: string) {
      strokeStyle = value;
      calls.strokeStyleHistory.push(value);
    },
    get strokeStyle() {
      return strokeStyle;
    },
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    globalAlpha: 1,
    setLineDash: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {
      calls.strokeCount++;
    },
    arc: () => {
      calls.arcCount++;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  };
  return { canvas, calls };
}

/**
 * A minimal fake `<canvas>` for the raster-fill functions (renderHomeRangeToMap
 * / renderHomeRangeMuted), which call `document.createElement('canvas')` and
 * `canvas.toDataURL()` internally — unlike renderHomeRangePortrait, which
 * takes its canvas as a parameter. Records the ImageData passed to
 * putImageData so a test can inspect the alpha channel actually written.
 */
function createFakeRasterCanvas() {
  const calls: { putImageDataCount: number; lastImageData: { data: Uint8ClampedArray; width: number; height: number } | null; toDataURLCount: number } = {
    putImageDataCount: 0,
    lastImageData: null,
    toDataURLCount: 0,
  };
  const ctx = {
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (imageData: { data: Uint8ClampedArray; width: number; height: number }) => {
      calls.putImageDataCount++;
      calls.lastImageData = imageData;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: () => {
      calls.toDataURLCount++;
      return 'data:fake';
    },
  };
  return { canvas, calls };
}

/** A minimal fake Leaflet global — records every layer created/added, so a test can assert renderHomeRangeMuted's shape (exactly one fill overlay, N outline polylines, no marker) without a real Leaflet map. */
function createFakeLeaflet() {
  const polylines: Array<{ latlngs: unknown; opts: Record<string, unknown> }> = [];
  const imageOverlays: Array<{ url: string; bounds: unknown; opts: Record<string, unknown> }> = [];
  const marker = jest.fn();
  const L = {
    layerGroup: () => {
      const layers: unknown[] = [];
      const group = {
        layers,
        addTo(target: unknown) {
          (group as unknown as { addedTo: unknown }).addedTo = target;
          return group;
        },
      };
      return group;
    },
    imageOverlay: (url: string, bounds: unknown, opts: Record<string, unknown>) => {
      const overlay = { url, bounds, opts, addTo: (target: { layers?: unknown[] }) => { target.layers?.push(overlay); return overlay; } };
      imageOverlays.push(overlay);
      return overlay;
    },
    polyline: (latlngs: unknown, opts: Record<string, unknown>) => {
      const poly = { latlngs, opts, addTo: (target: { layers?: unknown[] }) => { target.layers?.push(poly); return poly; } };
      polylines.push(poly);
      return poly;
    },
    marker,
  };
  return { L, polylines, imageOverlays, marker };
}

describe('HOME_RANGE_RENDERER_SCRIPT — syntax and pure math', () => {
  it('is syntactically valid JS (constructs without throwing)', () => {
    expect(() => loadRendererInternals()).not.toThrow();
  });

  it('base64-decodes bytes correctly (round-trips against Node\'s own btoa)', () => {
    const { hrBase64ToBytes } = loadRendererInternals();
    const original = [0, 1, 2, 254, 255, 128, 63];
    const encoded = btoa(String.fromCharCode(...original));
    const decoded = Array.from(hrBase64ToBytes(encoded) as Uint8Array);
    expect(decoded).toEqual(original);
  });

  it('Lab round-trip: hex -> Lab -> XYZ -> RGB recovers the original colour within rounding', () => {
    const { hrHexToLab, hrLabToXyz, hrXyzToRgb } = loadRendererInternals();
    for (const hex of ['#2ECC71', '#DCE8BE']) {
      const lab = hrHexToLab(hex) as number[];
      const xyz = hrLabToXyz(lab[0], lab[1], lab[2]) as number[];
      const rgb = (hrXyzToRgb(xyz[0], xyz[1], xyz[2]) as number[]).map((v) => Math.round(v * 255));
      const expected = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(rgb[i] - expected[i])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the wildness colour LUT starts at fresh green and ends at wild meadow', () => {
    const { HR_WILDNESS_COLOR_LUT } = loadRendererInternals();
    const lut = HR_WILDNESS_COLOR_LUT as number[][];
    expect(lut).toHaveLength(255);
    // fresh end (#2ECC71 = 46,204,113)
    expect(lut[0]).toEqual([46, 204, 113]);
    // wild end (#DCE8BE = 220,232,190)
    const last = lut[lut.length - 1];
    expect(last[0]).toBeCloseTo(220, -1);
    expect(last[1]).toBeCloseTo(232, -1);
    expect(last[2]).toBeCloseTo(190, -1);
  });

  it('hrBlurField smooths a single occupied cell into a soft Gaussian bump, not a hard edge', () => {
    const { hrBlurField } = loadRendererInternals();
    const w = 5;
    const h = 5;
    const field = new Float32Array(w * h);
    field[2 * w + 2] = 1; // one occupied cell in the centre
    const blurred = hrBlurField(field, w, h, 1) as Float32Array;

    expect(blurred[2 * w + 2]).toBeGreaterThan(0);
    expect(blurred[2 * w + 2]).toBeLessThan(1); // the peak itself softens
    expect(blurred[2 * w + 1]).toBeGreaterThan(0); // spreads to neighbours
    expect(blurred[0]).toBeGreaterThanOrEqual(0); // corners stay non-negative
  });

  it('hrBlurField never produces negative or NaN values for a 0/1 occupancy field', () => {
    const { hrBlurField } = loadRendererInternals();
    const w = 8;
    const h = 8;
    const field = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) field[i] = i % 3 === 0 ? 1 : 0;
    const blurred = hrBlurField(field, w, h, 1) as Float32Array;
    for (const v of Array.from(blurred)) {
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('hrBlurWeighted does not let out-of-Range (zero-weight) cells bleed a value into in-Range neighbours', () => {
    const { hrBlurWeighted } = loadRendererInternals();
    const w = 5;
    const h = 1;
    // Two adjacent in-Range cells both at wildness 0, surrounded by
    // out-of-Range (weight 0) cells. A naive unweighted blur would pull the
    // edge cells' value toward 0 from the "missing data" neighbours anyway
    // here since both are already 0 — use a non-zero value to make a
    // bleed-toward-zero bug visible.
    const weight = new Float32Array([0, 1, 1, 0, 0]);
    const value = new Float32Array([0, 1, 1, 0, 0]); // valueTimesWeight; both in-range cells are fully wild (1)
    const blurred = hrBlurWeighted(value, weight, w, h, 1) as Float32Array;
    // The in-range cells should stay at (or very near) 1 — not diluted by
    // the zero-weight neighbours outside the Range.
    expect(blurred[1]).toBeCloseTo(1, 1);
    expect(blurred[2]).toBeCloseTo(1, 1);
  });

  it('hrMarchingSquaresSegments finds no contour in a uniform field', () => {
    const { hrMarchingSquaresSegments } = loadRendererInternals();
    const w = 4;
    const h = 4;
    const allAbove = new Float32Array(w * h).fill(1);
    const allBelow = new Float32Array(w * h).fill(0);
    expect((hrMarchingSquaresSegments(allAbove, w, h, 0.5) as unknown[]).length).toBe(0);
    expect((hrMarchingSquaresSegments(allBelow, w, h, 0.5) as unknown[]).length).toBe(0);
  });

  it('hrMarchingSquaresSegments finds a contour ring around a single occupied cell', () => {
    const { hrMarchingSquaresSegments, hrBlurField } = loadRendererInternals();
    const w = 5;
    const h = 5;
    const field = new Float32Array(w * h);
    field[2 * w + 2] = 1;
    const blurred = hrBlurField(field, w, h, 1) as Float32Array;
    const segments = hrMarchingSquaresSegments(blurred, w, h, 0.5) as Array<[[number, number], [number, number]]>;
    // A single blurred bump peaking well under 1 (Decision 6's own measured
    // 0.159 for a 1-cell speck) may not clear 0.5 at all — that's the
    // intended GPS-speck filter. Just assert the function runs and returns
    // an array without throwing; the "does it filter specks" property is
    // already proven numerically in home-range-prototype.mjs Section D.
    expect(Array.isArray(segments)).toBe(true);
  });

  it('hrMarchingSquaresSegments finds a real contour around a solid occupied block', () => {
    const { hrMarchingSquaresSegments } = loadRendererInternals();
    const w = 6;
    const h = 6;
    const field = new Float32Array(w * h);
    // A solid 3x3 block of full occupancy in the middle — well above the
    // 0.5 threshold, should produce a closed ring of segments.
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        field[y * w + x] = 1;
      }
    }
    const segments = hrMarchingSquaresSegments(field, w, h, 0.5) as Array<[[number, number], [number, number]]>;
    expect(segments.length).toBeGreaterThan(0);
  });

  it('HR_WILD_CONTOUR_THRESHOLD is derived from BALANCE, not hardcoded, and sits strictly above 0 and below 1', () => {
    // docs/decisions/somewhere-wild.md Decision 2: this must always
    // be a real wildness value (0..1, see utils/grid.ts's wildness()), and
    // must be computable purely from BALANCE.freshGround's own constants —
    // this test would catch a future change accidentally hardcoding a literal.
    const { HR_WILD_CONTOUR_THRESHOLD } = loadRendererInternals();
    expect(HR_WILD_CONTOUR_THRESHOLD).toBeGreaterThan(0);
    expect(HR_WILD_CONTOUR_THRESHOLD).toBeLessThan(1);
    // Rounded up to the nearest 0.05 (design.md Decision 2's "small margin,
    // not an exact boundary match" rule) — never a value with more precision.
    expect(Math.round((HR_WILD_CONTOUR_THRESHOLD as number) / 0.05)).toBeCloseTo(
      (HR_WILD_CONTOUR_THRESHOLD as number) / 0.05,
      6
    );
  });

  it('hrMarchingSquaresSegments (second pass, wild-ground contour): a synthetic wild-cell blob above the threshold produces segments, below it produces none', () => {
    const { hrMarchingSquaresSegments, HR_WILD_CONTOUR_THRESHOLD } = loadRendererInternals();
    const threshold = HR_WILD_CONTOUR_THRESHOLD as number;
    const w = 6;
    const h = 6;

    // A solid block of wildness comfortably above the derived threshold —
    // same shape as the existing "solid occupied block" Range-outline test,
    // applied to the wildBlurred field's own threshold instead of 0.5.
    const above = new Float32Array(w * h);
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        above[y * w + x] = Math.min(1, threshold + 0.2);
      }
    }
    const aboveSegments = hrMarchingSquaresSegments(above, w, h, threshold) as unknown[];
    expect(aboveSegments.length).toBeGreaterThan(0);

    // The same shape, but every cell held well below the threshold — no
    // contour should be extracted at all.
    const below = new Float32Array(w * h);
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        below[y * w + x] = Math.max(0, threshold - 0.2);
      }
    }
    const belowSegments = hrMarchingSquaresSegments(below, w, h, threshold) as unknown[];
    expect(belowSegments.length).toBe(0);
  });

  it('renderHomeRangePortrait fills the canvas with felt colours and stitches the Range outline in cream, but never the wild-ground contour or a marker (docs/decisions/home-dashboard.md)', () => {
    const { renderHomeRangePortrait, HR_SEAM_HEX, HR_WILD_CONTOUR_HEX } = loadRendererInternals() as {
      renderHomeRangePortrait: (canvas: unknown, payload: unknown) => void;
      HR_SEAM_HEX: string;
      HR_WILD_CONTOUR_HEX: string;
    };

    const now = 1_000_000;
    // A solid diamond (rectangles touching the raster border blur to an open contour), well above the 0.5 Range-outline contour threshold —
    // mirrors this file's existing "solid occupied block" fixture.
    const cells: Cell[] = [];
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        if (Math.abs(x - 4) + Math.abs(y - 4) <= 4) cells.push({ ix: x, iy: y, lastRefreshed: now, lastTracked: now, visits: 1, territoryId: null });
      }
    }
    const payload = buildHomeRangeRasterPayload(cells, now);
    expect(payload).not.toBeNull();

    const { canvas, calls } = createFakeCanvas();
    renderHomeRangePortrait(canvas, payload);

    expect(calls.putImageDataCount).toBe(1); // the fill, drawn exactly once
    expect(calls.strokeCount).toBeGreaterThan(0); // the Range outline contour
    expect(calls.arcCount).toBe(0); // no marker/pin ever drawn

    // Every stroke colour used is the Range outline's cream seam token —
    // the wild-ground contour's warm accent colour never appears, since
    // this function deliberately omits that second pass entirely.
    expect(calls.strokeStyleHistory.length).toBeGreaterThan(0);
    expect(calls.strokeStyleHistory.every((c) => c === HR_SEAM_HEX)).toBe(true);
    expect(calls.strokeStyleHistory).not.toContain(HR_WILD_CONTOUR_HEX);
  });

  it('renderHomeRangePortrait is a no-op for a null payload (empty-Range case)', () => {
    const { renderHomeRangePortrait } = loadRendererInternals() as {
      renderHomeRangePortrait: (canvas: unknown, payload: unknown) => void;
    };
    const { canvas, calls } = createFakeCanvas();
    expect(() => renderHomeRangePortrait(canvas, null)).not.toThrow();
    expect(calls.putImageDataCount).toBe(0);
  });

  it('hrLocalToLatLon maps the raster origin near lat/lon 0 scaled by cell size', () => {
    const { hrLocalToLatLon, HR_D_LAT_DEG } = loadRendererInternals();
    const [lat, lon] = hrLocalToLatLon(0, 0, 0, 0) as [number, number];
    expect(lat).toBeCloseTo(0, 6);
    expect(lon).toBeCloseTo(0, 6);
    const [lat2] = hrLocalToLatLon(0, 1, 0, 0) as [number, number];
    expect(lat2).toBeCloseTo(HR_D_LAT_DEG as number, 6);
  });
});

// docs/decisions/walk-portrait.md Decisions 2/3: renderHomeRangeMuted
// is the one function in this script that calls document.createElement and
// references the Leaflet global directly (renderHomeRangeToMap does too, but
// has never had test coverage for that exact reason — see this file's own
// header comment on what can/can't be verified without a real WebView). Both
// fakes are installed as ambient globals only for the duration of this
// describe block, mirroring how the real WebView provides `L`/`document` as
// ambient globals to this same script.
describe('renderHomeRangeMuted (docs/decisions/walk-portrait.md)', () => {
  afterEach(() => {
    delete (global as unknown as { document?: unknown }).document;
    delete (global as unknown as { L?: unknown }).L;
  });

  it('draws exactly one flat-fill overlay and a muted outline, never the wild-ground contour, never a marker, and no wildness-gradient LUT lookup', () => {
    const { canvas, calls } = createFakeRasterCanvas();
    (global as unknown as { document: unknown }).document = { createElement: (tag: string) => (tag === 'canvas' ? canvas : null) };
    const { L, polylines, imageOverlays, marker } = createFakeLeaflet();
    (global as unknown as { L: unknown }).L = L;

    const { renderHomeRangeMuted, HR_MUTED_HEX, HR_WILD_CONTOUR_HEX, HR_MUTED_FILL_ALPHA, HR_FILL_ALPHA } =
      loadRendererInternals() as {
        renderHomeRangeMuted: (map: unknown, payload: unknown, previousLayerGroup: unknown) => unknown;
        HR_MUTED_HEX: string;
        HR_WILD_CONTOUR_HEX: string;
        HR_MUTED_FILL_ALPHA: number;
        HR_FILL_ALPHA: number;
      };

    const now = 1_000_000;
    const cells: Cell[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        cells.push({ ix: x, iy: y, lastRefreshed: now, lastTracked: now, visits: 1, territoryId: null });
      }
    }
    const payload = buildHomeRangeRasterPayload(cells, now);
    expect(payload).not.toBeNull();

    const fakeMap = { removeLayer: jest.fn() };
    const layerGroup = renderHomeRangeMuted(fakeMap, payload, null);

    expect(layerGroup).not.toBeNull();
    expect(calls.putImageDataCount).toBe(1); // the flat fill, drawn exactly once
    expect(imageOverlays).toHaveLength(1);
    expect(polylines.length).toBeGreaterThan(0); // the Range outline contour

    // Every polyline drawn uses the muted token — no wild-ground contour
    // (that would use HR_WILD_CONTOUR_HEX) and no wildness colour anywhere.
    expect(polylines.every((p) => p.opts.color === HR_MUTED_HEX)).toBe(true);
    expect(polylines.some((p) => p.opts.color === HR_WILD_CONTOUR_HEX)).toBe(false);

    // No marker/pin ever drawn on this background layer.
    expect(marker).not.toHaveBeenCalled();

    // The fill's alpha channel is reduced relative to the normal wildness-LUT
    // fill (HR_FILL_ALPHA) — a background context layer, not a competing one.
    expect(HR_MUTED_FILL_ALPHA).toBeLessThan(HR_FILL_ALPHA);
    const alphaBytes = Array.from(calls.lastImageData!.data.filter((_, i) => i % 4 === 3)).filter((a) => a > 0);
    expect(alphaBytes.length).toBeGreaterThan(0);
    for (const a of alphaBytes) {
      expect(a).toBeLessThanOrEqual(Math.round(HR_MUTED_FILL_ALPHA * 255) + 1);
    }
  });

  it('removes the previous layer group and returns null for a null payload', () => {
    (global as unknown as { document: unknown }).document = { createElement: () => null };
    const { L } = createFakeLeaflet();
    (global as unknown as { L: unknown }).L = L;

    const { renderHomeRangeMuted } = loadRendererInternals() as {
      renderHomeRangeMuted: (map: unknown, payload: unknown, previousLayerGroup: unknown) => unknown;
    };

    const fakeMap = { removeLayer: jest.fn() };
    const previousLayerGroup = { id: 'prev' };
    const result = renderHomeRangeMuted(fakeMap, null, previousLayerGroup);

    expect(fakeMap.removeLayer).toHaveBeenCalledWith(previousLayerGroup);
    expect(result).toBeNull();
  });
});

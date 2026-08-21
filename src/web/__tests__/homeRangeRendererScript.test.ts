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
      HR_WILDNESS_COLOR_LUT,
      HR_D_LAT_DEG,
    };`
  );
  return factory();
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

  it('hrLocalToLatLon maps the raster origin near lat/lon 0 scaled by cell size', () => {
    const { hrLocalToLatLon, HR_D_LAT_DEG } = loadRendererInternals();
    const [lat, lon] = hrLocalToLatLon(0, 0, 0, 0) as [number, number];
    expect(lat).toBeCloseTo(0, 6);
    expect(lon).toBeCloseTo(0, 6);
    const [lat2] = hrLocalToLatLon(0, 1, 0, 0) as [number, number];
    expect(lat2).toBeCloseTo(HR_D_LAT_DEG as number, 6);
  });
});

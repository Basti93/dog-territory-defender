// The WebView-side Home Range renderer — Gaussian blur, marching-squares
// contour extraction, Lab colour interpolation, and canvas drawing. See
// docs/decisions/home-range/design.md Decision 6.
//
// This is plain vanilla JS, not TypeScript: it runs inside the WebView's own
// script tag, which has no bundler and no access to anything under src/ at
// runtime. Exported as a raw source string so both mapHTML.ts (the real app)
// and docs/decisions/home-range/rendering-spike.html (the standalone
// dev-only go/no-go spike, tasks.md task 5.1) inject the exact same
// renderer — one canonical copy, not two hand-kept-in-sync ones.
//
// VERIFIED ON A REAL DEVICE: `home-range`'s task 5.1 on-device go/no-go
// spike confirmed this renderer produces soft edges and a plausible fill
// with no grid blockiness (see docs/decisions/2026-08-21-home-range's
// tasks.md). The wild-ground second contour added by
// docs/decisions/somewhere-wild is a second pass of the same already-verified
// hrMarchingSquaresSegments function over the same already-verified
// wildBlurred field, at a different threshold — no new rendering technique.

import { BALANCE } from '../economy/balanceConfig';

/**
 * The wild-threshold bonus must be WILD_MARGIN times the bonus at the Fresh
 * Ground display-suppression floor — not just one rounding step past it.
 * See docs/decisions/somewhere-wild/design.md Decision 2's "Second
 * correction": a bare break-even derivation (no margin) gave a threshold of
 * 0.45 at today's K, a much lower and much less rare bar than intended.
 * Must match src/utils/wildSpot.ts's WILD_MARGIN exactly (same reasoning,
 * duplicated here only because this file can't import that one at WebView
 * runtime).
 */
const WILD_MARGIN = 1.8;

/**
 * The wild-ground contour threshold — see
 * docs/decisions/somewhere-wild/design.md Decision 2. Derived from
 * home-range-rewards' own BALANCE constants (never hardcoded), rounded UP
 * to the nearest 0.05 so there's a WILD_MARGIN-sized margin above the Fresh
 * Ground display-suppression floor, not an exact boundary match, then
 * clamped to [0.60, 0.95] so the derivation can't degrade to "always true"
 * or "impossible" at the extremes of BALANCE.freshGround.k's documented
 * sweep range. If BALANCE.freshGround.k is ever retuned, this recomputes
 * automatically — grep for BALANCE.freshGround.k if you're the one
 * retuning it.
 *
 * Baked into the vanilla-JS string below as a literal number (this file has
 * no bundler/import access at WebView runtime — same reason HR_CELL_M etc.
 * mirror utils/grid.ts's constants as literals rather than importing them).
 */
const WILD_CONTOUR_THRESHOLD = Math.min(
  0.95,
  Math.max(
    0.6,
    Math.ceil(
      (WILD_MARGIN * (BALANCE.freshGround.displayThresholdMultiplier - 1)) / BALANCE.freshGround.k / 0.05
    ) * 0.05
  )
);

export const HOME_RANGE_RENDERER_SCRIPT = `
// ---- constants (mirrors utils/grid.ts and design.md Decision 1/2/6) ----
var HR_CELL_M = 20;
var HR_D_LAT_DEG = HR_CELL_M / 111320;
var HR_BLUR_SIGMA_CELLS = 1;
var HR_CONTOUR_THRESHOLD = 0.5;
// See docs/decisions/somewhere-wild/design.md Decision 2 — derived from
// BALANCE.freshGround.k/displayThresholdMultiplier at build time (this file's
// own WILD_CONTOUR_THRESHOLD constant above), not hardcoded.
var HR_WILD_CONTOUR_THRESHOLD = ${WILD_CONTOUR_THRESHOLD};
// design.md Decision 2 specified 0.28 as a flat floor alpha; real on-device
// testing (rendering-spike.html) found that too faint to read against map
// tiles, so it's raised here — deviation logged, not silently changed.
// Fill alpha ramps with wildness: HR_FILL_ALPHA on fresh ground down to
// HR_FILL_ALPHA_WILD at the wild end, so the Range reads as a soft green field
// on the paler HOT tiles. Muted layer (HR_MUTED_FILL_ALPHA) stays lower still.
var HR_FILL_ALPHA = 0.55;
var HR_FILL_ALPHA_WILD = 0.35;
// Live-map fill mode. 'svg' (default): nested contour polygons drawn as
// L.polygon in an explicit L.svg() renderer — the Android WebView does not
// composite raster elements (<img>/<canvas>) inside Leaflet's transformed
// overlay pane, but SVG vectors render fine. 'canvas': the previous
// viewport-canvas layer (hrCreateCanvasFillLayer), kept to switch back.
// PERF RISK: SVG path cost scales with ring vertex count; for Ranges above
// ~5k cells watch pan/zoom smoothness. smoothFactor lets Leaflet simplify
// rings per zoom; raise it (or drop to 'canvas') if it gets sluggish.
var HR_LIVE_FILL_MODE = 'svg';
// Three nested bands, drawn wild -> fresh. wildness is the LUT sample point
// (1 = wild end #DCE8BE, 0 = fresh end #2ECC71); minFresh is the threshold on
// the freshness field (1 - blurred wildness) masked to inside the outline.
var HR_FILL_BANDS = [
  { wildness: 1.0, opacity: 0.45, minFresh: null },
  { wildness: 0.5, opacity: 0.5, minFresh: 0.3 },
  { wildness: 0.0, opacity: 0.55, minFresh: 0.6 }
];
var HR_OUTLINE_WEIGHT = 2;
var HR_OUTLINE_OPACITY = 0.8;
var HR_OUTSIDE_SENTINEL = 255;
var HR_FRESH_HEX = '#2ECC71';
var HR_WILD_HEX = '#DCE8BE';
// Warm accent design token (visual-design/spec.md) — the second (wild-ground)
// contour stroke colour, distinct from the Range outline's HR_FRESH_HEX.
var HR_WILD_CONTOUR_HEX = '#F39C12';
// Muted grey design token (visual-design/spec.md, formalized by
// docs/decisions/walk-portrait/design.md Decision 3) — the Walk Portrait's
// muted Home Range background context layer's fill and outline colour. No
// wildness gradient, no LUT — a single flat tone.
var HR_MUTED_HEX = '#8A9A8A';
// Reduced relative to HR_FILL_ALPHA's 0.6 above (Decision 3) — a background
// context layer that must not compete with the walk's own trail drawn on
// top of it. First-pass implementer number, not a logged balance threshold.
var HR_MUTED_FILL_ALPHA = 0.35;

function hrDLonForRow(iy) {
  return HR_CELL_M / (111320 * Math.cos((iy + 0.5) * HR_D_LAT_DEG * Math.PI / 180));
}

// ---- sRGB <-> CIE Lab, for interpolating the fresh->wild ramp perceptually
// (design.md measured a naive sRGB lerp costs ~26% of the perceptible
// one-day step — see home-range-prototype.mjs Section A). ----
function hrSrgbToLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function hrLinToSrgb(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function hrHexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}
function hrRgbToXyz(r, g, b) {
  var rl = hrSrgbToLin(r), gl = hrSrgbToLin(g), bl = hrSrgbToLin(b);
  return [
    (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) * 100,
    (0.2126 * rl + 0.7152 * gl + 0.0722 * bl) * 100,
    (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) * 100
  ];
}
function hrXyzToLab(X, Y, Z) {
  var fx = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
  var x = fx(X / 95.047), y = fx(Y / 100), z = fx(Z / 108.883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function hrHexToLab(hex) {
  var rgb = hrHexToRgb(hex);
  var xyz = hrRgbToXyz(rgb[0], rgb[1], rgb[2]);
  return hrXyzToLab(xyz[0], xyz[1], xyz[2]);
}
function hrLabToXyz(L, a, b) {
  var fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  var fInv = function (t) { var t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
  return [fInv(fx) * 95.047, fInv(fy) * 100, fInv(fz) * 108.883];
}
function hrXyzToRgb(X, Y, Z) {
  X /= 100; Y /= 100; Z /= 100;
  var r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  var g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  var b = X * 0.0557 + Y * -0.2040 + Z * 1.0570;
  return [hrLinToSrgb(r), hrLinToSrgb(g), hrLinToSrgb(b)].map(function (v) { return Math.max(0, Math.min(1, v)); });
}
function hrLabToRgbBytes(L, a, b) {
  var xyz = hrLabToXyz(L, a, b);
  var rgb = hrXyzToRgb(xyz[0], xyz[1], xyz[2]);
  return [Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)];
}

// Precomputed once: a 255-entry LUT from wildness byte (0..254) to sRGB,
// Lab-interpolated between the fresh and wild design tokens.
var HR_LAB_FRESH = hrHexToLab(HR_FRESH_HEX);
var HR_LAB_WILD = hrHexToLab(HR_WILD_HEX);
var HR_WILDNESS_COLOR_LUT = (function () {
  var lut = [];
  for (var i = 0; i < 255; i++) {
    var u = i / 254;
    var L = HR_LAB_FRESH[0] + (HR_LAB_WILD[0] - HR_LAB_FRESH[0]) * u;
    var a = HR_LAB_FRESH[1] + (HR_LAB_WILD[1] - HR_LAB_FRESH[1]) * u;
    var b = HR_LAB_FRESH[2] + (HR_LAB_WILD[2] - HR_LAB_FRESH[2]) * u;
    lut.push(hrLabToRgbBytes(L, a, b));
  }
  return lut;
})();

// ---- base64 -> bytes (WebView provides atob) ----
function hrBase64ToBytes(b64) {
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---- Gaussian blur, separable, sigma in cells (design.md Decision 6) ----
function hrGaussianKernel(sigma) {
  var radius = Math.max(1, Math.ceil(sigma * 3));
  var kernel = [];
  var sum = 0;
  for (var i = -radius; i <= radius; i++) {
    var v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  return { kernel: kernel, radius: radius, sum: sum };
}
function hrBlurField(field, w, h, sigma) {
  var k = hrGaussianKernel(sigma);
  var kernel = k.kernel, radius = k.radius, sum = k.sum;
  var tmp = new Float32Array(w * h);
  var out = new Float32Array(w * h);
  var x, y, i, sx, sy, acc;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      acc = 0;
      for (i = -radius; i <= radius; i++) {
        sx = x + i;
        if (sx < 0 || sx >= w) continue;
        acc += field[y * w + sx] * kernel[i + radius];
      }
      tmp[y * w + x] = acc / sum;
    }
  }
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      acc = 0;
      for (i = -radius; i <= radius; i++) {
        sy = y + i;
        if (sy < 0 || sy >= h) continue;
        acc += tmp[sy * w + x] * kernel[i + radius];
      }
      out[y * w + x] = acc / sum;
    }
  }
  return out;
}
// Weighted blur: numerator/denominator both blurred, then divided — keeps
// out-of-Range (sentinel) cells from bleeding an undefined wildness value
// into their in-Range neighbours.
function hrBlurWeighted(valueTimesWeight, weight, w, h, sigma) {
  var num = hrBlurField(valueTimesWeight, w, h, sigma);
  var den = hrBlurField(weight, w, h, sigma);
  var out = new Float32Array(w * h);
  for (var i = 0; i < w * h; i++) out[i] = den[i] > 1e-6 ? num[i] / den[i] : 0;
  return out;
}

// ---- Marching squares (interpolated edges, threshold contour) ----
// Returns line segments in continuous raster-local coordinates. Ambiguous
// cases (5, 10) are split by the 4-corner average, a standard simplification.
function hrMarchingSquaresSegments(field, w, h, threshold) {
  var segments = [];
  function interp(v0, v1) {
    if (Math.abs(v1 - v0) < 1e-6) return 0.5;
    return (threshold - v0) / (v1 - v0);
  }
  for (var y = 0; y < h - 1; y++) {
    for (var x = 0; x < w - 1; x++) {
      var tl = field[y * w + x];
      var tr = field[y * w + x + 1];
      var br = field[(y + 1) * w + x + 1];
      var bl = field[(y + 1) * w + x];

      var caseIndex = 0;
      if (tl >= threshold) caseIndex |= 8;
      if (tr >= threshold) caseIndex |= 4;
      if (br >= threshold) caseIndex |= 2;
      if (bl >= threshold) caseIndex |= 1;
      if (caseIndex === 0 || caseIndex === 15) continue;

      var top = [x + interp(tl, tr), y];
      var right = [x + 1, y + interp(tr, br)];
      var bottom = [x + interp(bl, br), y + 1];
      var left = [x, y + interp(tl, bl)];

      var avg = (tl + tr + br + bl) / 4;

      switch (caseIndex) {
        case 1: segments.push([left, bottom]); break;
        case 2: segments.push([bottom, right]); break;
        case 3: segments.push([left, right]); break;
        case 4: segments.push([top, right]); break;
        case 5:
          if (avg >= threshold) { segments.push([left, top]); segments.push([bottom, right]); }
          else { segments.push([left, bottom]); segments.push([top, right]); }
          break;
        case 6: segments.push([top, bottom]); break;
        case 7: segments.push([left, top]); break;
        case 8: segments.push([left, top]); break;
        case 9: segments.push([top, bottom]); break;
        case 10:
          if (avg >= threshold) { segments.push([top, right]); segments.push([left, bottom]); }
          else { segments.push([left, top]); segments.push([bottom, right]); }
          break;
        case 11: segments.push([top, right]); break;
        case 12: segments.push([left, right]); break;
        case 13: segments.push([bottom, right]); break;
        case 14: segments.push([left, bottom]); break;
      }
    }
  }
  return segments;
}

// Local raster coordinate (u,v), where u=0 is minIx and v=0 is minIy, ->
// [lat, lon]. Uses the same cell-corner convention as the fill image (a
// half-cell / ~10m possible drift between the contour stroke and the fill's
// own edge is an accepted approximation at this rendering scale — see
// homeRangeRendererScript.ts's file-level comment).
function hrLocalToLatLon(u, v, minIx, minIy) {
  var iy = minIy + v;
  var ix = minIx + u;
  var lat = iy * HR_D_LAT_DEG;
  var lon = ix * hrDLonForRow(Math.round(iy));
  return [lat, lon];
}

// ---- Contour segments -> closed rings (with holes) ----
function hrChainRings(segments) {
  function key(p) { return p[0].toFixed(3) + ',' + p[1].toFixed(3); }
  var ends = {};
  var i, k;
  for (i = 0; i < segments.length; i++) {
    for (var e = 0; e < 2; e++) {
      k = key(segments[i][e]);
      (ends[k] = ends[k] || []).push(i);
    }
  }
  var used = new Array(segments.length);
  var rings = [];
  for (i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    var ring = [segments[i][0], segments[i][1]];
    var startKey = key(ring[0]);
    var guard = segments.length + 2;
    while (guard-- > 0) {
      var tailKey = key(ring[ring.length - 1]);
      if (tailKey === startKey) break;
      var cands = ends[tailKey] || [];
      var next = -1;
      for (var c = 0; c < cands.length; c++) { if (!used[cands[c]]) { next = cands[c]; break; } }
      if (next < 0) break;
      used[next] = true;
      ring.push(key(segments[next][0]) === tailKey ? segments[next][1] : segments[next][0]);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

function hrRingArea(ring) {
  var a = 0;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

function hrPointInRing(pt, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Returns [[outer, hole, hole...], ...] by containment depth: even depth =
// outer, odd = hole of its smallest containing ring.
function hrRingsWithHoles(rings) {
  var areas = rings.map(hrRingArea);
  var parent = [];
  var depth = [];
  var i, j;
  for (i = 0; i < rings.length; i++) {
    var d = 0, best = -1;
    for (j = 0; j < rings.length; j++) {
      if (i === j || areas[j] <= areas[i]) continue;
      if (hrPointInRing(rings[i][0], rings[j])) {
        d++;
        if (best < 0 || areas[j] < areas[best]) best = j;
      }
    }
    depth.push(d);
    parent.push(best);
  }
  var groups = {};
  var order = [];
  for (i = 0; i < rings.length; i++) {
    if (depth[i] % 2 === 0) { groups[i] = [rings[i]]; order.push(i); }
  }
  for (i = 0; i < rings.length; i++) {
    if (depth[i] % 2 === 1 && groups[parent[i]]) groups[parent[i]].push(rings[i]);
  }
  return order.map(function (o) { return groups[o]; });
}

/**
 * Adds one L.polygon per outer ring (holes included) for each fill band, in
 * the given SVG renderer, wild -> fresh. Returns the polygon count.
 */
function hrAddSvgFillPolygons(layerGroup, renderer, occBlurred, wildBlurred, w, h, minIx, minIy) {
  var freshField = new Float32Array(w * h);
  for (var i = 0; i < w * h; i++) {
    var mask = Math.max(0, Math.min(1, (occBlurred[i] - HR_CONTOUR_THRESHOLD) * 2));
    freshField[i] = (1 - wildBlurred[i]) * mask;
  }
  var count = 0;
  for (var b = 0; b < HR_FILL_BANDS.length; b++) {
    var band = HR_FILL_BANDS[b];
    var segs = band.minFresh === null
      ? hrMarchingSquaresSegments(occBlurred, w, h, HR_CONTOUR_THRESHOLD)
      : hrMarchingSquaresSegments(freshField, w, h, band.minFresh);
    var lut = HR_WILDNESS_COLOR_LUT[Math.round(band.wildness * 254)];
    var color = 'rgb(' + lut[0] + ',' + lut[1] + ',' + lut[2] + ')';
    var groups = hrRingsWithHoles(hrChainRings(segs));
    for (var g = 0; g < groups.length; g++) {
      var latlngs = groups[g].map(function (ring) {
        return ring.map(function (pt) { return hrLocalToLatLon(pt[0], pt[1], minIx, minIy); });
      });
      L.polygon(latlngs, {
        renderer: renderer, stroke: false, fillColor: color, fillOpacity: band.opacity,
        fill: true, interactive: false, smoothFactor: 1
      }).addTo(layerGroup);
      count++;
    }
  }
  return count;
}

/**
 * Draws a small offscreen raster canvas onto a viewport-sized <canvas> in the
 * overlay pane, scaled to the given lat/lng bounds and redrawn on
 * move/zoom/resize. Mirrors how Leaflet's own L.Canvas renderer positions
 * itself (including its zoomanim transform), so it needs no <img>/data URL.
 * layer.hrDrawnPixels (alpha > 0 pixel count of last draw) is for diagnostics.
 */
function hrCreateCanvasFillLayer(raster, bounds) {
  var Layer = L.Layer.extend({
    onAdd: function (map) {
      this._map = map;
      this._el = L.DomUtil.create('canvas', 'hr-fill-canvas leaflet-zoom-animated');
      this._el.style.pointerEvents = 'none';
      map.getPane('overlayPane').appendChild(this._el);
      this.hrDrawnPixels = 0;
      this._redraw();
    },
    onRemove: function () {
      L.DomUtil.remove(this._el);
    },
    getEvents: function () {
      return { move: this._redraw, moveend: this._redraw, zoomend: this._redraw, resize: this._redraw, viewreset: this._redraw, zoomanim: this._animateZoom };
    },
    _redraw: function () {
      var map = this._map;
      var size = map.getSize();
      var el = this._el;
      if (el.width !== size.x) el.width = size.x;
      if (el.height !== size.y) el.height = size.y;
      L.DomUtil.setPosition(el, map.containerPointToLayerPoint([0, 0]));
      L.DomUtil.setTransform(el, map.containerPointToLayerPoint([0, 0]), 1);
      var ctx = el.getContext('2d');
      ctx.clearRect(0, 0, el.width, el.height);
      if (size.x === 0 || size.y === 0) return;
      var nw = map.latLngToContainerPoint(bounds.getNorthWest());
      var se = map.latLngToContainerPoint(bounds.getSouthEast());
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(raster, nw.x, nw.y, se.x - nw.x, se.y - nw.y);
      this.hrDrawnPixels = hrCountOpaque(ctx, el.width, el.height);
    },
    _animateZoom: function (e) {
      var map = this._map;
      var scale = map.getZoomScale(e.zoom);
      var offset = map._latLngToNewLayerPoint(map.containerPointToLatLng([0, 0]), e.zoom, e.center);
      L.DomUtil.setTransform(this._el, offset, scale);
    }
  });
  return new Layer();
}

function hrCountOpaque(ctx, w, h) {
  try {
    var data = ctx.getImageData(0, 0, w, h).data;
    var n = 0;
    for (var k = 3; k < data.length; k += 16) { if (data[k] > 0) n++; }
    return n;
  } catch (err) {
    return -1;
  }
}

/**
 * Renders a Home Range raster payload ({origin, w, h, wild, visits}, all as
 * produced by src/web/homeRangeRaster.ts) onto the given Leaflet map,
 * replacing any previous Home Range layers. Returns the new layer group so
 * the caller can remove/replace it next time.
 */
function renderHomeRangeToMap(map, payload, previousLayerGroup) {
  if (previousLayerGroup) {
    map.removeLayer(previousLayerGroup);
  }
  if (!payload) return null;

  var origin = payload.origin;
  var minIx = origin[0];
  var minIy = origin[1];
  var w = payload.w;
  var h = payload.h;
  var wild = hrBase64ToBytes(payload.wild);
  var visits = hrBase64ToBytes(payload.visits);

  var occ = new Float32Array(w * h);
  var valueTimesWeight = new Float32Array(w * h);
  var visitsFloat = new Float32Array(w * h);
  var i;
  for (i = 0; i < w * h; i++) {
    var inRange = wild[i] !== HR_OUTSIDE_SENTINEL;
    occ[i] = inRange ? 1 : 0;
    valueTimesWeight[i] = inRange ? (wild[i] / 254) : 0;
    visitsFloat[i] = visits[i] / 255;
  }

  var occBlurred = hrBlurField(occ, w, h, HR_BLUR_SIGMA_CELLS);
  var wildBlurred = hrBlurWeighted(valueTimesWeight, occ, w, h, HR_BLUR_SIGMA_CELLS);
  var visitsBlurred = hrBlurField(visitsFloat, w, h, HR_BLUR_SIGMA_CELLS);

  var canvas = null;
  if (HR_LIVE_FILL_MODE === 'canvas') {
  // ---- fill: an offscreen canvas -> data URL -> Leaflet imageOverlay ----
  canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  var imageData = ctx.createImageData(w, h);

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = y * w + x;
      var occV = occBlurred[idx];
      var wildV = wildBlurred[idx];
      var lutIndex = Math.max(0, Math.min(254, Math.round(wildV * 254)));
      var rgb = HR_WILDNESS_COLOR_LUT[lutIndex];

      // Ghost-trail brightness (visits): a well-worn cell nudges toward a
      // more saturated fresh green, on top of whatever its own wildness
      // colour is — "a bright glowing vein," not a separate flat overlay.
      var veinMix = Math.min(1, visitsBlurred[idx] * 0.6);
      var outR = Math.round(rgb[0] + (46 - rgb[0]) * veinMix);
      var outG = Math.round(rgb[1] + (204 - rgb[1]) * veinMix);
      var outB = Math.round(rgb[2] + (113 - rgb[2]) * veinMix);
      var alpha = Math.round((HR_FILL_ALPHA + (HR_FILL_ALPHA_WILD - HR_FILL_ALPHA) * wildV) * occV * 255);

      // Flip vertically: array row 0 is the southernmost row (smallest iy),
      // but image row 0 is drawn at the north edge of the Leaflet bounds.
      var flippedRow = h - 1 - y;
      var pIdx = (flippedRow * w + x) * 4;
      imageData.data[pIdx] = outR;
      imageData.data[pIdx + 1] = outG;
      imageData.data[pIdx + 2] = outB;
      imageData.data[pIdx + 3] = alpha;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  }

  var midRow = minIy + Math.floor(h / 2);
  var dLon = hrDLonForRow(midRow);
  var south = minIy * HR_D_LAT_DEG;
  var north = (minIy + h) * HR_D_LAT_DEG;
  var west = minIx * dLon;
  var east = (minIx + w) * dLon;

  var layerGroup = L.layerGroup();
  var fillLayer = null;
  var polygonCount = 0;
  if (HR_LIVE_FILL_MODE === 'canvas') {
    fillLayer = hrCreateCanvasFillLayer(canvas, L.latLngBounds([south, west], [north, east]));
    fillLayer.addTo(layerGroup);
  } else {
    // Explicit SVG renderer: vector fill is what the Android WebView composites.
    var svgRenderer = L.svg();
    layerGroup.addLayer(svgRenderer); // first, so it exists before the polygons; removed with the group
    polygonCount = hrAddSvgFillPolygons(layerGroup, svgRenderer, occBlurred, wildBlurred, w, h, minIx, minIy);
  }
  layerGroup.hrStats = { cells: w * h, bounds: [south, west, north, east], pane: 'overlayPane', fillLayer: fillLayer, mode: HR_LIVE_FILL_MODE, polygons: polygonCount };

  // ---- Range outline: marching-squares 0.5-contour over the blurred
  // occupancy field, stroked on top of the fill for definition. ----
  var segments = hrMarchingSquaresSegments(occBlurred, w, h, HR_CONTOUR_THRESHOLD);
  for (i = 0; i < segments.length; i++) {
    var a = hrLocalToLatLon(segments[i][0][0], segments[i][0][1], minIx, minIy);
    var b = hrLocalToLatLon(segments[i][1][0], segments[i][1][1], minIx, minIy);
    L.polyline([a, b], { color: HR_FRESH_HEX, weight: HR_OUTLINE_WEIGHT, opacity: HR_OUTLINE_OPACITY, interactive: false }).addTo(layerGroup);
  }

  // ---- Wild-ground contour (docs/decisions/somewhere-wild): a second
  // marching-squares pass over the same wildBlurred field the fill already
  // decodes, at HR_WILD_CONTOUR_THRESHOLD — a warm, dashed line distinct
  // from the Range outline above, circling ground that will visibly pay
  // more (see design.md Decision 7). No new payload field needed. ----
  var wildSegments = hrMarchingSquaresSegments(wildBlurred, w, h, HR_WILD_CONTOUR_THRESHOLD);
  for (i = 0; i < wildSegments.length; i++) {
    var wa = hrLocalToLatLon(wildSegments[i][0][0], wildSegments[i][0][1], minIx, minIy);
    var wb = hrLocalToLatLon(wildSegments[i][1][0], wildSegments[i][1][1], minIx, minIy);
    L.polyline([wa, wb], {
      color: HR_WILD_CONTOUR_HEX,
      weight: 1,
      opacity: 0.7,
      dashArray: '4, 4',
      interactive: false
    }).addTo(layerGroup);
  }

  layerGroup.addTo(map);
  return layerGroup;
}

/**
 * The Walk Portrait's muted Home Range background context layer
 * (docs/decisions/walk-portrait/design.md Decisions 2/3) — a third
 * sibling to renderHomeRangeToMap above, same signature and layer-group-
 * return convention, reusing the identical blur -> marching-squares
 * pipeline. Deliberately flat: a single muted tone fill (no wildness-driven
 * color LUT, no ghost-trail visits brightening) and a matching muted outline
 * at reduced opacity, with no wild-ground contour pass and no marker — this
 * is "everywhere the dog has ever been, out of focus," not a second
 * wildness-coded map competing with the walk's own trail drawn on top.
 */
function renderHomeRangeMuted(map, payload, previousLayerGroup) {
  if (previousLayerGroup) {
    map.removeLayer(previousLayerGroup);
  }
  if (!payload) return null;

  var origin = payload.origin;
  var minIx = origin[0];
  var minIy = origin[1];
  var w = payload.w;
  var h = payload.h;
  var wild = hrBase64ToBytes(payload.wild);

  var occ = new Float32Array(w * h);
  var i;
  for (i = 0; i < w * h; i++) {
    occ[i] = wild[i] !== HR_OUTSIDE_SENTINEL ? 1 : 0;
  }
  var occBlurred = hrBlurField(occ, w, h, HR_BLUR_SIGMA_CELLS);

  var mutedRgbFloat = hrHexToRgb(HR_MUTED_HEX);
  var mutedR = Math.round(mutedRgbFloat[0] * 255);
  var mutedG = Math.round(mutedRgbFloat[1] * 255);
  var mutedB = Math.round(mutedRgbFloat[2] * 255);

  var canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  var imageData = ctx.createImageData(w, h);

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = y * w + x;
      var occV = occBlurred[idx];
      var alpha = Math.round(HR_MUTED_FILL_ALPHA * occV * 255);

      // Same vertical flip as renderHomeRangeToMap's fill loop.
      var flippedRow = h - 1 - y;
      var pIdx = (flippedRow * w + x) * 4;
      imageData.data[pIdx] = mutedR;
      imageData.data[pIdx + 1] = mutedG;
      imageData.data[pIdx + 2] = mutedB;
      imageData.data[pIdx + 3] = alpha;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  var midRow = minIy + Math.floor(h / 2);
  var dLon = hrDLonForRow(midRow);
  var south = minIy * HR_D_LAT_DEG;
  var north = (minIy + h) * HR_D_LAT_DEG;
  var west = minIx * dLon;
  var east = (minIx + w) * dLon;

  var layerGroup = L.layerGroup();
  var imageOverlay = L.imageOverlay(canvas.toDataURL(), [[south, west], [north, east]], {
    opacity: 1,
    interactive: false
  });
  imageOverlay.addTo(layerGroup);

  // Range outline only, in the same muted tone as the fill — deliberately no
  // second wild-ground contour pass (that's a wildness-coded signal this
  // background layer must not show) and no marker.
  var segments = hrMarchingSquaresSegments(occBlurred, w, h, HR_CONTOUR_THRESHOLD);
  for (i = 0; i < segments.length; i++) {
    var a = hrLocalToLatLon(segments[i][0][0], segments[i][0][1], minIx, minIy);
    var b = hrLocalToLatLon(segments[i][1][0], segments[i][1][1], minIx, minIy);
    L.polyline([a, b], { color: HR_MUTED_HEX, weight: 1.5, opacity: 0.6, interactive: false }).addTo(layerGroup);
  }

  layerGroup.addTo(map);
  return layerGroup;
}

/**
 * The Doorstep's territory portrait (docs/decisions/home-dashboard,
 * design.md Decision 2) — the same blur -> color-LUT -> fill-pixel loop and
 * the same HR_CONTOUR_THRESHOLD marching-squares pass as
 * renderHomeRangeToMap above, but drawn straight onto the given canvas's 2D
 * context (ctx.moveTo/lineTo/stroke) instead of as Leaflet L.polylines, and
 * sized to the raster's own w x h pixel grid rather than a Leaflet map's
 * screen. Deliberately omits the wild-ground contour pass and any
 * marker/pin — the portrait is "Range outline + Bloom fill," nothing else
 * (proposal.md's own enumeration). portraitHTML.ts composites this
 * function's output as an image overlay on top of its own OSM tile canvas;
 * this function has no Leaflet dependency and knows nothing about tiles.
 */
function renderHomeRangePortrait(canvas, payload) {
  if (!payload) return;

  var origin = payload.origin;
  var minIx = origin[0];
  var minIy = origin[1];
  var w = payload.w;
  var h = payload.h;
  var wild = hrBase64ToBytes(payload.wild);
  var visits = hrBase64ToBytes(payload.visits);

  var occ = new Float32Array(w * h);
  var valueTimesWeight = new Float32Array(w * h);
  var visitsFloat = new Float32Array(w * h);
  var i;
  for (i = 0; i < w * h; i++) {
    var inRange = wild[i] !== HR_OUTSIDE_SENTINEL;
    occ[i] = inRange ? 1 : 0;
    valueTimesWeight[i] = inRange ? (wild[i] / 254) : 0;
    visitsFloat[i] = visits[i] / 255;
  }

  var occBlurred = hrBlurField(occ, w, h, HR_BLUR_SIGMA_CELLS);
  var wildBlurred = hrBlurWeighted(valueTimesWeight, occ, w, h, HR_BLUR_SIGMA_CELLS);
  var visitsBlurred = hrBlurField(visitsFloat, w, h, HR_BLUR_SIGMA_CELLS);

  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  var imageData = ctx.createImageData(w, h);

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = y * w + x;
      var occV = occBlurred[idx];
      var wildV = wildBlurred[idx];
      var lutIndex = Math.max(0, Math.min(254, Math.round(wildV * 254)));
      var rgb = HR_WILDNESS_COLOR_LUT[lutIndex];

      var veinMix = Math.min(1, visitsBlurred[idx] * 0.6);
      var outR = Math.round(rgb[0] + (46 - rgb[0]) * veinMix);
      var outG = Math.round(rgb[1] + (204 - rgb[1]) * veinMix);
      var outB = Math.round(rgb[2] + (113 - rgb[2]) * veinMix);
      var alpha = Math.round((HR_FILL_ALPHA + (HR_FILL_ALPHA_WILD - HR_FILL_ALPHA) * wildV) * occV * 255);

      // Same vertical flip as renderHomeRangeToMap's fill loop: array row 0
      // is the southernmost row, but image/canvas row 0 must be the north
      // edge.
      var flippedRow = h - 1 - y;
      var pIdx = (flippedRow * w + x) * 4;
      imageData.data[pIdx] = outR;
      imageData.data[pIdx + 1] = outG;
      imageData.data[pIdx + 2] = outB;
      imageData.data[pIdx + 3] = alpha;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // Range outline only (HR_CONTOUR_THRESHOLD, same as the interactive map) —
  // deliberately no second wild-ground contour pass and no marker.
  var segments = hrMarchingSquaresSegments(occBlurred, w, h, HR_CONTOUR_THRESHOLD);
  ctx.strokeStyle = HR_FRESH_HEX;
  ctx.lineWidth = HR_OUTLINE_WEIGHT;
  ctx.globalAlpha = HR_OUTLINE_OPACITY;
  for (i = 0; i < segments.length; i++) {
    var a = segments[i][0];
    var b = segments[i][1];
    // Segments are in the same unflipped (u,v) space as the fill loop's
    // (x,y) before its own flippedRow conversion above — apply the same
    // flip here so the stroke lines up with the fill underneath it.
    ctx.beginPath();
    ctx.moveTo(a[0], (h - 1) - a[1]);
    ctx.lineTo(b[0], (h - 1) - b[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
`;

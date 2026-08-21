// The WebView-side Home Range renderer — Gaussian blur, marching-squares
// contour extraction, Lab colour interpolation, and canvas drawing. See
// openspec/changes/home-range/design.md Decision 6.
//
// This is plain vanilla JS, not TypeScript: it runs inside the WebView's own
// script tag, which has no bundler and no access to anything under src/ at
// runtime. Exported as a raw source string so both mapHTML.ts (the real app)
// and openspec/changes/home-range/rendering-spike.html (the standalone
// dev-only go/no-go spike, tasks.md task 5.1) inject the exact same
// renderer — one canonical copy, not two hand-kept-in-sync ones.
//
// UNVERIFIED ON A REAL DEVICE: everything below is written and internally
// consistent (constants, formulas, and colour math mirror
// home-range-prototype.mjs and design.md Decision 2/5/6 exactly), but this
// file cannot be executed or visually inspected from this environment. Task
// 5.1's on-device go/no-go spike is the gate that actually confirms it
// renders correctly and performs smoothly — see this change's tasks.md.

export const HOME_RANGE_RENDERER_SCRIPT = `
// ---- constants (mirrors utils/grid.ts and design.md Decision 1/2/6) ----
var HR_CELL_M = 20;
var HR_D_LAT_DEG = HR_CELL_M / 111320;
var HR_BLUR_SIGMA_CELLS = 1;
var HR_CONTOUR_THRESHOLD = 0.5;
// design.md Decision 2 specified 0.28 as a flat floor alpha; real on-device
// testing (rendering-spike.html) found that too faint to read against map
// tiles, so it's raised here — deviation logged, not silently changed.
var HR_FILL_ALPHA = 0.6;
var HR_OUTSIDE_SENTINEL = 255;
var HR_FRESH_HEX = '#2ECC71';
var HR_WILD_HEX = '#DCE8BE';

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

  // ---- fill: an offscreen canvas -> data URL -> Leaflet imageOverlay ----
  var canvas = document.createElement('canvas');
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
      var alpha = Math.round(HR_FILL_ALPHA * occV * 255);

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

  // ---- Range outline: marching-squares 0.5-contour over the blurred
  // occupancy field, stroked on top of the fill for definition. ----
  var segments = hrMarchingSquaresSegments(occBlurred, w, h, HR_CONTOUR_THRESHOLD);
  for (i = 0; i < segments.length; i++) {
    var a = hrLocalToLatLon(segments[i][0][0], segments[i][0][1], minIx, minIy);
    var b = hrLocalToLatLon(segments[i][1][0], segments[i][1][1], minIx, minIy);
    L.polyline([a, b], { color: HR_FRESH_HEX, weight: 1.5, opacity: 0.5, interactive: false }).addTo(layerGroup);
  }

  layerGroup.addTo(map);
  return layerGroup;
}
`;

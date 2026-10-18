import { HOME_RANGE_RENDERER_SCRIPT } from './homeRangeRendererScript';
import { NEIGHBOUR_OVERLAY_SCRIPT } from './neighbourOverlayScript';
import { GAP_SPLIT_SCRIPT } from './gapSplitScript';
import { PARTNER_TRAIL_SCRIPT } from './partnerTrailScript';
import { MAP_TILE_ATTRIBUTION, MAP_TILE_FILTER, MAP_TILE_HOST_SUFFIX, MAP_TILE_URL, MAP_TINT_ALPHA, MAP_TINT_COLOR } from './mapTheme';
import { tokens } from '../ui/tokens';

// The Doorstep's territory portrait host (docs/decisions/home-dashboard,
// design.md Decision 2, resolved to include OSM tiles behind the shape per
// the user's 2026-08-22 call — see proposal.md's Open Questions). Unlike
// mapHTML.ts, this WebView never becomes visible or interactive: no
// pan/zoom/markers/gestures, no live GPS, no attribution UI beyond what
// OSM's tile usage policy requires (baked into the composited image itself
// is out of scope here — TerritoryPortrait.tsx's caller is responsible for
// any on-screen attribution requirement, same as MapView.tsx already is).
//
// Capture approach (tasks.md task 2.3 — flagged there as new territory for
// this codebase, and left genuinely unverified until task 8.7's on-device
// pass): rather than trying to screenshot Leaflet's own DOM tile layer (a
// hard problem in general — Leaflet renders tiles as positioned <img>
// elements), this fetches each map tile image this raster's bounding box
// needs directly and draws it onto one offscreen canvas at the pixel
// position Leaflet's own Web Mercator projection math (`map.project`) says
// it belongs at, then draws `renderHomeRangePortrait`'s fill+outline output
// on top at the same projection, and only then calls `canvas.toDataURL()`.
// The one Leaflet map instance this file creates is never attached to a
// visible pane — it exists solely so `map.project`/`map.getBoundsZoom`
// match exactly what mapHTML.ts's real, visible map would compute for the
// same bounds.
//
// If any tile fails to load or the whole fetch times out, this posts
// `PORTRAIT_FAILED` rather than a partial or broken image. `toDataURL()`
// is also wrapped in a try/catch that falls back the same way, as
// defense-in-depth: `tile.openstreetmap.org` was verified (2026-08-22) to
// send proper `Access-Control-Allow-Origin` headers with
// `img.crossOrigin = 'anonymous'` set below, so canvas-tainting is not a
// currently-known failure mode here — the catch exists for untested real
// device network flakiness or tile-server behavior changes, not a
// confirmed CORS bug.

export const portraitHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Territory Portrait</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: transparent; }
    /* Never shown on screen (visibility: hidden, not display: none, so the
       container still gets real layout/size) — this map instance exists
       only for its Web Mercator projection math
       (map.project/getBoundsZoom). getBoundsZoom reads the container's
       actual clientWidth/clientHeight, so this needs a real pixel size —
       a 1x1 container silently resolves to a wrong (too-low) zoom and a
       near-empty capture, not a visible error. */
    #map { position: absolute; width: 400px; height: 400px; visibility: hidden; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
${HOME_RANGE_RENDERER_SCRIPT}
${NEIGHBOUR_OVERLAY_SCRIPT}
${GAP_SPLIT_SCRIPT}
${PARTNER_TRAIL_SCRIPT}

    // Alex's thread for the next capture (SHOW_PARTNER_TRAIL); { points: [] } or null = none.
    var partnerTrail = null;
    var TILE_TIMEOUT_MS = 8000;
    // Roughly the width (pt) the captured image is shown at; sizes the neighbour stitches/signs in canvas pixels.
    var PORTRAIT_DISPLAY_PT = 340;
    var TILE_SIZE = 256;
    // Small fixed margin (tasks.md task 2.5) so the shape doesn't crop
    // flush to the portrait's edge — an implementer-level polish number,
    // not a logged balance threshold.
    var CELL_PADDING = 2;
    var TILE_SUBDOMAINS = ['a', 'b', 'c'];
    var TILE_URL_TEMPLATE = ${JSON.stringify(MAP_TILE_URL)};
    var TILE_HOST_SUFFIX = ${JSON.stringify(MAP_TILE_HOST_SUFFIX)};
    // Same pastel treatment as mapHTML.ts's CSS filter + tint overlay.
    var TILE_FILTER = ${JSON.stringify(MAP_TILE_FILTER)};
    var TINT_COLOR = ${JSON.stringify(MAP_TINT_COLOR)};
    var TINT_ALPHA = ${MAP_TINT_ALPHA};
    var CREDIT_TEXT = ${JSON.stringify(MAP_TILE_ATTRIBUTION)};

    function reportToRN(type, extra) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, extra || {})));
      }
    }

    var map = L.map('map', { attributionControl: false, zoomControl: false });

    function boundsForRaster(raster, padding) {
      var pad = padding === undefined ? CELL_PADDING : padding;
      var origin = raster.origin;
      var minIx = origin[0] - pad;
      var minIy = origin[1] - pad;
      var w = raster.w + pad * 2;
      var h = raster.h + pad * 2;
      var south = minIy * HR_D_LAT_DEG;
      var north = (minIy + h) * HR_D_LAT_DEG;
      var midRow = minIy + Math.floor(h / 2);
      var dLon = hrDLonForRow(midRow);
      var west = minIx * dLon;
      var east = (minIx + w) * dLon;
      return L.latLngBounds([south, west], [north, east]);
    }

    function loadTileImage(url) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('tile failed to load')); };
        img.src = url;
      });
    }

    // neighbours (optional): Nachbarhund items drawn below our patches; frame (optional): a larger origin/w/h box
    // that holds them (the tile canvas uses it, our own overlay stays at the raster's own bounds).
    function handleRenderPortrait(raster, neighbours, frame) {
      // #map is never attached to a visible pane, so Leaflet may not have
      // picked up its real CSS size yet — invalidateSize() forces Leaflet
      // to re-read clientWidth/clientHeight before getBoundsZoom relies on
      // them (mirrors mapHTML.ts's own invalidateSize() call sites).
      map.invalidateSize();
      var bounds = boundsForRaster(frame || raster);
      var zoom = Math.min(19, Math.max(0, map.getBoundsZoom(bounds, false, [0, 0])));

      var topLeftPixel = map.project(bounds.getNorthWest(), zoom);
      var bottomRightPixel = map.project(bounds.getSouthEast(), zoom);

      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bottomRightPixel.x - topLeftPixel.x));
      canvas.height = Math.max(1, Math.round(bottomRightPixel.y - topLeftPixel.y));
      var ctx = canvas.getContext('2d');

      var minTileX = Math.floor(topLeftPixel.x / TILE_SIZE);
      var maxTileX = Math.floor(bottomRightPixel.x / TILE_SIZE);
      var minTileY = Math.floor(topLeftPixel.y / TILE_SIZE);
      var maxTileY = Math.floor(bottomRightPixel.y / TILE_SIZE);

      var tilePromises = [];
      for (var tx = minTileX; tx <= maxTileX; tx++) {
        for (var ty = minTileY; ty <= maxTileY; ty++) {
          (function (tx, ty) {
            var sub = TILE_SUBDOMAINS[Math.abs(tx + ty) % TILE_SUBDOMAINS.length];
            var url = TILE_URL_TEMPLATE
              .replace('{s}', sub).replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty);
            // Defence-in-depth only: guards against a future edit to the URL template drifting off the verified host.
            if (new URL(url).hostname.slice(-TILE_HOST_SUFFIX.length) !== TILE_HOST_SUFFIX) {
              tilePromises.push(Promise.reject(new Error('unexpected tile host')));
              return;
            }
            tilePromises.push(
              loadTileImage(url).then(function (img) {
                // ctx.filter is unsupported on some WebViews; the flat tint
                // below still applies there.
                ctx.filter = TILE_FILTER;
                ctx.drawImage(img, tx * TILE_SIZE - topLeftPixel.x, ty * TILE_SIZE - topLeftPixel.y, TILE_SIZE, TILE_SIZE);
                ctx.filter = 'none';
              })
            );
          })(tx, ty);
        }
      }

      var settled = false;
      var timeoutId = setTimeout(function () {
        if (settled) return;
        settled = true;
        reportToRN('PORTRAIT_FAILED', {});
      }, TILE_TIMEOUT_MS);

      Promise.all(tilePromises)
        .then(function () {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);

          // Meadow tint over the tiles only (before the Range is drawn, so the
          // Range keeps its own colours).
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = TINT_ALPHA;
          ctx.fillStyle = TINT_COLOR;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();

          // Neighbour patches go on first so our own patches always sit on top of any overlap.
          function toCanvas(lat, lon) {
            var p = map.project(L.latLng(lat, lon), zoom);
            return { x: p.x - topLeftPixel.x, y: p.y - topLeftPixel.y };
          }
          if (neighbours && neighbours.length) hrDrawNeighbourPatches(ctx, neighbours, toCanvas, canvas.width / PORTRAIT_DISPLAY_PT);

          // Composite the felt patches + stitched seam (renderHomeRangePortrait,
          // this script's own math-only function, shared verbatim with the
          // interactive map) on top of the tiles just drawn above.
          var overlayCanvas = document.createElement('canvas');
          // Unpadded: the overlay canvas covers exactly the raster's cells (the tile canvas keeps the padding).
          var overlayBounds = boundsForRaster(raster, 0);
          var overlayTopLeftPx = map.project(overlayBounds.getNorthWest(), zoom);
          var overlayBottomRightPx = map.project(overlayBounds.getSouthEast(), zoom);
          // Render the felt patches at ~1 canvas pixel per output pixel so the stitched seam is crisp.
          var pxPerCell = (overlayBottomRightPx.x - overlayTopLeftPx.x) / raster.w;
          renderHomeRangePortrait(overlayCanvas, raster, Math.max(1, Math.min(24, Math.round(pxPerCell))));
          ctx.drawImage(
            overlayCanvas,
            overlayTopLeftPx.x - topLeftPixel.x,
            overlayTopLeftPx.y - topLeftPixel.y,
            overlayBottomRightPx.x - overlayTopLeftPx.x,
            overlayBottomRightPx.y - overlayTopLeftPx.y
          );

          // Alex's thread lies over the cloth (it is not sewn in yet), under the little name signs.
          if (partnerTrail && partnerTrail.points && partnerTrail.points.length) ptDrawPortrait(ctx, partnerTrail, toCanvas, canvas.width / PORTRAIT_DISPLAY_PT);

          if (neighbours && neighbours.length) hrDrawNeighbourSigns(ctx, neighbours, toCanvas, canvas.width / PORTRAIT_DISPLAY_PT);

          // Attribution travels with the captured image (ODbL).
          ctx.save();
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          var creditW = ctx.measureText(CREDIT_TEXT).width;
          ctx.fillStyle = ${JSON.stringify(tokens.white)};
          ctx.globalAlpha = 0.85;
          ctx.fillRect(canvas.width - creditW - 12, canvas.height - 16, creditW + 12, 16);
          ctx.globalAlpha = 1;
          ctx.fillStyle = ${JSON.stringify(tokens.muted)};
          ctx.fillText(CREDIT_TEXT, canvas.width - 6, canvas.height - 3);
          ctx.restore();

          try {
            var dataUrl = canvas.toDataURL('image/png');
            reportToRN('PORTRAIT_READY', { dataUrl: dataUrl });
          } catch (err) {
            // Defense-in-depth, not a confirmed failure mode (see the
            // file-header comment) — same fallback as a tile timeout.
            reportToRN('PORTRAIT_FAILED', {});
          }
        })
        .catch(function () {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          reportToRN('PORTRAIT_FAILED', {});
        });
    }

    function handleMessage(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'SHOW_PARTNER_TRAIL') {
          partnerTrail = msg.payload || null;
        } else if (msg.type === 'RENDER_PORTRAIT') {
          handleRenderPortrait(msg.payload.raster, msg.payload.neighbours, msg.payload.frame);
        }
      } catch (error) {
        reportToRN('PORTRAIT_FAILED', {});
      }
    }

    // Android WebView delivers postMessage on document; iOS delivers on window
    // (mirrors mapHTML.ts's own dual-listener convention).
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);

    reportToRN('WEBVIEW_LOADED', {});
  <\/script>
</body>
</html>
`;

import { HOME_RANGE_RENDERER_SCRIPT } from './homeRangeRendererScript';
import { MAP_THEME_CSS, MAP_TILE_LAYER_JS, TRAIL_BED, TRAIL_STAMPS } from './mapTheme';

// The Walk Portrait's live, animated, non-interactive WebView host
// (docs/decisions/walk-portrait.md Decision 1). Modeled directly on
// mapHTML.ts's already-shipped tile layer, trail polyline, and dual
// window/document message-listener convention — but, unlike mapHTML.ts, this
// map IS visible on screen and never becomes interactive: every Leaflet
// gesture option below is explicitly disabled (dragging, both zoom
// gestures, box zoom, keyboard, the zoom control UI). Fed a completed walk
// once via RENDER_WALK — never a live-updating GPS stream — and reveals its
// trail with a two-phase in-WebView animation (see below), rather than
// mapHTML.ts's instant redraw-on-every-fix UPDATE_TRAIL handler.
//
// Offline/slow-tile behavior is not a new risk this file introduces — same
// accepted behavior as the live map (CLAUDE.md: "Requires internet access at
// walk time"); Leaflet's own tile layer already tolerates missing/slow tiles
// by showing blank tile squares.

export const walkPortraitHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Walk Portrait</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    /* Same paw-start-marker convention as mapHTML.ts's own divIcon markers
       (current-position, wild-spot-marker) — a small, warm, non-alarming dot,
       not a pin/flag. See proposal.md's resolved "no end-of-trail marker". */
    .walk-start-marker { width: 14px; height: 14px; background: #2ECC71; border: 2px solid #FFFBF0; border-radius: 50%; box-shadow: 0 0 6px rgba(46, 204, 113, 0.6); }
${MAP_THEME_CSS}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
${HOME_RANGE_RENDERER_SCRIPT}

    // Small fixed padding (mirrors portraitHTML.ts's CELL_PADDING /
    // mapHTML.ts's SHOW_HOME_RANGE fitBounds padding precedent) so the
    // walk's own trail doesn't crop flush to the screen edge — an
    // implementer-level polish number, not a logged threshold.
    var FIT_BOUNDS_PADDING = [24, 24];
    // Design.md Decision 1's two-phase reveal: Phase A (~70% of 1.2s) draws
    // the full trail chronologically in the base colour; Phase B (~30%)
    // colours in just the New Ground runs on top, so New Ground finishes
    // drawing last regardless of where in the walk it chronologically
    // occurred. First-pass, easily-retuned numbers, not logged thresholds.
    var TOTAL_REVEAL_MS = 1200;
    var PHASE_A_MS = Math.round(TOTAL_REVEAL_MS * 0.7);
    var PHASE_B_MS = TOTAL_REVEAL_MS - PHASE_A_MS;

    var map = L.map('map', {
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomControl: false,
      attributionControl: false
    }).setView([0, 0], 2);

${MAP_TILE_LAYER_JS}

    var homeRangeLayerGroup = null;
    var basePolyline = null;
    var baseStamps = null;
    var newGroundPolylines = [];
    var startMarker = null;

    function reportToRN(type, extra) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, extra || {})));
      }
    }

    function clearTrail() {
      if (basePolyline) { map.removeLayer(basePolyline); basePolyline = null; }
      if (baseStamps) { map.removeLayer(baseStamps); baseStamps = null; }
      for (var i = 0; i < newGroundPolylines.length; i++) { map.removeLayer(newGroundPolylines[i]); }
      newGroundPolylines = [];
      if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
    }

    /** The first \`count\` points of the runs laid end to end, as nested runs. */
    function sliceRuns(flat, runLengths, count) {
      var out = [];
      var at = 0;
      for (var r = 0; r < runLengths.length && at < count; r++) {
        var take = Math.min(runLengths[r], count - at);
        out.push(flat.slice(at, at + take));
        at += runLengths[r];
      }
      return out;
    }

    /**
     * Grows \`polyline\`'s coordinate array from its first point to all of
     * \`latlngs\` over \`durationMs\`, via requestAnimationFrame — the same
     * primitive mapHTML.ts's UPDATE_TRAIL already exercises today for a live
     * walk (setLatLngs on every fix), just driven by a timer instead of GPS
     * callbacks. Calls \`onDone\` exactly once, when the full array is set.
     */
    function animateGrowth(polyline, latlngs, durationMs, onDone, runLengths) {
      if (latlngs.length === 0) { if (onDone) onDone(); return; }
      // runLengths (optional) = point counts of the continuous runs that make up \`latlngs\`; the polyline then gets nested
      // runs, so no line is drawn across a gap (the distance rule, cut on the RN side by geometry.ts's splitAtGaps).
      function shown(count) { return runLengths ? sliceRuns(latlngs, runLengths, count) : latlngs.slice(0, count); }
      if (latlngs.length === 1 || durationMs <= 0) {
        polyline.setLatLngs(shown(latlngs.length));
        if (onDone) onDone();
        return;
      }
      var startTime = null;
      function step(ts) {
        if (startTime === null) startTime = ts;
        var elapsed = ts - startTime;
        var frac = Math.min(1, elapsed / durationMs);
        var count = Math.max(1, Math.round(frac * latlngs.length));
        polyline.setLatLngs(shown(count));
        if (frac < 1) {
          requestAnimationFrame(step);
        } else if (onDone) {
          onDone();
        }
      }
      requestAnimationFrame(step);
    }

    function handleRenderWalk(payload) {
      clearTrail();

      var walkLatLngs = payload.walkLatLngs || [];
      // Continuous runs of the trail (cut at gaps); older payloads without them draw one run.
      var walkRuns = payload.walkRuns || (walkLatLngs.length ? [walkLatLngs] : []);
      var walkRunLengths = walkRuns.map(function (r) { return r.length; });
      var walkFlat = [].concat.apply([], walkRuns);
      var newGroundRuns = payload.newGroundRuns || [];
      var raster = payload.raster;

      homeRangeLayerGroup = renderHomeRangeMuted(map, raster, homeRangeLayerGroup);

      if (walkLatLngs.length > 0) {
        startMarker = L.marker(walkLatLngs[0], {
          icon: L.divIcon({ className: 'walk-start-marker', iconSize: [14, 14] })
        }).addTo(map);

        setTimeout(function () {
          map.invalidateSize();
          if (walkLatLngs.length > 1) {
            map.fitBounds(L.latLngBounds(walkLatLngs), { maxZoom: 18, padding: FIT_BOUNDS_PADDING });
          } else {
            map.setView(walkLatLngs[0], 17);
          }
        }, 100);
      }

      // Phase A: the full route as a Trampelpfad (dirt bed + paw stamps).
      basePolyline = L.polyline([], {
        color: '${TRAIL_BED.color}',
        weight: ${TRAIL_BED.weight},
        opacity: ${TRAIL_BED.opacity},
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      baseStamps = L.polyline([], {
        color: '${TRAIL_STAMPS.color}',
        weight: ${TRAIL_STAMPS.weight},
        dashArray: '${TRAIL_STAMPS.dashArray}',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      var baseGrowth = { setLatLngs: function (pts) { basePolyline.setLatLngs(pts); baseStamps.setLatLngs(pts); } };

      animateGrowth(baseGrowth, walkFlat, PHASE_A_MS, function () {
        // Phase B: colour in just the New Ground runs on top of the
        // already-fully-drawn base trail — these finish last regardless of
        // where in the walk they chronologically occurred.
        var pending = newGroundRuns.length;
        if (pending === 0) {
          reportToRN('WALK_PORTRAIT_REVEAL_DONE', {});
          return;
        }
        for (var i = 0; i < newGroundRuns.length; i++) {
          var run = newGroundRuns[i];
          // New Ground runs: the same path, worn in darker (full-opacity bed).
          var poly = L.polyline([], {
            color: '${TRAIL_BED.color}',
            weight: ${TRAIL_BED.weight},
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);
          var runStamps = L.polyline([], {
            color: '${TRAIL_STAMPS.color}',
            weight: ${TRAIL_STAMPS.weight},
            dashArray: '${TRAIL_STAMPS.dashArray}',
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);
          newGroundPolylines.push(poly, runStamps);
          var runGrowth = { setLatLngs: function (pts) { poly.setLatLngs(pts); runStamps.setLatLngs(pts); } };
          animateGrowth(runGrowth, run, PHASE_B_MS, function () {
            pending--;
            if (pending === 0) {
              reportToRN('WALK_PORTRAIT_REVEAL_DONE', {});
            }
          });
        }
      }, walkRunLengths);

      reportToRN('WALK_PORTRAIT_RENDER_APPLIED', { pointCount: walkLatLngs.length, newGroundRunCount: newGroundRuns.length });
    }

    function handleMessage(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'RENDER_WALK') {
          handleRenderWalk(msg.payload);
        }
      } catch (error) {
        reportToRN('WEBVIEW_ERROR', { message: String(error && error.message || error), raw: e.data });
      }
    }

    // Android WebView delivers postMessage on document; iOS delivers on window.
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);

    reportToRN('WEBVIEW_LOADED', { hasRNBridge: !!window.ReactNativeWebView, leafletLoaded: typeof L !== 'undefined' });
  <\/script>
</body>
</html>
`;

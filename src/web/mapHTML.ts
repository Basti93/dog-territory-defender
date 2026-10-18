import { GAP_SPLIT_SCRIPT } from './gapSplitScript';
import { HOME_RANGE_RENDERER_SCRIPT } from './homeRangeRendererScript';
import { NEIGHBOUR_OVERLAY_SCRIPT } from './neighbourOverlayScript';
import { PARTNER_TRAIL_CSS, PARTNER_TRAIL_SCRIPT } from './partnerTrailScript';
import { DOGHOUSE_HTML, TRAIL_BED, TRAIL_STAMPS, CORNER_SIGN_JS, MAP_CLOUDS_JS, MAP_MARKER_CSS, MAP_NOTES_CSS, MAP_NOTES_JS, MAP_THEME_CSS, MAP_TILE_FILTER, MAP_THEME_PROBE_JS, MAP_TILE_LAYER_JS, PAW_MARKER_HTML, WILD_PIN_HTML } from './mapTheme';

/**
 * "Naht läuft" (Heimkehr beat 1): animates the newest (fresh-band) patch seams' dash offset over STITCH_MS and
 * draws the new-ground street segments in coral. Plain ES5 string so it can be embedded in the page and unit-tested
 * with stubs (L, requestAnimationFrame, now). `patches` = layerGroup.hrPatches; segments = [[[lat,lon],[lat,lon]], ...].
 */
export const STITCH_PATCH_JS = `
    var STITCH_MS = 1200;
    var STITCH_CORAL = '#F2786E';
    var stitchSegmentsLayer = null;
    function hrStitchPatch(map, patches, segments, now, raf) {
      if (stitchSegmentsLayer) { map.removeLayer(stitchSegmentsLayer); stitchSegmentsLayer = null; }
      var list = (patches || []).filter(function (p) { return p.hrBand && p.hrBand.name === 'fresh'; });
      if (list.length === 0 && patches && patches.length) list = [patches[patches.length - 1]];
      var start = now();
      var distance = 40;
      function frame() {
        var k = Math.min(1, (now() - start) / STITCH_MS);
        list.forEach(function (p) {
          var el = p._path;
          if (el && el.style) el.style.strokeDashoffset = String(distance * (1 - k));
        });
        if (k < 1) raf(frame);
      }
      frame();
      if (segments && segments.length) {
        stitchSegmentsLayer = L.layerGroup().addTo(map);
        segments.forEach(function (seg) {
          L.polyline(seg, { color: STITCH_CORAL, weight: 4, opacity: 1, lineCap: 'round' }).addTo(stitchSegmentsLayer);
        });
      }
      return list.length;
    }
`;

/**
 * The embedded band fits at quarter zoom steps, so tiles are drawn at a fractional scale. With the tile filter on each
 * <img> (MAP_THEME_CSS), the antialiased tile edges let the linen background shine through as a thin light grid line
 * (seen on emulator: one vertical and one horizontal line across the band). Filtering the whole tile layer instead
 * gives the same look without per-tile edges.
 */
const EMBEDDED_TILE_SEAM_CSS = `
    img.leaflet-tile { filter: none; will-change: auto; }
    .leaflet-layer { filter: ${MAP_TILE_FILTER}; }`;

/**
 * The Leaflet page. `embedded` = the Viertel band in the world scene: the same patchwork renderer and overlays, but the
 * map itself is not interactive (no drag, zoom, tap, zoom control; the RN side puts a Pressable over it), the Range fit
 * leaves room for the signs at the top and bottom of the band, and the clouds stand still (no endless repaint).
 * The init flag is baked into the string as `const EMBEDDED`.
 */
function buildMapHTML(embedded: boolean): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tails Up Map</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    /* Toy-world look: see mapTheme.ts. Wild marker = docs/decisions/somewhere-wild.md's warm accent. */
${MAP_THEME_CSS}
${MAP_MARKER_CSS}
${MAP_NOTES_CSS}
${PARTNER_TRAIL_CSS}
${embedded ? EMBEDDED_TILE_SEAM_CSS : ''}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
${HOME_RANGE_RENDERER_SCRIPT}
${NEIGHBOUR_OVERLAY_SCRIPT}
${GAP_SPLIT_SCRIPT}
${PARTNER_TRAIL_SCRIPT}
${STITCH_PATCH_JS}
${MAP_NOTES_JS}

    const EMBEDDED = ${embedded ? 'true' : 'false'};
    const map = L.map('map', EMBEDDED
      ? { attributionControl: false, zoomControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false, zoomSnap: 0.25 }
      : { attributionControl: false }).setView([0, 0], 2);
${MAP_TILE_LAYER_JS}
${MAP_CLOUDS_JS}
    if (EMBEDDED) {
      // Still clouds: the CSS drift animation would keep the WebView repainting forever.
      var stillCloudLeft = ['6%', '46%', '74%'];
      document.querySelectorAll('.map-cloud').forEach(function (el, i) {
        el.style.animation = 'none';
        el.style.left = stillCloudLeft[i % 3];
      });
    }
${CORNER_SIGN_JS}

    let trailPolyline = null;
    let doghouseMarker = null;
    let currentMarker = null;
    let hasCentered = false;
    // The Home Range layer group (Bloom fill + Range outline), replacing
    // the old per-walk territory polygon layers entirely — see
    // docs/decisions/2026-08-21-home-range.md Decision 6.
    let homeRangeLayerGroup = null;
    // The "Somewhere Wild" marker (docs/decisions/somewhere-wild.md) — the
    // single most-worth-visiting wild cluster, or a recent New Ground
    // discovery. Mirrors currentMarker's add/remove pattern; only ever one
    // at a time, matching the card's own "one spot" rule.
    let wildSpotMarker = null;
    // "Unsere Ecken": named corner signs (SHOW_CORNERS), one layer group.
    let cornersLayerGroup = null;
    // Nachbarhunde (SHOW_NEIGHBOURS): dotted soft patches under ours plus tappable name signs.
    let neighbourLayerGroup = null;
    // A household partner's walk in progress (SHOW_PARTNER_TRAIL): a stitched thread with a paw head.
    let partnerTrailGroup = null;
    // Handwritten notes (SHOW_NOTES): "heute genäht", "Zeit zum Schnuppern", the chalk hint on unknown ground.
    let notesLayerGroup = null;

    function reset() {
      if (trailPolyline) {
        map.removeLayer(trailPolyline);
        trailPolyline = null;
      }
      if (doghouseMarker) {
        map.removeLayer(doghouseMarker);
        doghouseMarker = null;
      }
      if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
      }
      hasCentered = false;
    }

    function reportToRN(tag, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_LOG', tag, data }));
      }
    }

    reportToRN('WEBVIEW_LOADED', { hasRNBridge: !!window.ReactNativeWebView, leafletLoaded: typeof L !== 'undefined' });
${MAP_THEME_PROBE_JS}

    function handleMessage(e) {
      try {
        handleMessageUnsafe(e);
      } catch (error) {
        reportToRN('WEBVIEW_ERROR', { message: String(error && error.message || error), raw: e.data });
      }
    }

    function handleMessageUnsafe(e) {
      const { type, payload } = JSON.parse(e.data);

      if (type === 'RESET') {
        reset();
      }

      if (type === 'UPDATE_LOCATION') {
        const { latitude, longitude } = payload;

        // Update current position marker
        if (!currentMarker) {
          currentMarker = L.marker([latitude, longitude], {
            icon: L.divIcon({ className: 'current-position', html: ${JSON.stringify(PAW_MARKER_HTML)}, iconSize: [36, 36] })
          }).addTo(map);
        } else {
          currentMarker.setLatLng([latitude, longitude]);
        }

        // Center + zoom in on the first real fix; pan on every fix after that
        if (!hasCentered) {
          setTimeout(() => {
            map.invalidateSize();
            map.setView([latitude, longitude], 16);
          }, 100);
          hasCentered = true;
        } else {
          map.panTo([latitude, longitude]);
        }
      }

      if (type === 'UPDATE_TRAIL') {
        const { locations } = payload;

        if (trailPolyline) {
          map.removeLayer(trailPolyline);
          trailPolyline = null;
        }

        if (locations.length > 1) {
          // Cut where a step fails the distance rule (gapSplit): no straight line across a jump, ride or signal loss.
          const latLngs = gapSplit(locations).map((run) => run.map((loc) => [loc.latitude, loc.longitude]));
          // Trampelpfad: worn dirt bed + paw stamps (zero-length-ish round dashes).
          const trailBed = L.polyline(latLngs, { color: '${TRAIL_BED.color}', weight: ${TRAIL_BED.weight}, opacity: ${TRAIL_BED.opacity}, lineCap: 'round', lineJoin: 'round' });
          const trailStamps = L.polyline(latLngs, { color: '${TRAIL_STAMPS.color}', weight: ${TRAIL_STAMPS.weight}, opacity: 1, dashArray: '${TRAIL_STAMPS.dashArray}', lineCap: 'round', lineJoin: 'round' });
          trailPolyline = L.layerGroup([trailBed, trailStamps]).addTo(map);
        }

        // Doghouse at the walk's start point; cleared when the trail is empty.
        if (locations.length > 0) {
          const start = [locations[0].latitude, locations[0].longitude];
          if (!doghouseMarker) {
            doghouseMarker = L.marker(start, {
              icon: L.divIcon({ className: 'doghouse-marker', html: ${JSON.stringify(DOGHOUSE_HTML)}, iconSize: [40, 40], iconAnchor: [20, 36] }),
              interactive: false
            }).addTo(map);
          } else {
            doghouseMarker.setLatLng(start);
          }
        } else if (doghouseMarker) {
          map.removeLayer(doghouseMarker);
          doghouseMarker = null;
        }
      }

      // Replaces the old SHOW_ALL_TERRITORIES/SHOW_TERRITORY polygon
      // messages — one bounded raster payload regardless of walk count (see
      // design.md Decision 6). Also used for the live-walk painting
      // preview (tasks.md task 5.3): MapView.tsx re-sends this with the
      // in-progress walk's cells overlaid as fresh paint, well before
      // they're persisted.
      if (type === 'SHOW_HOME_RANGE') {
        const { raster, fitBounds, frame, insetBottom } = payload;
        homeRangeLayerGroup = renderHomeRangeToMap(map, raster, homeRangeLayerGroup);

        if (fitBounds && raster) {
          // frame (optional): a larger origin/w/h box that also holds the nearest neighbour Ranges.
          const origin = (frame || raster).origin;
          const fh = (frame || raster).h;
          const fw = (frame || raster).w;
          const south = origin[1] * HR_D_LAT_DEG;
          const north = (origin[1] + fh) * HR_D_LAT_DEG;
          const midRow = origin[1] + Math.floor(fh / 2);
          const dLon = hrDLonForRow(midRow);
          const west = origin[0] * dLon;
          const east = (origin[0] + fw) * dLon;
          setTimeout(() => {
            map.invalidateSize();
            const fitBox = [[south, west], [north, east]].map((p) => L.latLng(p[0], p[1]));
            if (EMBEDDED) {
              // Zoom 15..17 only: a tiny Range never zooms out to the city, a wide one is cropped instead of shrunk.
              const padBottom = 70 + (insetBottom || 0);
              map.fitBounds(fitBox, { maxZoom: 17, paddingTopLeft: [20, 76], paddingBottomRight: [20, padBottom], animate: false });
              if (map.getZoom() < 15) {
                map.setView(L.latLngBounds(fitBox).getCenter(), 15, { animate: false });
                map.panBy([0, -(76 - padBottom) / 2], { animate: false });
              }
            }
            else map.fitBounds(fitBox, { maxZoom: 18, padding: [20, 20] });
          }, 100);
        }

        // Diagnostics for the Debug Log: did the fill layer actually paint?
        // Re-read after 600ms so tile/zoom-settled state is captured too.
        const reportRangeRendered = (phase) => {
          const stats = homeRangeLayerGroup && homeRangeLayerGroup.hrStats;
          const fill = stats && stats.fillLayer;
          const el = fill && fill._el;
          const mode = stats ? stats.mode : null;
          reportToRN('RANGE_RENDERED', {
            phase,
            cells: stats ? stats.cells : 0,
            bounds: stats ? stats.bounds : null,
            pane: stats ? stats.pane : null,
            mode,
            polygons: stats ? stats.polygons : 0,
            imageLoaded: !!el && el.width > 0 && el.height > 0,
            drawnPixels: fill ? fill.hrDrawnPixels : 0,
            zoom: map.getZoom(),
            mapSize: [map.getSize().x, map.getSize().y]
          });
        };
        reportRangeRendered('immediate');
        setTimeout(() => reportRangeRendered('settled'), 600);

        reportToRN('SHOW_HOME_RANGE_APPLIED', {
          hasRaster: !!raster,
          w: raster ? raster.w : 0,
          h: raster ? raster.h : 0
        });
      }

      // docs/decisions/somewhere-wild.md — mirrors SHOW_HOME_RANGE's own
      // shape: a small, typed bridge message, not a new mechanism. payload
      // is { latitude, longitude } or null to clear (neither the wild
      // cluster nor a recent New Ground discovery currently qualifies).
      if (type === 'SHOW_WILD_SPOT') {
        if (wildSpotMarker) {
          map.removeLayer(wildSpotMarker);
          wildSpotMarker = null;
        }
        if (payload) {
          wildSpotMarker = L.marker([payload.latitude, payload.longitude], {
            icon: L.divIcon({ className: 'wild-spot-marker', html: ${JSON.stringify(WILD_PIN_HTML)}, iconSize: [30, 38], iconAnchor: [15, 38] })
          }).addTo(map);
        }
        reportToRN('SHOW_WILD_SPOT_APPLIED', { hasSpot: !!payload });
      }

      // "Unsere Ecken": payload is { corners: [{ id, name, ix, iy }] }, each placed at the centre of grid cell (ix, iy)
      // as a small wood sign. An empty/missing list clears. On the full map a tap on a sign posts
      // { type: 'CORNER_TAPPED', id } to React Native (the naming sheet); the embedded band is not interactive.
      if (type === 'SHOW_CORNERS') {
        if (cornersLayerGroup) {
          map.removeLayer(cornersLayerGroup);
          cornersLayerGroup = null;
        }
        const corners = (payload && payload.corners) || [];
        if (corners.length > 0) {
          cornersLayerGroup = L.layerGroup().addTo(map);
          corners.forEach((c) => {
            const marker = L.marker(hrCellCenterLatLng(c.ix, c.iy), {
              icon: L.divIcon({ className: 'corner-marker', html: cornerSignHTML(c.name), iconSize: [0, 0] }),
              interactive: !EMBEDDED
            }).addTo(cornersLayerGroup);
            if (!EMBEDDED) {
              marker.on('click', function () {
                if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CORNER_TAPPED', id: c.id }));
              });
            }
          });
        }
        reportToRN('SHOW_CORNERS_APPLIED', { count: corners.length });
      }

      // Nachbarhunde: payload { items: [{ id, name, cells: [{ ix, iy }], label: { ix, iy } }] } (neighbourOverlay.ts).
      // An empty/missing list clears. Tapping a name sign posts { type: 'NEIGHBOUR_TAPPED', id } to React Native.
      if (type === 'SHOW_NEIGHBOURS') {
        const nbItems = (payload && payload.items) || [];
        neighbourLayerGroup = hrRenderNeighbours(map, nbItems, neighbourLayerGroup, function (id) {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'NEIGHBOUR_TAPPED', id: id }));
        });
        reportToRN('SHOW_NEIGHBOURS_APPLIED', { count: nbItems.length, patches: neighbourLayerGroup ? neighbourLayerGroup.nbStats.patches : 0 });
      }

      // Alex's thread: payload { points: [{ lat, lon }], name } (partnerTrail.ts). Empty points clear it.
      if (type === 'SHOW_PARTNER_TRAIL') {
        partnerTrailGroup = ptRenderLive(map, payload, partnerTrailGroup, {
          set: function (fn, ms) { return setInterval(fn, ms); },
          clear: function (handle) { clearInterval(handle); }
        });
        reportToRN('SHOW_PARTNER_TRAIL_APPLIED', { points: partnerTrailGroup ? partnerTrailGroup.ptStats.points : 0 });
      }

      // Heimkehr beat 1: payload { segments?: [[[lat, lon], [lat, lon]], ...] } (new-ground streets, drawn coral).
      if (type === 'STITCH_PATCH') {
        const stitched = hrStitchPatch(map, homeRangeLayerGroup && homeRangeLayerGroup.hrPatches, (payload && payload.segments) || [], function () { return Date.now(); }, function (fn) { requestAnimationFrame(fn); });
        reportToRN('STITCH_PATCH_APPLIED', { patches: stitched });
      }

      // payload { notes: [{ text, lat, lon, anchor?: 'center' | 'below' | 'abovePin', kind?: 'ink' | 'chalk' }] }; empty clears.
      if (type === 'SHOW_NOTES') {
        const noteList = (payload && payload.notes) || [];
        notesLayerGroup = renderMapNotes(map, noteList, notesLayerGroup);
        if (EMBEDDED) filterMapNotes(map, notesLayerGroup);
        reportToRN('SHOW_NOTES_APPLIED', { count: noteList.length });
      }

      // Embedded Viertel with no Range yet: centre on a known position (payload { latitude, longitude, zoom }).
      if (type === 'SET_VIEW') {
        setTimeout(() => {
          map.invalidateSize();
          map.setView([payload.latitude, payload.longitude], payload.zoom || 16, { animate: false });
          // The lower part of the page is hidden overscan: move the point up into the visible band.
          if (payload.insetBottom) map.panBy([0, payload.insetBottom / 2], { animate: false });
        }, 100);
      }

      // docs/decisions/somewhere-wild.md — pans/zooms to a specific spot on
      // "Somewhere Wild" card tap (tasks.md task 5.2). Distinct from
      // SHOW_WILD_SPOT (which only places/clears the marker) so the card can
      // re-pan to an already-shown marker without re-sending it.
      if (type === 'PAN_TO_SPOT') {
        const { latitude, longitude } = payload;
        map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
      }
    }

    // Embedded band: notes outside the fitted view stay hidden (re-checked whenever the view settles).
    map.on('moveend', function () { if (EMBEDDED) filterMapNotes(map, notesLayerGroup); });

    // Android WebView delivers postMessage on document; iOS delivers on window.
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);
  <\/script>
</body>
</html>
`;
}

export const mapHTML = buildMapHTML(false);
export const mapHTMLEmbedded = buildMapHTML(true);

import { HOME_RANGE_RENDERER_SCRIPT } from './homeRangeRendererScript';
import { tokens } from '../ui/tokens';
import { DOGHOUSE_HTML, MAP_CLOUDS_JS, MAP_MARKER_CSS, MAP_THEME_CSS, MAP_THEME_PROBE_JS, MAP_TILE_LAYER_JS, PAW_MARKER_HTML, WILD_PIN_HTML } from './mapTheme';

export const mapHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dog Territory Map</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    /* Toy-world look: see mapTheme.ts. Wild marker = docs/decisions/somewhere-wild's warm accent. */
${MAP_THEME_CSS}
${MAP_MARKER_CSS}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
${HOME_RANGE_RENDERER_SCRIPT}

    const map = L.map('map', { attributionControl: false }).setView([0, 0], 2);
${MAP_TILE_LAYER_JS}
${MAP_CLOUDS_JS}

    let trailPolyline = null;
    let doghouseMarker = null;
    let currentMarker = null;
    let hasCentered = false;
    // The Home Range layer group (Bloom fill + Range outline), replacing
    // the old per-walk territory polygon layers entirely — see
    // docs/decisions/home-range/design.md Decision 6.
    let homeRangeLayerGroup = null;
    // The "Somewhere Wild" marker (docs/decisions/somewhere-wild) — the
    // single most-worth-visiting wild cluster, or a recent New Ground
    // discovery. Mirrors currentMarker's add/remove pattern; only ever one
    // at a time, matching the card's own "one spot" rule.
    let wildSpotMarker = null;

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
          const latLngs = locations.map((loc) => [loc.latitude, loc.longitude]);
          // Drawn-path look: cream under-stroke + green main stroke, rounded.
          const trailUnder = L.polyline(latLngs, { color: '${tokens.white}', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round' });
          const trailMain = L.polyline(latLngs, { color: '${tokens.green}', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' });
          // Paw-dot overlay: zero-length round dashes every 14px read as paw prints along the route.
          const trailDots = L.polyline(latLngs, { color: '${tokens.brown}', weight: 6, opacity: 0.9, dashArray: '0 14', lineCap: 'round', lineJoin: 'round' });
          trailPolyline = L.layerGroup([trailUnder, trailMain, trailDots]).addTo(map);
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
        const { raster, fitBounds } = payload;
        homeRangeLayerGroup = renderHomeRangeToMap(map, raster, homeRangeLayerGroup);

        if (fitBounds && raster) {
          const origin = raster.origin;
          const south = origin[1] * HR_D_LAT_DEG;
          const north = (origin[1] + raster.h) * HR_D_LAT_DEG;
          const midRow = origin[1] + Math.floor(raster.h / 2);
          const dLon = hrDLonForRow(midRow);
          const west = origin[0] * dLon;
          const east = (origin[0] + raster.w) * dLon;
          setTimeout(() => {
            map.invalidateSize();
            map.fitBounds([[south, west], [north, east]].map((p) => L.latLng(p[0], p[1])), { maxZoom: 18, padding: [20, 20] });
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

      // docs/decisions/somewhere-wild — mirrors SHOW_HOME_RANGE's own
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

      // docs/decisions/somewhere-wild — pans/zooms to a specific spot on
      // "Somewhere Wild" card tap (tasks.md task 5.2). Distinct from
      // SHOW_WILD_SPOT (which only places/clears the marker) so the card can
      // re-pan to an already-shown marker without re-sending it.
      if (type === 'PAN_TO_SPOT') {
        const { latitude, longitude } = payload;
        map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
      }
    }

    // Android WebView delivers postMessage on document; iOS delivers on window.
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);
  <\/script>
</body>
</html>
`;

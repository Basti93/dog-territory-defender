import { HOME_RANGE_RENDERER_SCRIPT } from './homeRangeRendererScript';

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
    .current-position { width: 12px; height: 12px; background: #3498DB; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 8px rgba(52, 152, 219, 0.6); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
${HOME_RANGE_RENDERER_SCRIPT}

    const map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 20
    }).addTo(map);

    let trailPolyline = null;
    let currentMarker = null;
    let hasCentered = false;
    // The Home Range layer group (Bloom fill + Range outline), replacing
    // the old per-walk territory polygon layers entirely — see
    // openspec/changes/home-range/design.md Decision 6.
    let homeRangeLayerGroup = null;

    function reset() {
      if (trailPolyline) {
        map.removeLayer(trailPolyline);
        trailPolyline = null;
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
            icon: L.divIcon({ className: 'current-position', iconSize: [12, 12] })
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
          trailPolyline = L.polyline(latLngs, {
            color: '#3498DB',
            weight: 3,
            opacity: 0.8,
            dashArray: '5, 5',
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);
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

        reportToRN('SHOW_HOME_RANGE_APPLIED', {
          hasRaster: !!raster,
          w: raster ? raster.w : 0,
          h: raster ? raster.h : 0
        });
      }
    }

    // Android WebView delivers postMessage on document; iOS delivers on window.
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);
  <\/script>
</body>
</html>
`;

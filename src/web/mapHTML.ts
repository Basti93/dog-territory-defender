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
    const map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 20
    }).addTo(map);

    let trailPolyline = null;
    let territoryPolygon = null;
    let currentMarker = null;
    let hasCentered = false;
    const allTerritoriesLayer = L.layerGroup().addTo(map);

    function reset() {
      if (trailPolyline) {
        map.removeLayer(trailPolyline);
        trailPolyline = null;
      }
      if (territoryPolygon) {
        map.removeLayer(territoryPolygon);
        territoryPolygon = null;
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

      if (type === 'SHOW_ALL_TERRITORIES') {
        const { territories } = payload;

        allTerritoriesLayer.clearLayers();

        const allLatLngs = [];
        territories.forEach((t) => {
          if (t.coordinates.length > 2) {
            const latLngs = t.coordinates.map((coord) => [coord[0], coord[1]]);
            L.polygon(latLngs, {
              color: '#2ECC71',
              weight: 2,
              opacity: 0.8,
              fillColor: '#2ECC71',
              fillOpacity: 0.2
            }).addTo(allTerritoriesLayer);
            allLatLngs.push(...latLngs);
          }
        });

        if (allLatLngs.length > 0) {
          const group = new L.featureGroup([L.polyline(allLatLngs)]);
          const bounds = group.getBounds();
          setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(bounds.pad(0.1), { maxZoom: 18 });
            reportToRN('SHOW_ALL_TERRITORIES_APPLIED', {
              territoryCount: territories.length,
              polygonsDrawn: allTerritoriesLayer.getLayers().length,
              totalPoints: allLatLngs.length,
              bounds: bounds.toBBoxString(),
              resultingZoom: map.getZoom(),
              containerSize: [map.getSize().x, map.getSize().y],
            });
          }, 100);
        } else {
          reportToRN('SHOW_ALL_TERRITORIES_APPLIED', {
            territoryCount: territories.length,
            polygonsDrawn: allTerritoriesLayer.getLayers().length,
            totalPoints: 0,
          });
        }
      }

      if (type === 'SHOW_TERRITORY') {
        const { coordinates } = payload;

        if (territoryPolygon) {
          map.removeLayer(territoryPolygon);
          territoryPolygon = null;
        }

        if (coordinates.length > 2) {
          const latLngs = coordinates.map((coord) => [coord[0], coord[1]]);
          territoryPolygon = L.polygon(latLngs, {
            color: '#2ECC71',
            weight: 2,
            opacity: 0.8,
            fillColor: '#2ECC71',
            fillOpacity: 0.2
          }).addTo(map);

          // Fit map to territory bounds
          const group = new L.featureGroup([L.polyline(latLngs)]);
          const bounds = group.getBounds();
          setTimeout(() => {
            map.invalidateSize();
            map.fitBounds(bounds.pad(0.1), { maxZoom: 18 });
          }, 100);
        }
      }
    }

    // Android WebView delivers postMessage on document; iOS delivers on window.
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);
  <\/script>
</body>
</html>
`;

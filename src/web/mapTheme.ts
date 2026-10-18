import { tokens } from '../ui/tokens';

// Shared "toy world" look for the Leaflet WebViews (mapHTML, walkPortraitHTML,
// portraitHTML), so the map reads as part of the same soft-clay world as the
// Buddy/Den art. Styling only: nothing here changes any bridge message,
// projection, or the Home Range renderer. Colours reuse existing tokens
// from src/ui/tokens.ts (imported below); every other colour here is
// derived from those tokens via `mixHex`/`rgba` below, never a new literal.

/** OSM Humanitarian (HOT) raster tiles: paler, fewer colours, no key. (CARTO Voyager showed "API key required" on device; standard OSM was too busy.) */
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';
export const MAP_TILE_ATTRIBUTION = '© OpenStreetMap contributors, tiles © HOT / OSM France';
export const MAP_TILE_HOST_SUFFIX = 'tile.openstreetmap.fr';

/** Pull tiles toward the pastel palette. Used as CSS on img.leaflet-tile and (where supported) as canvas ctx.filter. */
export const MAP_TILE_FILTER = 'saturate(0.8) brightness(1.03) contrast(0.95) hue-rotate(-6deg)';
export const MAP_TINT_COLOR = tokens.meadow;
export const MAP_TINT_ALPHA = 0.14;

const mixHex = (a: string, b: string, t: number): string => {
  const p = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(p(a, i) * (1 - t) + p(b, i) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
};
const rgba = (hex: string, alpha: number): string =>
  `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

const CREAM = tokens.white; // the token "cream" is #FAFAF8
// Map background while tiles load: meadow washed halfway toward cream.
const MAP_BG = mixHex(tokens.meadow, tokens.white, 0.5);

const svgUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// Paw glyph: one pad + four toes, in green on a cream disc with a green ring.
const PAW_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="${CREAM}" stroke="${tokens.green}" stroke-width="4"/><g fill="${tokens.green}"><ellipse cx="20" cy="25" rx="6.5" ry="5"/><ellipse cx="12.5" cy="19" rx="2.6" ry="3.4"/><ellipse cx="17.5" cy="14" rx="2.6" ry="3.4"/><ellipse cx="22.5" cy="14" rx="2.6" ry="3.4"/><ellipse cx="27.5" cy="19" rx="2.6" ry="3.4"/></g></svg>`;

// Warm clay pin with a cream centre; anchored at its bottom tip.
const WILD_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40"><path d="M16 38 C16 38 3 24 3 14 A13 13 0 0 1 29 14 C29 24 16 38 16 38 Z" fill="${tokens.warm}" stroke="${CREAM}" stroke-width="3"/><circle cx="16" cy="14" r="5.5" fill="${CREAM}"/></svg>`;

// Doghouse at the walk start: clay-style hut (brown walls, warm roof, cream door).
const DOGHOUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="7" y="18" width="26" height="18" rx="3" fill="${tokens.brown}" stroke="${CREAM}" stroke-width="2"/><path d="M3 20 L20 5 L37 20 Z" fill="${tokens.warm}" stroke="${CREAM}" stroke-width="2" stroke-linejoin="round"/><path d="M15 36 V27 A5 5 0 0 1 25 27 V36 Z" fill="${CREAM}"/></svg>`;

// Soft cloud: three overlapping circles on a flat base.
const CLOUD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 56"><g fill="${CREAM}" fill-opacity="0.85"><circle cx="36" cy="34" r="18"/><circle cx="62" cy="24" r="22"/><circle cx="88" cy="34" r="17"/><rect x="30" y="34" width="64" height="17" rx="8"/></g></svg>`;

/** CSS shared by the live map and walk portrait (tile filter + tint element + attribution pill). The tint element is created by MAP_TILE_LAYER_JS. */
export const MAP_THEME_CSS = `
    /* Filter on the tile <img>s themselves (NOT the pane too: they would compound). Some Android WebViews drop a filter set on the hardware-composited .leaflet-tile-pane. */
    img.leaflet-tile { filter: ${MAP_TILE_FILTER}; will-change: filter; }
    /* The tint lives inside the tile pane (above the tile layers, z-index 1) so only tiles are tinted. */
    .map-tint { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 10; background: ${MAP_TINT_COLOR}; opacity: ${MAP_TINT_ALPHA}; mix-blend-mode: multiply; }
    .leaflet-bar { border: none !important; box-shadow: none !important; }
    .leaflet-bar a, .leaflet-bar a:hover { background: ${CREAM}; color: ${tokens.brown}; border: none; border-radius: 14px !important; width: 34px; height: 34px; line-height: 34px; margin-bottom: 8px; font-weight: 700; box-shadow: 0 2px 5px ${rgba(tokens.text, 0.25)}; }
    .leaflet-container { background: ${MAP_BG}; font-family: -apple-system, system-ui, sans-serif; }
    .leaflet-control-attribution { background: ${rgba(CREAM, 0.92)} !important; border-radius: 10px 0 0 0; padding: 1px 8px; font-size: 10px; color: ${tokens.text}; margin: 0; }
    .leaflet-control-attribution a { color: ${tokens.text}; text-decoration: underline; }`;

/** CSS for the live-map markers (mapHTML only). Leaflet owns the outer divIcon element's positioning; all styling lives on inner children. */
export const MAP_MARKER_CSS = `
    .paw-marker, .wild-pin { position: relative; width: 100%; height: 100%; filter: drop-shadow(0 2px 3px ${rgba(tokens.text, 0.3)}); }
    .paw-marker { background: url("${svgUrl(PAW_MARKER_SVG)}") center / contain no-repeat; }
    .paw-marker::before { content: ''; position: absolute; inset: -2px; border-radius: 50%; border: 3px solid ${tokens.green}; opacity: 0; animation: paw-breathe 2.4s ease-out infinite; }
    @keyframes paw-breathe { 0% { transform: scale(0.9); opacity: 0.55; } 100% { transform: scale(1.9); opacity: 0; } }
    .wild-pin { background: url("${svgUrl(WILD_PIN_SVG)}") center / contain no-repeat; }
    .doghouse { width: 100%; height: 100%; background: url("${svgUrl(DOGHOUSE_SVG)}") center / contain no-repeat; filter: drop-shadow(0 2px 3px ${rgba(tokens.text, 0.3)}); }
    .map-clouds { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 260; overflow: hidden; }
    .map-cloud { position: absolute; background: url("${svgUrl(CLOUD_SVG)}") center / contain no-repeat; animation: cloud-drift linear infinite; }
    @keyframes cloud-drift { from { transform: translateX(-160px); } to { transform: translateX(110vw); } }`;

/** divIcon inner HTML for the walk-start doghouse (see MAP_MARKER_CSS). */
export const DOGHOUSE_HTML = '<div class="doghouse"></div>';

/** divIcon inner HTML for the two markers (see MAP_MARKER_CSS). */
export const PAW_MARKER_HTML = '<div class="paw-marker"></div>';
export const WILD_PIN_HTML = '<div class="wild-pin"></div>';

/**
 * JS (runs in the page) that builds the themed tile layer, the attribution
 * pill and the tile-only tint. The tint div lives in Leaflet's TILE pane
 * (above the tile layers) so only tiles are tinted, never the Home Range,
 * trail or markers; it is re-positioned on every move so it always covers the
 * viewport despite the map pane's translation.
 */
export const MAP_TILE_LAYER_JS = `
    L.tileLayer(${JSON.stringify(MAP_TILE_URL)}, {
      attribution: ${JSON.stringify(MAP_TILE_ATTRIBUTION)},
      subdomains: 'abc',
      maxZoom: 19
    }).addTo(map);
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

    (function () {
      var tint = L.DomUtil.create('div', 'map-tint', map.getPane('tilePane'));
      function syncTint() {
        var size = map.getSize();
        tint.style.width = size.x + 'px';
        tint.style.height = size.y + 'px';
        L.DomUtil.setPosition(tint, map.containerPointToLayerPoint([0, 0]));
      }
      map.on('move zoom viewreset resize', syncTint);
      syncTint();
    })();`;

/**
 * Live map only: 3 drifting clouds across the top 20% of the viewport, in the
 * map pane at z-index 260 (above tiles + tint, below the 400+ overlay/marker
 * panes). Synced to the viewport like the tint.
 */
export const MAP_CLOUDS_JS = `
    (function () {
      var box = L.DomUtil.create('div', 'map-clouds', map.getPane('mapPane'));
      [[8, 90, 42, 70, 0], [4, 120, 56, 95, -35], [12, 80, 38, 120, -70]].forEach(function (c) {
        var el = L.DomUtil.create('div', 'map-cloud', box);
        el.style.top = c[0] + '%';
        el.style.width = c[1] + 'px';
        el.style.height = c[2] + 'px';
        el.style.animationDuration = c[3] + 's';
        el.style.animationDelay = c[4] + 's';
      });
      function syncClouds() {
        var size = map.getSize();
        box.style.width = size.x + 'px';
        box.style.height = Math.round(size.y * 0.2) + 'px';
        L.DomUtil.setPosition(box, map.containerPointToLayerPoint([0, 0]));
      }
      map.on('move zoom viewreset resize', syncClouds);
      syncClouds();
    })();`;

/**
 * Live map only: once the first tile <img> exists, report whether the theme
 * CSS actually took effect (computed filter + tint element present), as a
 * WEBVIEW_LOG the RN side forwards to the Debug Log. Needs reportToRN from mapHTML.
 */
export const MAP_THEME_PROBE_JS = `
    (function () {
      var reported = false;
      function probe() {
        if (reported) return;
        var tile = document.querySelector('img.leaflet-tile');
        if (!tile) return;
        reported = true;
        var f = getComputedStyle(tile).filter;
        window.__mapThemeApplied = !!f && f !== 'none';
        reportToRN('MAP_THEME_APPLIED', {
          applied: window.__mapThemeApplied,
          tileFilter: f,
          tintPresent: !!document.querySelector('.leaflet-tile-pane > .map-tint'),
          tileSrc: tile.src
        });
      }
      map.eachLayer(function (l) { if (l.on) l.on('tileload', probe); });
      setTimeout(probe, 4000);
    })();`;

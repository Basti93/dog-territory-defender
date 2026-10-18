import { tokens } from '../ui/tokens';

// Shared "toy world" look for the Leaflet WebViews (mapHTML, walkPortraitHTML,
// portraitHTML), so the map reads as part of the same soft-clay world as the
// Buddy/Den art. Styling only: nothing here changes any bridge message,
// projection, or the Home Range renderer. Spec tokens come from
// src/ui/tokens.ts; the "Flickenteppich" material colours (linen, yarn cream,
// felt greens, trampelpfad browns, wood sign, coral) are literals from
// handover/redesign/mockups/02-viertel.html, listed in MATERIAL below.

/** OSM Humanitarian (HOT) raster tiles: paler, fewer colours, no key. (CARTO Voyager showed "API key required" on device; standard OSM was too busy.) */
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png';
export const MAP_TILE_ATTRIBUTION = '© OpenStreetMap contributors, tiles © HOT / OSM France';
export const MAP_TILE_HOST_SUFFIX = 'tile.openstreetmap.fr';

/**
 * Flickenteppich material colours (handover/redesign/mockups/02-viertel.html).
 * Felt patch fills live in homeRangeRendererScript.ts (HR_FILL_BANDS / HR_PATCH_PATTERN_DEFS).
 */
export const MATERIAL = {
  linen: '#EFE7D6',
  linenThread: '#E6DCC6',
  yarn: '#FFFBF0', // stitched seams
  blockCream: '#E4DBC5', // city blocks on the quiet map
  pathBed: '#C9A06A', // Trampelpfad
  pawStamp: '#8B6F47',
  woodSign: '#E9C98E',
  woodEdge: '#B08D5E',
  woodBottom: '#7A5C3A',
  coral: '#F2786E', // Somewhere-Wild pin
} as const;

/**
 * Quiet cream map: wash the HOT tiles toward grey-cream so blocks land near
 * MATERIAL.blockCream, streets stay near white and labels stay readable.
 * Used as CSS on img.leaflet-tile and (where supported) as canvas ctx.filter.
 */
export const MAP_TILE_FILTER = 'saturate(0.2) sepia(0.2) brightness(1.16) contrast(0.8)';
export const MAP_TINT_COLOR = MATERIAL.linen;
export const MAP_TINT_ALPHA = 0.35;
/** Linen weave "paper" over the tiles, under the patches. */
export const MAP_PAPER_ALPHA = 0.3;
const LINEN_WEAVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="6"><rect width="6" height="6" fill="${MATERIAL.linen}"/><path d="M0 3 H6 M3 0 V6" stroke="${MATERIAL.linenThread}" stroke-width="1"/></svg>`;

/** Trampelpfad: walked routes as a worn dirt path with paw stamps (live trail + walk portrait). */
export const TRAIL_BED = { color: MATERIAL.pathBed, weight: 7, opacity: 0.55 } as const;
export const TRAIL_STAMPS = { color: MATERIAL.pawStamp, weight: 3, dashArray: '2 10' } as const;

const rgba = (hex: string, alpha: number): string =>
  `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

const CREAM = tokens.white; // the token "cream" is #FAFAF8
// Map background while tiles load: linen.
const MAP_BG = MATERIAL.linen;

const svgUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// Paw glyph: one pad + four toes, in green on a cream disc with a green ring.
const PAW_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="${CREAM}" stroke="${tokens.green}" stroke-width="4"/><g fill="${tokens.green}"><ellipse cx="20" cy="25" rx="6.5" ry="5"/><ellipse cx="12.5" cy="19" rx="2.6" ry="3.4"/><ellipse cx="17.5" cy="14" rx="2.6" ry="3.4"/><ellipse cx="22.5" cy="14" rx="2.6" ry="3.4"/><ellipse cx="27.5" cy="19" rx="2.6" ry="3.4"/></g></svg>`;

// Coral pin with a cream centre; anchored at its bottom tip.
const WILD_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40"><path d="M16 38 C16 38 3 24 3 14 A13 13 0 0 1 29 14 C29 24 16 38 16 38 Z" fill="${MATERIAL.coral}" stroke="${CREAM}" stroke-width="3"/><circle cx="16" cy="14" r="5.5" fill="${CREAM}"/></svg>`;

// Doghouse at the walk start: clay-style hut (brown walls, warm roof, cream door).
const DOGHOUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="7" y="18" width="26" height="18" rx="3" fill="${tokens.brown}" stroke="${CREAM}" stroke-width="2"/><path d="M3 20 L20 5 L37 20 Z" fill="${tokens.warm}" stroke="${CREAM}" stroke-width="2" stroke-linejoin="round"/><path d="M15 36 V27 A5 5 0 0 1 25 27 V36 Z" fill="${CREAM}"/></svg>`;

// Soft cloud: three overlapping circles on a flat base.
const CLOUD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 56"><g fill="${CREAM}" fill-opacity="0.85"><circle cx="36" cy="34" r="18"/><circle cx="62" cy="24" r="22"/><circle cx="88" cy="34" r="17"/><rect x="30" y="34" width="64" height="17" rx="8"/></g></svg>`;

/** CSS shared by the live map and walk portrait (tile filter + tint element + attribution pill). The tint element is created by MAP_TILE_LAYER_JS. */
export const MAP_THEME_CSS = `
    /* Filter on the tile <img>s themselves (NOT the pane too: they would compound). Some Android WebViews drop a filter set on the hardware-composited .leaflet-tile-pane. */
    img.leaflet-tile { filter: ${MAP_TILE_FILTER}; will-change: filter; }
    /* The tint lives inside the tile pane (above the tile layers, z-index 1) so only tiles are tinted. */
    .map-paper { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 11; background: url("${svgUrl(LINEN_WEAVE_SVG)}"); opacity: ${MAP_PAPER_ALPHA}; mix-blend-mode: multiply; }
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
    /* "Unsere Ecken": small wood sign (SHOW_CORNERS). Leaflet owns the outer divIcon element; styling is on the inner div. */
    .corner-sign { display: inline-block; transform: translate(-50%, 0); white-space: nowrap; font-family: Fredoka, Nunito, system-ui, sans-serif; font-weight: 600; font-size: 13px; line-height: 1.1; color: ${tokens.text}; background: ${MATERIAL.woodSign}; border: 3px solid ${MATERIAL.woodEdge}; border-radius: 10px; box-shadow: 0 3px 0 ${MATERIAL.woodBottom}; padding: 3px 10px; }
    /* Nachbarhund name sign (SHOW_NEIGHBOURS): smaller than a corner sign, tappable. Styling on the inner div; Leaflet owns the outer divIcon. */
    .neighbour-sign { display: inline-block; transform: translate(-50%, -50%); white-space: nowrap; font-family: Fredoka, Nunito, system-ui, sans-serif; font-weight: 600; font-size: 12px; line-height: 1.1; color: ${tokens.text}; background: ${MATERIAL.woodSign}; border: 2px solid ${MATERIAL.woodEdge}; border-radius: 8px; box-shadow: 0 2px 0 ${MATERIAL.woodBottom}; padding: 3px 9px; }
    .doghouse { width: 100%; height: 100%; background: url("${svgUrl(DOGHOUSE_SVG)}") center / contain no-repeat; filter: drop-shadow(0 2px 3px ${rgba(tokens.text, 0.3)}); }
    .map-clouds { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 260; overflow: hidden; }
    .map-cloud { position: absolute; background: url("${svgUrl(CLOUD_SVG)}") center / contain no-repeat; animation: cloud-drift linear infinite; }
    @keyframes cloud-drift { from { transform: translateX(-160px); } to { transform: translateX(110vw); } }`;

/** divIcon inner HTML for the walk-start doghouse (see MAP_MARKER_CSS). */
export const DOGHOUSE_HTML = '<div class="doghouse"></div>';

/** divIcon inner HTML for the two markers (see MAP_MARKER_CSS). */
export const PAW_MARKER_HTML = '<div class="paw-marker"></div>';
export const WILD_PIN_HTML = '<div class="wild-pin"></div>';

/** In-page JS defining cornerSignHTML(name): divIcon inner HTML for a named corner's wood sign. The name is user text, so it is HTML-escaped. */
export const CORNER_SIGN_JS = `
    function cornerSignHTML(name) {
      var safe = String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return '<div class="corner-sign">' + safe + '</div>';
    }`;

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
      var paper = L.DomUtil.create('div', 'map-paper', map.getPane('tilePane'));
      function syncTint() {
        var size = map.getSize();
        var origin = map.containerPointToLayerPoint([0, 0]);
        [tint, paper].forEach(function (el) {
          el.style.width = size.x + 'px';
          el.style.height = size.y + 'px';
          L.DomUtil.setPosition(el, origin);
        });
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
          paperPresent: !!document.querySelector('.leaflet-tile-pane > .map-paper'),
          tileSrc: tile.src
        });
      }
      map.eachLayer(function (l) { if (l.on) l.on('tileload', probe); });
      setTimeout(probe, 4000);
    })();`;

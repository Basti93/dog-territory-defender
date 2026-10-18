# Real map rendering (2026-08-16, shipped)
**Why:** `MapCanvas` was a bounds-fit SVG projection with no real tiles, streets or pan/zoom; a satisfying walk replay needs the real neighbourhood. `src/web/mapHTML.ts` already held a working Leaflet-in-WebView message protocol that was never mounted.
**Decisions:**
- Added `react-native-webview`; new `MapView` wraps `WebView` + `mapHTML`, same props as `MapCanvas` (`locations`, `territory`, `currentLocation`), a `useEffect` posts messages on change.
- Android fix: RN WebView `postMessage` fires on `document` on Android, `window` on iOS; listen on both.
- New `RESET` message clears trail, territory and marker layers; `MapView` sends it when `locations` becomes empty (new walk).
- Map starts at a neutral world view and `setView` (not `panTo`) on the first `UPDATE_LOCATION`, instead of the hardcoded Berlin (52.5, 13.4, zoom 16).
- `MapCanvas.tsx` deleted, no fallback renderer (it was always a placeholder).
- No spec change (`visual-design` Key Screen Intents unchanged). Needs internet for Leaflet CDN and OSM tiles; no offline tile cache; Leaflet default controls only. Bridge verified manually on device, not Jest.
**Rejected:** keeping `MapCanvas` as fallback, because two renderers duplicate and the SVG one was never a real substitute.
**Links:** `src/components/MapView.tsx`, `src/web/mapHTML.ts` (`MapCanvas.tsx` removed). Later map work: `docs/specs/home-range.md`, `docs/specs/visual-design.md`.

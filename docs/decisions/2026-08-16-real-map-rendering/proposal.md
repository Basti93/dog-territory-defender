## Why

`MapCanvas` renders the trail/territory as a bounds-fit SVG projection — no real tiles, no streets, no pan/zoom. For an actual outdoor walk, seeing your real neighborhood (not an abstract shape scaled to fit a box) matters for whether the walk feels satisfying to replay — Phase 0's core hypothesis. `src/web/mapHTML.ts` already exists as a working Leaflet-in-WebView implementation with a message-passing protocol, built earlier but never wired up — this change finishes that.

## What Changes

- Add `react-native-webview` and wire `mapHTML.ts` into a new `MapView` component, replacing `MapCanvas` in `App.tsx`.
- Fix `mapHTML.ts`'s message listener to work on both platforms — it only listens on `window.addEventListener('message', ...)`, which is iOS-only; Android WebView delivers `postMessage` on `document` instead.
- Add a `RESET` message type so the WebView clears its trail/territory/marker layers when a new walk starts (currently `SHOW_TERRITORY` only ever adds a layer, never removes one for a fresh walk).
- Center the map on the walker's actual first GPS fix instead of the hardcoded Berlin default.
- Delete `MapCanvas.tsx` — no reason to keep two map renderers; the SVG version was flagged as a placeholder from the start, not a supported fallback.
- **No spec changes.** `visual-design`'s "Key Screen Intents" already describes Map View's intent (map dominates, walk state obvious, controls reachable) without mandating a specific rendering approach — swapping the renderer doesn't change any spec'd requirement, it fulfills the existing intent better. `skip_specs: true`.
- **Not in this change:** offline tile caching, background-location tracking fixes (separate, pending an empirical test first — see today's conversation), pan/zoom gesture customization beyond what Leaflet gives by default.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- New dependency: `react-native-webview`.
- New: `src/components/MapView.tsx` (WebView host + `postMessage` bridge to `mapHTML.ts`).
- Modified: `src/web/mapHTML.ts` (dual-platform message listener, new `RESET` message handler).
- Deleted: `src/components/MapCanvas.tsx`.
- `App.tsx`: swap `MapCanvas` usage for `MapView`.
- Requires internet access at walk time (Leaflet JS/CSS from CDN + OpenStreetMap tiles) — already implicitly required for a real map, not a new constraint on top of what a "real map" means.

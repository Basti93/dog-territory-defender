## Context

`mapHTML.ts` already implements a Leaflet map with a `postMessage`-based protocol (`UPDATE_LOCATION`, `UPDATE_TRAIL`, `SHOW_TERRITORY`) listening on `window.addEventListener('message', ...)` — written for an earlier, abandoned integration attempt, never actually mounted in a `WebView`. `MapCanvas` (the current live renderer) takes `locations`, `territory`, `currentLocation` as props and re-renders on every change; the new `MapView` needs to accept the same prop shape so `App.tsx`'s call site barely changes. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Real OpenStreetMap tiles, real pan/zoom, via the existing Leaflet/WebView approach.
- Same prop interface as `MapCanvas` (`locations`, `territory`, `currentLocation`) so `App.tsx` changes minimally.
- Fix the two real bugs in `mapHTML.ts` (Android message delivery, no reset-on-new-walk) rather than just wiring it up as-is.

**Non-Goals:**
- No offline tile caching — walk-time internet access is assumed (already true for loading Leaflet itself from CDN).
- No custom map controls beyond Leaflet's defaults (zoom buttons, pinch-zoom, pan) — sufficient for Phase 0.
- No background-location tracking changes — separate, contingent on today's empirical test result.

## Decisions

**`MapView` wraps `WebView` + `mapHTML`, matching `MapCanvas`'s prop shape.** `App.tsx` swaps `<MapCanvas locations={...} territory={...} currentLocation={...} />` for `<MapView locations={...} territory={...} currentLocation={...} />` — one-line change at the call site. Internally, `MapView` holds a `WebViewRef`, and a `useEffect` keyed on `locations`/`territory`/`currentLocation` sends the appropriate `postMessage` calls whenever they change.

**Fix the Android message-delivery bug.** RN WebView's `postMessage` arrives differently per platform: iOS fires on `window`, Android fires on `document`. `mapHTML.ts` currently only listens on `window`, so messages would silently never arrive on Android. Fix: listen on both `window` and `document`, routing to the same handler.

**Add a `RESET` message.** `SHOW_TERRITORY` only ever adds a polygon layer; nothing currently clears `trailPolyline`/`territoryPolygon`/`currentMarker` when a new walk starts (`resetWalk`/fresh `startWalk`). `MapView` sends `RESET` whenever `locations` transitions to empty (a new walk beginning), and the WebView handler removes all three layers if present.

**Center on the real first fix, not a hardcoded default.** `mapHTML.ts` currently does `L.map('map').setView([52.5, 13.4], 16)` (Berlin) at init. Change: initialize the map with a neutral/world view, then on the first `UPDATE_LOCATION` message, call `map.setView(...)` (not just `panTo`) so the very first fix properly centers and zooms in, rather than waiting to visually catch up from a Berlin-centered starting point when the walker isn't in Berlin.

**Delete `MapCanvas.tsx`, don't keep it as a fallback.** It was always a placeholder (bounds-fit SVG projection, no real tiles) — CLAUDE.md's own architecture notes already flagged it as such. Keeping two renderers around is exactly the kind of duplication the project's "prefer editing over creating" rule warns against; there's no scenario in Phase 0/1 where the SVG version is preferable to a real map.

## Risks / Trade-offs

- [WebView + Leaflet-from-CDN requires internet at walk start; a dead zone at the exact moment of loading could show a blank map] → Accepted for Phase 0 — a real map fundamentally needs tile access; this isn't a new constraint the SVG version avoided in any useful way (the SVG version was never a real substitute).
- [`postMessage` bridge is inherently harder to unit test than pure logic — no automated coverage for `MapView`/`mapHTML.ts`] → Matches the precedent already set for `sqliteWalkRepository`/`sqliteDenEconomyRepository`: verified by manual on-device check (task in tasks.md), not Jest, since the thing under test is platform/WebView behavior, not app logic.

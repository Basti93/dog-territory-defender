## 1. Fix mapHTML.ts

- [x] 1.1 Listen for `postMessage` on both `window` and `document`, routing both to the same handler (Android/iOS delivery difference).
- [x] 1.2 Add a `RESET` message handler: removes `trailPolyline`/`territoryPolygon`/`currentMarker` if present.
- [x] 1.3 On the first `UPDATE_LOCATION`, call `map.setView([lat, lon], 16)` instead of relying on the hardcoded Berlin `setView` at init.

## 2. MapView component

- [x] 2.1 Add `react-native-webview` dependency (`npx expo install react-native-webview`).
- [x] 2.2 Create `src/components/MapView.tsx`: same props as `MapCanvas` (`locations`, `territory`, `currentLocation`), renders a `WebView` with `source={{ html: mapHTML }}`.
- [x] 2.3 Wire a `useEffect` that sends `UPDATE_LOCATION`/`UPDATE_TRAIL`/`SHOW_TERRITORY`/`RESET` via `webViewRef.current.postMessage(...)` whenever the relevant prop changes (`RESET` when `locations` becomes empty).

## 3. Swap into App.tsx, remove MapCanvas

- [x] 3.1 Replace `<MapCanvas .../>` with `<MapView .../>` in `App.tsx`.
- [x] 3.2 Delete `src/components/MapCanvas.tsx`.
- [x] 3.3 Manual on-device smoke check: start a walk (real or 🧪 mock), confirm real map tiles render, trail draws as you move, closing shows the territory polygon, and starting a new walk clears the old trail/polygon/marker.

## 4. Wrap-up

- [x] 4.1 Update `README.md`'s Architecture section (remove the "not a real map" callout, describe `MapView`/`mapHTML.ts` instead) and the "Debugging" section's map notes if still relevant.

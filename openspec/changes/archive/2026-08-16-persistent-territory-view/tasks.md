## 1. mapHTML.ts

- [x] 1.1 Add an `allTerritoriesLayer` (`L.layerGroup`), separate from the existing `territoryPolygon`.
- [x] 1.2 Add a `SHOW_ALL_TERRITORIES` message handler: clears and repopulates `allTerritoriesLayer` from an array of `{ coordinates }`, same styling as the existing single-territory polygon.
- [x] 1.3 Fit bounds to the union of all territories when `SHOW_ALL_TERRITORIES` is received and at least one exists.
- [x] 1.4 Confirm `reset()` does not clear `allTerritoriesLayer` (only the current-walk trail/polygon/marker).

## 2. MapView

- [x] 2.1 Add an optional `walkRepository: WalkRepository` prop to `MapView`.
- [x] 2.2 On mount and whenever `locations` transitions to empty, fetch `walkRepository.getWalks()`, filter to closed walks, send `SHOW_ALL_TERRITORIES` with their territory coordinates.

## 3. Wire into App.tsx

- [x] 3.1 Pass `walkRepository` into `<MapView />`.

## 4. Wrap-up

- [x] 4.1 Manual on-device smoke check: close a walk, tap "New Walk," confirm the just-closed territory is still visible on the idle map; close a second walk elsewhere and confirm both are visible together.
- [x] 4.2 Update `README.md`'s "What works" section.

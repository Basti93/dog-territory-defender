## 1. Type update

- [x] 1.1 Add `accuracy: number` to `Location` in `src/types.ts`.

## 2. Accuracy filtering

- [x] 2.1 In `src/utils/gps.ts`, populate `accuracy` from `position.coords.accuracy` on every constructed `Location`.
- [x] 2.2 Reject fixes with `accuracy > 30` before they reach the app: log `GPS_FIX_REJECTED` and don't invoke the caller's callback for that fix.
- [x] 2.3 Unit test the rejection logic in isolation (extract as a small pure function if not already, e.g. `isAccurateEnough(accuracy: number): boolean`).

## 3. Accuracy-aware closure

- [x] 3.1 Update `canCloseWalk` in `src/utils/geometry.ts`: closure radius = `max(firstAccuracy + lastAccuracy + 10, 100)` instead of the flat `20`.
- [x] 3.2 Update/add unit tests: closure succeeds within the 100m floor under good accuracy (including at distances that would have failed the old flat 20m); closure radius widens beyond 100m when reported accuracy is poor enough to push the accuracy-sum term higher; closure still correctly fails when genuinely too far apart regardless of accuracy.

## 4. Wrap-up

- [ ] 4.1 Manual on-device check: close a walk normally (real or emulator GPX playback, see `testing/munich-route2.gpx`), confirm closure works within the new 100m-floor radius. **Needs user — real device/emulator test.**
- [x] 4.2 Update `README.md`'s closure-condition description (`canCloseWalk() checks: ≥10 points AND distance(start, end) < 20m`) to reflect the accuracy-aware formula with its 100m floor.

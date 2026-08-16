## 1. Type + fixture updates

- [ ] 1.1 Add `accuracy: number` to `Location` in `src/types.ts`.
- [ ] 1.2 Update `src/utils/mockWalkFixtures.ts` fixtures to include a realistic `accuracy` value (e.g. `8`) per point.

## 2. Accuracy filtering

- [ ] 2.1 In `src/utils/gps.ts`, populate `accuracy` from `position.coords.accuracy` on every constructed `Location`.
- [ ] 2.2 Reject fixes with `accuracy > 30` before they reach the app: log `GPS_FIX_REJECTED` and don't invoke the caller's callback for that fix.
- [ ] 2.3 Unit test the rejection logic in isolation (extract as a small pure function if not already, e.g. `isAccurateEnough(accuracy: number): boolean`).

## 3. Accuracy-aware closure

- [ ] 3.1 Update `canCloseWalk` in `src/utils/geometry.ts`: closure radius = `firstAccuracy + lastAccuracy + 10` instead of the flat `20`.
- [ ] 3.2 Update/add unit tests: closure succeeds under good accuracy at ~old-threshold distances; closure that would have failed at a fixed 20m succeeds under poor accuracy within the new adaptive radius; closure still correctly fails when genuinely too far apart regardless of accuracy.

## 4. Wrap-up

- [ ] 4.1 Manual on-device check: close a walk normally (real or 🧪 mock, fixtures updated in 1.2), confirm closure still works as before under good conditions.
- [ ] 4.2 Update `README.md`'s closure-condition description (`canCloseWalk() checks: ≥10 points AND distance(start, end) < 20m`) to reflect the accuracy-aware formula.

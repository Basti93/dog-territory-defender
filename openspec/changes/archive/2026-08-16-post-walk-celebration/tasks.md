## 1. Extract shared tease logic

- [x] 1.1 In `src/economy/denEconomy.ts`, add `getBuildingLevel(state, building)` and `getUpgradeTease(state): UpgradeTease | null` (per design.md).
- [x] 1.2 Unit test `getUpgradeTease`: picks the cheapest affordable upgrade; falls back to cheapest overall when none affordable; returns `null` when every building is at `maxBuildingLevel`.
- [x] 1.3 Update `DenScreen.tsx` to use `getBuildingLevel`/`getUpgradeTease` instead of its inline duplicate logic; remove the now-dead local code.

## 2. CelebrationScreen

- [x] 2.1 Create `src/components/CelebrationScreen.tsx`: props `areaM2`, `treatsEarned`, `tease`, `onContinue`; shows the claimed area, treats earned, the tease (if not `null`), and a continue button.
- [x] 2.2 Add the hand-rolled confetti effect (~8 `Animated.View` pieces, token colors, one-shot on mount).

## 3. Wire into App.tsx

- [x] 3.1 Add `celebration` state; in `stopWalk()`'s closing branch, compute `getUpgradeTease` on the post-award economy state and set `celebration` instead of calling `Alert.alert`.
- [x] 3.2 Render `CelebrationScreen` as a full-screen overlay when `celebration` is non-null; `onContinue` clears it.

## 4. Wrap-up

- [x] 4.1 Manual on-device smoke check: close a walk (real or 🧪 mock), confirm the celebration screen shows area/treats/tease with confetti, and continuing returns to the map with the territory still visible.
- [x] 4.2 Update `README.md`'s "What works" section.

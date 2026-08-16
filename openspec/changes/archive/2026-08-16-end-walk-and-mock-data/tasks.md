## 1. Walk lifecycle: End Walk vs Cancel

- [x] 1.1 Add `endWalk()` in `App.tsx`: stop the location subscription and set `isTracking: false`, leaving the walk record (`closed: false`, no territory) intact — mirrors `stopWalk`'s current not-closeable branch, minus the alert.
- [x] 1.2 Add an "End Walk" button, enabled whenever `isTracking` is true, alongside "Cancel"; keep "Close Territory" only enabled/shown when `canClose` is true.
- [x] 1.3 Confirm `MapCanvas` renders an open walk's trail correctly with no polygon (should already work — verify, don't change unless broken).
- [x] 1.4 Manual check: start a walk, end it before closing, confirm trail persists and no reward/alert implying points appears.

## 2. Dev-only mock walk data

- [x] 2.1 Create `src/utils/mockWalkFixtures.ts` exporting `mockClosedLoop` and `mockOpenWalk` as `Location[]` arrays (per design.md: closed loop satisfies `canCloseWalk`, open walk does not).
- [x] 2.2 Create `src/utils/mockGps.ts` exporting `startMockWalk(fixture, callback)`, returning a `{ remove(): void }` handle, replaying the fixture via `setInterval` (~1s cadence) into `callback`.
- [x] 2.3 In `App.tsx`, add two `if (__DEV__)`-gated buttons ("Load Mock Closed Loop", "Load Mock Open Walk") that start a walk using `startMockWalk` instead of `startWatchingLocation`.
- [x] 2.4 Verify a production-style build (`__DEV__` false path) has no mock UI reachable — code review is sufficient, no separate build required for Phase 0.

## 3. Wrap-up

- [x] 3.1 Update `README.md`'s Phase 0 checklist/architecture notes if the End Walk action changes what "what works" describes.
- [x] 3.2 Log the decision in `DECISIONS.md` (End Walk vs Cancel split; mock data is dev-only, no Phase 1 economy pulled forward).

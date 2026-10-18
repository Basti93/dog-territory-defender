## Why

The in-app dev-only mock walk loader (🧪 buttons, `src/utils/mockGps.ts`/`mockWalkFixtures.ts`) replays canned GPS data entirely at the JS level — it never touches the real Android location provider, so it's useless for testing what actually needs testing now (background tracking, foreground service, real-world GPS accuracy behavior). The Android Emulator's built-in location simulator (single-point set, or full GPX route playback through the real location stack) supersedes it for every purpose the mock buttons served, and does so more realistically.

## What Changes

- Remove the `dev-mock-walk-data` capability entirely — the mock walk loader and its UI buttons.
- Delete `src/utils/mockGps.ts` and `src/utils/mockWalkFixtures.ts`.
- Remove the two `🧪 Load Mock Closed Loop`/`🧪 Load Mock Open Walk` buttons from `App.tsx`, and the `MockWalkHandle`/mock-related state (`mockSubscriptionRef` can simplify back to `subscriptionRef` semantics, though it's already collapsed to mock-only usage per `background-location-tracking`).
- New: `testing/munich-route.gpx` — a GPX route file for the Android Emulator's location route player, replacing the old mock fixtures' purpose (exercising the walk flow without physically walking) with something that goes through the real location stack.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `dev-mock-walk-data`: retiring entirely (all requirements removed) — superseded by emulator-based GPS simulation.

## Impact

- Deleted: `src/utils/mockGps.ts`, `src/utils/mockWalkFixtures.ts`.
- `App.tsx`: remove mock-walk buttons and `startMockWalkFlow`; `mockSubscriptionRef` (currently `MockWalkHandle | null`, used only by the mock flow per `background-location-tracking`'s rewrite) can be removed too, along with `stopAllTracking`'s mock-handling branch, since real tracking is now the only path.
- New: `testing/munich-route.gpx` (not app source — a dev-testing asset).
- `README.md`: replace the "dev build has two extra mock buttons" note with the emulator-route-testing instructions.

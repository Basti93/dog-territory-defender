## Context

`App.tsx` holds one `Walk` in `useState`. `stopWalk()` currently has a single branch: if `canCloseWalk()` is true it computes a territory polygon and marks the walk closed; if false it shows an alert and just stops tracking, but the walk record and its trail are still retained in state (not discarded — only `resetWalk()`/Cancel discards). `MapCanvas` already renders a trail with no polygon whenever `territory` is `undefined`, so an "open" walk needs no new visual work. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Give the user an explicit "End Walk" action distinct from "Cancel", for walks that haven't closed.
- Let development builds replay canned GPS sequences instead of live `expo-location` tracking.

**Non-Goals:**
- No new fields on `Walk`/`AppState` — an open walk is already representable as `{ closed: false, territory: undefined }`.
- No treats/points/economy of any kind (Phase 0 has none).
- No change to `canCloseWalk`'s thresholds (10 points, 20m).

## Decisions

**End Walk reuses `stopWalk`'s non-closing branch, renamed and split out.** Today, tapping "Close Territory" while not yet closeable is disabled (button shows "Keep walking..."). Add a separate "End Walk" button, always enabled while tracking, that stops the location subscription and sets `isTracking: false` — same effect the not-closeable branch already produces, just reachable directly instead of only via a disabled-button dead end. "Close Territory" keeps its current behavior unchanged for the closeable case. "Cancel" keeps calling `resetWalk()` (full discard) unchanged.

**Mock location source mirrors `startWatchingLocation`'s shape.** `startWatchingLocation(callback)` returns a `Location.LocationSubscription`-like object (`.remove()`). The mock replayer (`src/utils/mockGps.ts`) exposes the same shape — `startMockWalk(fixture, callback) => { remove() }` — internally driving `callback` off a `setInterval` (~1s, matching the real watch's `timeInterval`) over a canned coordinate array, and clearing the interval on `.remove()`. This lets `App.tsx` swap the location source without changing how the subscription is stored or torn down.

**Two fixtures, one file.** `src/utils/mockWalkFixtures.ts` exports `mockClosedLoop` (≥10 points, last within 20m of first) and `mockOpenWalk` (does not satisfy `canCloseWalk`) as plain `Location[]` arrays, coordinates offset around Berlin (matches `MapCanvas`'s existing fallback center) — exact position doesn't matter since `MapCanvas` fits bounds to whatever locations it's given.

**Dev-gating via `__DEV__`.** The two mock-trigger buttons render only `if (__DEV__)`. This is React Native's standard build-time flag; Metro strips `__DEV__`-guarded branches from release bundles, satisfying "unreachable in production" without a custom flag or config.

## Risks / Trade-offs

- [`setInterval`-based replay won't feel exactly like live GPS timing/jitter] → Not a concern here — the mock exists to exercise state transitions (closure detection, End Walk, trail rendering), not to validate real-world GPS accuracy.
- [Hardcoded fixture coordinates could look wrong if a developer expects their own city] → No mitigation needed; `MapCanvas` auto-fits to the fixture's bounds regardless of real-world location.

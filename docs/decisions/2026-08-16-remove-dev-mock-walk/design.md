## Context

`mockSubscriptionRef` in `App.tsx` (renamed from `subscriptionRef` during `background-location-tracking`) currently only ever holds a `MockWalkHandle`, since real tracking moved to a module-level subscriber inside `gps.ts`. Once the mock flow is gone, `stopAllTracking()` no longer needs a mock branch at all. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Remove the mock walk loader cleanly — no dead imports, no leftover dead state.
- `testing/munich-route.gpx` documented as the replacement testing path.

**Non-Goals:**
- Not building any in-app tooling around GPX/emulator testing — it's an external Android Studio feature, nothing for this app to integrate with.

## Decisions

**Delete `mockGps.ts`/`mockWalkFixtures.ts` outright, don't just stop importing them.** Nothing else in the codebase uses them; keeping unused files around is exactly the kind of drift the project's own rules warn against.

**`stopAllTracking()` simplifies back to just `stopWatchingLocation()`.** With no mock flow, there's nothing else to stop — the mock-branch dead code and `mockSubscriptionRef`/`MockWalkHandle` import go away together.

**`testing/` is a new top-level directory, not under `src/`.** GPX route files are test fixtures for an external tool (Android Studio's emulator), not application source — keeping them out of `src/` matches the project's existing separation (`prototype/` is similarly non-`src/`).

## Risks / Trade-offs

- [Losing a one-tap in-app way to exercise the walk flow without any setup] → Accepted — the emulator route player is one-time setup (import the GPX once) and then equally fast to trigger, while actually testing real location-stack behavior the mock never could.

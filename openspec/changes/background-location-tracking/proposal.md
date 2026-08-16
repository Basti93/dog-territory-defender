## Why

Empirical test (2026-08-16, logged via `src/utils/log.ts`) confirmed: once the app backgrounds, `watchPositionAsync` keeps firing but location accuracy collapses to ~205m (from ~9m foregrounded) — the OS silently downgrades to coarse/cell-tower-level location without a declared background-location entitlement. `game-phases`' Cross-Cutting Technical Constraints already specifies "background location tracking SHALL be opt-in" — the permission request exists (`requestBackgroundPermissionsAsync`), but the native entitlement that makes it actually work doesn't, so the constraint isn't genuinely met today. Today's real walk test is tracked with screen auto-lock disabled as a workaround (keeps the app foregrounded, sidesteps the bug without a rebuild) — this change is the real fix, for later.

## What Changes

- Add `isIosBackgroundLocationEnabled: true` and `isAndroidBackgroundLocationEnabled: true` to the `expo-location` config plugin block in `app.json`.
- This requires a native rebuild (custom dev client via `npx expo run:ios`/`run:android`, or an EAS development build) to take effect — config plugin changes don't apply inside Expo Go's generic shell. Not testable via the current Expo Go workflow.
- **No spec changes.** `game-phases`' "background location tracking SHALL be opt-in" constraint already covers this — this change makes the existing constraint actually true, it doesn't change what's required. `skip_specs: true`.
- **Not in this change:** switching to `Location.startLocationUpdatesAsync`/TaskManager (a heavier, headless-task architecture) — not needed based on today's test; the entitlement flag alone should be sufficient for `watchPositionAsync` to keep delivering full-accuracy fixes in background, per Expo's documented behavior. Revisit only if the entitlement flag alone proves insufficient after testing on a real dev-client build.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- `app.json`: `expo-location` plugin config gains the two background-location flags.
- Requires setting up a custom dev client (EAS build or local `expo run:*`) — first time this project needs one; Expo Go has been sufficient until now.
- `src/utils/gps.ts`: likely no code change needed — the fix is native config, not JS logic (see Non-Goals above).

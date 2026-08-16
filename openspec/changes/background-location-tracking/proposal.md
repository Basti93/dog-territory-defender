## Why

Empirical test (2026-08-16, logged via `src/utils/log.ts`) confirmed: once the app backgrounds, `watchPositionAsync` keeps firing but location accuracy collapses to ~205m (from ~9m foregrounded) — the OS silently downgrades to coarse/cell-tower-level location without a declared background-location entitlement. `game-phases`' Cross-Cutting Technical Constraints already specifies "background location tracking SHALL be opt-in" — the permission request exists (`requestBackgroundPermissionsAsync`), but the native entitlement that makes it actually work doesn't, so the constraint isn't genuinely met today.

**Update (real field walk, later the same day):** the entitlement fix (below) was applied and confirmed active (device permission dialog shows "Allow every time"), but a real ~3km outdoor walk still produced a visibly wrong trail — large straight-line jumps cutting across streets/buildings instead of following the real path. The entitlement alone is not sufficient; the fallback this change originally deferred (`startLocationUpdatesAsync`/TaskManager with a foreground service) is now in scope, per this change's own design.md risk mitigation ("if a dev-client test after this fix still shows degraded accuracy, the TaskManager approach becomes the fallback").

## What Changes

- Add `isIosBackgroundLocationEnabled: true` and `isAndroidBackgroundLocationEnabled: true` to the `expo-location` config plugin block in `app.json`. **Done, confirmed working** (permission entitlement now granted).
- Switch `src/utils/gps.ts`'s tracking implementation from `Location.watchPositionAsync` to `Location.startLocationUpdatesAsync` + a registered `TaskManager` task, with Android's `foregroundService` option (persistent notification while tracking) — this is the actual mechanism running/fitness apps (Strava, etc.) use for reliable backgrounded tracking; background permission alone doesn't protect against Android's power-management throttling the way a foreground service does.
- `App.tsx`'s call sites (`startWatchingLocation(callback)`) stay unchanged — this is an internal `gps.ts` implementation swap, not a call-site rewrite.
- **No spec changes.** `game-phases`' "background location tracking SHALL be opt-in" constraint already covers this — still making an existing constraint actually true, not changing what's required. `skip_specs: true`.
- **Not in this change:** GPS accuracy filtering (dropping/de-weighting low-accuracy fixes) and the walk-lifecycle closure-threshold adjustment — related, but scoped as a separate change since they're about trusting/interpreting a fix once received, not about whether fixes keep arriving.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- `app.json`: `expo-location` plugin config gains the two background-location flags (done) and Android's foreground-service permission (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`) via the same plugin's config or the Android `permissions` array.
- `src/utils/gps.ts`: internal rewrite — `TaskManager.defineTask` at module scope, `startLocationUpdatesAsync`/`stopLocationUpdatesAsync` instead of `watchPositionAsync`, a module-level subscriber callback bridging the headless task back to whichever `Walk` is active.
- Requires another dev-client rebuild (new native permissions).

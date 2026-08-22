## 1. Config change

- [x] 1.1 Add `isIosBackgroundLocationEnabled: true` and `isAndroidBackgroundLocationEnabled: true` to the `expo-location` plugin block in `app.json`.

## 2. Dev-client build

- [x] 2.1 Build a local dev client (`npx expo run:android` or `npx expo run:ios`) — first-time toolchain setup if not already done.
- [x] 2.2 Confirm the app installs and runs on the dev client (baseline sanity check before testing the actual fix). Confirmed: Android manifest now declares `ACCESS_BACKGROUND_LOCATION` — device permission dialog shows "Allow every time".

## 3. Verify the entitlement fix

- [x] 3.1 Start a walk on the dev client, background the app (lock screen or switch apps) for at least 30s while moving, check `GPS_UPDATE` log entries with `appState:"background"` — accuracy should stay comparable to foregrounded readings, not collapse to ~200m.
- [x] 3.2 Result: real ~3km field walk still showed a visibly wrong trail (large jumps) despite the entitlement being active — confirmed with the user, proceeding to the TaskManager/foreground-service fallback below.

## 4. Foreground-service tracking

- [x] 4.1 Add `TaskManager` task definition (`LOCATION_TASK_NAME`) at module scope in `src/utils/gps.ts`.
- [x] 4.2 Rewrite `startWatchingLocation`/add `stopWatchingLocation` to use `startLocationUpdatesAsync`/`stopLocationUpdatesAsync` with the `foregroundService` option, bridging to callers via a module-level subscriber (per design.md) — `App.tsx`'s call sites stay unchanged.
- [x] 4.3 Update `App.tsx`'s `stopWalk`/`endWalk`/`resetWalk` to call the new `stopWatchingLocation()` instead of `subscriptionRef.current.remove()` (the subscription-object pattern no longer applies). Note: `resetWalk` (Cancel) never held a real-GPS subscription reference before either — added `stopAllTracking()` there too for correctness, stopping both the location task and any mock subscription.
- [x] 4.4 Add Android foreground-service permissions to `app.json` if not already covered by the `expo-location` plugin's background flags. Not needed — `isAndroidForegroundServiceEnabled` defaults to `isAndroidBackgroundLocationEnabled`'s value (already `true`), which already adds `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_LOCATION`.
- [x] 4.5 Rebuild the dev client (new native permissions).
- [x] 4.6 Add `android.permission.POST_NOTIFICATIONS` to `app.json`'s `android.permissions`, and request it at runtime (`PermissionsAndroid.request`, Android 13+/API 33+ only) before starting the foreground service — without it, the foreground-service notification silently fails to render on Android 13+ even though the service itself keeps running (confirmed via real testing: app showed under "Active apps" with no notification). Confirmed fixed after rebuild — notification now appears.

## 5. Re-verify

- [x] 5.1 Real outdoor walk: background the app for an extended period (5+ min, not just 30s) while moving, confirm via the Debug Log export that `GPS_UPDATE` accuracy stays good throughout and the trail visually matches the real path (no straight-line jumps). Confirmed by user.

## 6. Wrap-up

- [x] 6.1 Update `README.md` (Prerequisites/Running section) to note a dev-client build is needed for full background-tracking testing, Expo Go remains fine for everything else, and that tracking now shows a persistent notification while active.

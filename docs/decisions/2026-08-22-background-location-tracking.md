# Background location tracking (2026-08-22, shipped)
**Why:** Logged field test (2026-08-16): once backgrounded, `watchPositionAsync` kept firing but accuracy collapsed from ~9m to ~205m (OS silently downgrades to cell-level without a declared background entitlement). That made the existing "background location tracking SHALL be opt-in" constraint not genuinely met. After the entitlement fix a real ~3 km walk still produced straight-line jumps across streets, so the entitlement alone was insufficient on Android.
**Decisions:**
- `app.json` `expo-location` plugin: `isIosBackgroundLocationEnabled: true` (adds `UIBackgroundModes: ["location"]`) and `isAndroidBackgroundLocationEnabled: true` (adds `ACCESS_BACKGROUND_LOCATION`); plus `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_LOCATION` permissions. Needed a dev-client rebuild.
- `src/utils/gps.ts` switched from `watchPositionAsync` to `Location.startLocationUpdatesAsync` + `TaskManager`. A foreground service with persistent notification is what stops Android power management throttling; permission alone does not.
- `TaskManager.defineTask('dog-territory-location-task', ...)` must run at module top level (so it is registered when the app is relaunched headlessly). Options: `accuracy: High, timeInterval: 1000, distanceInterval: 2`, `foregroundService: { notificationTitle: 'Dog Territory Defender', notificationBody: 'Tracking your walk…', notificationColor: '#2ECC71' }`.
- Bridge to the app via a module-level `currentSubscriber`: `startWatchingLocation(callback)` keeps its signature (sets subscriber, starts task), `stopWatchingLocation()` clears it and calls `stopLocationUpdatesAsync`. Valid because the foreground service keeps the JS process alive. `App.tsx` call sites unchanged.
- Notification copy follows spring tone ("Tracking your walk…", green accent), not generic Android chrome. Persistent notification accepted as the honest cost of reliable tracking.
- iOS: only `UIBackgroundModes` for now; revisit iOS-specific throttling only if tested and shown to fail. No EAS pipeline; local dev-client build is enough.
**Rejected:**
- Entitlement flags alone, because the real walk showed they are necessary but not sufficient.
- Accuracy filtering and closure-threshold changes here, split into `docs/decisions/2026-08-22-gps-accuracy-aware-closure.md`.
**Links:** `src/utils/gps.ts`, `app.json`

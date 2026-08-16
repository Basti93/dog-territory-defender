## Context

Current `app.json` `expo-location` plugin config:
```json
["expo-location", {
  "locationAlwaysAndWhenInUsePermissions": "Allow Dog Territory Defender to track your walks"
}]
```
Requests the "Always" runtime permission but never declares the native background-location capability itself. The empirical test (see proposal.md) shows this is the actual gap — permission granted, but no entitlement to use it while backgrounded, so the OS throttles accuracy to ~205m instead of denying updates outright (which would have been easier to diagnose). See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Real GPS-grade accuracy maintained while the app is backgrounded (screen off, phone in pocket), for the duration of a whole walk.
- `App.tsx`'s call sites stay unchanged — the fix is internal to `gps.ts`.

**Non-Goals:**
- Not setting up EAS/CI build infrastructure — a local dev-client build (`npx expo run:android` or `run:ios`) is enough to test this; a full EAS pipeline is a separate concern.
- Not building GPS accuracy filtering or adjusting the closure threshold here — separate change (see proposal.md's "Not in this change").
- Not implementing an iOS-side foreground-service-equivalent in this change — Android's `foregroundService` option is what's being added now (matches the device actually used for field testing); iOS uses a different mechanism (`UIBackgroundModes: ["location"]`, already added) and its own throttling behavior — revisit specifically for iOS only if it's actually tested and shows the same problem.

## Decisions

**Add the two `expo-location` background flags — done, confirmed working.** `isIosBackgroundLocationEnabled: true` adds `UIBackgroundModes: ["location"]` to the generated Info.plist; `isAndroidBackgroundLocationEnabled: true` adds `ACCESS_BACKGROUND_LOCATION` to the Android manifest. Necessary but — per the real walk test — not sufficient on Android.

**Switch to `startLocationUpdatesAsync` + `TaskManager`, with Android's `foregroundService` option.** This is the actual mechanism reliable tracking apps use: a foreground service with a persistent notification gives Android's power management a strong signal not to throttle the app's location access, unlike a plain backgrounded app (which `ACCESS_BACKGROUND_LOCATION` alone still is). Concretely:
```ts
const LOCATION_TASK_NAME = 'dog-territory-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) { log('GPS_TASK_ERROR', { error: String(error) }); return; }
  const { locations } = data as { locations: Location.LocationObject[] };
  locations.forEach((position) => currentSubscriber?.(toLocationType(position)));
});
```
registered once at module load (required — `defineTask` must run outside any component, at the top of the module, so it's registered even if the task fires while the app was relaunched headlessly).

**Bridge the headless task back into `App.tsx` via a module-level subscriber, not a rewritten call site.** `startWatchingLocation(callback)` keeps its exact signature: internally, it sets `currentSubscriber = callback` and calls `Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, { accuracy: High, timeInterval: 1000, distanceInterval: 2, foregroundService: { notificationTitle: 'Dog Territory Defender', notificationBody: 'Tracking your walk…', notificationColor: '#2ECC71' } })`; `stopWatchingLocation()` clears the subscriber and calls `Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)`. This works because the whole point of the foreground service is keeping the JS process alive — a module-level callback registry only breaks if the process itself dies, which is exactly what the foreground service is meant to prevent. `App.tsx` never needs to know the mechanism changed.

**Foreground-service notification uses spring tone, not generic Android chrome.** Title/body/color match the project's tone rules (`visual-design`) — "Tracking your walk…" not "Location service active," green accent color, not a bare system default.

## Risks / Trade-offs

- [Local dev-client build is a new step in the workflow, adds first-time setup friction (Android Studio/Xcode toolchain)] → One-time cost, already paid; only needed for native-config-dependent features, not day-to-day JS-only iteration.
- [A persistent notification is more visually intrusive than silent background tracking] → Necessary trade-off — it's the actual mechanism that makes reliable tracking possible, and it's honest about what the app is doing (matches the project's general preference for transparency over invisible background behavior).
- [`TaskManager`-based tracking is more complex than a plain `watchPositionAsync` subscription — more surface area for bugs] → Accepted; the module-level-subscriber bridge keeps `App.tsx` untouched, containing the added complexity entirely inside `gps.ts`.

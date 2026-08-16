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
- Real GPS-grade accuracy maintained while the app is backgrounded (screen off, phone in pocket).
- Minimal change — add the missing config, don't restructure the tracking approach unless proven necessary.

**Non-Goals:**
- Not switching to `startLocationUpdatesAsync`/TaskManager now — today's test showed `watchPositionAsync`'s callback does fire while backgrounded (just with degraded accuracy), which means the JS bridge itself survives backgrounding; the entitlement flag is the missing piece, not the API choice. Revisit only if a dev-client test after this fix still shows degraded accuracy.
- Not setting up EAS/CI build infrastructure — a local dev-client build (`npx expo run:android` or `run:ios`) is enough to test this; a full EAS pipeline is a separate concern.

## Decisions

**Add the two `expo-location` background flags, nothing else.** `isIosBackgroundLocationEnabled: true` adds `UIBackgroundModes: ["location"]` to the generated Info.plist; `isAndroidBackgroundLocationEnabled: true` adds the Android foreground-service location permission/config. Both are additive to the existing plugin block — no removal of the current `locationAlwaysAndWhenInUsePermissions` line.

**Verify via a dev-client build, not Expo Go.** Config plugin changes only take effect in a rebuilt native binary. First-time setup: `npx expo run:android` (or `run:ios`) builds and installs a custom dev client with this project's actual native config — Expo Go's generic binary can't reflect it. This is the first time this project needs anything beyond Expo Go.

**Re-run the same logging-based test to confirm the fix.** `src/utils/log.ts`'s `GPS_UPDATE` entries (with `accuracy` and `appState`) already proved sufficient to diagnose this — re-running the same "start a walk, background the app, check `GPS_UPDATE` accuracy while `appState:"background"`" check on the dev-client build is the acceptance test, no new tooling needed.

## Risks / Trade-offs

- [Local dev-client build is a new step in the workflow, adds first-time setup friction (Android Studio/Xcode toolchain)] → One-time cost; only needed for this and any future native-config-dependent feature, not for day-to-day JS-only iteration (Expo Go remains fine for that).
- [Entitlement flag alone might not fully fix it — OS-level background execution limits (especially iOS) can still throttle a foregrounded-looking app after extended background time] → If the dev-client test still shows degraded accuracy after this change, the `startLocationUpdatesAsync`/TaskManager approach (explicitly deferred above) becomes the fallback — not assumed necessary until proven.

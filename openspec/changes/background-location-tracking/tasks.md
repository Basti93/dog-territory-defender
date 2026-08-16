## 1. Config change

- [x] 1.1 Add `isIosBackgroundLocationEnabled: true` and `isAndroidBackgroundLocationEnabled: true` to the `expo-location` plugin block in `app.json`.

## 2. Dev-client build

- [x] 2.1 Build a local dev client (`npx expo run:android` or `npx expo run:ios`) — first-time toolchain setup if not already done.
- [x] 2.2 Confirm the app installs and runs on the dev client (baseline sanity check before testing the actual fix). Confirmed: Android manifest now declares `ACCESS_BACKGROUND_LOCATION` — device permission dialog shows "Allow every time".

## 3. Verify the fix

- [ ] 3.1 Start a walk on the dev client, background the app (lock screen or switch apps) for at least 30s while moving, check `GPS_UPDATE` log entries with `appState:"background"` — accuracy should stay comparable to foregrounded readings, not collapse to ~200m.
- [ ] 3.2 If accuracy is still degraded: don't guess further — pause and reconsider the `startLocationUpdatesAsync`/TaskManager fallback (design.md's deferred alternative) with the user before implementing it.

## 4. Wrap-up

- [ ] 4.1 Update `README.md` (Prerequisites/Running section) to note a dev-client build is now needed for full background-tracking testing, Expo Go remains fine for everything else.

# Dog Territory Defender — Phase 0 → Phase 1

Minimal real prototype you can take on a walk. GPS tracking → map → territory claiming → treats economy.

**Status:** Phase 0's formal validation audit (3 testers, real walks) hasn't run yet — only dev testing so far. Phase 1 (treats economy) build work has started in parallel; see `openspec/specs/game-phases/spec.md` for the phase-gating rule this is tracked against.

**What works:**
- ✅ Real GPS tracking (reads every 1-2 seconds)
- ✅ Live map showing your position + trail
- ✅ Distance + point count during walk
- ✅ Auto-detects when walk is "closeable" (start ≈ end, within an accuracy-aware radius, ≥100m by default)
- ✅ Closes perimeter to claim territory
- ✅ Shows claimed territory polygon on map — and every previously claimed territory stays visible on the idle map, not just the latest one
- ✅ End Walk early (no closed loop needed) — keeps the trail, no reward for an unclosed walk
- ✅ Testable without walking — Android Emulator GPX route playback (`testing/munich-route.gpx`)
- ✅ Walks persist locally (`expo-sqlite`) — survives app restarts, no data lost
- ✅ "View Past Walks" screen — see every previously recorded walk, delete any of them (with confirmation)
- ✅ Treats economy core: +50 treats per closed walk, passive treats accrue over time (capped by storage), all persisted
- ✅ Den screen: 3 buildings (Doghouse, Treat Bakery, Sniff Garden), tap to upgrade, "next upgrade" tease, spring touches
- ✅ Post-walk celebration: area claimed, treats earned, next-upgrade tease, gentle confetti — replaces the old plain alert

**What's not built yet:**
- ❌ Collectibles, enemies, leaderboards (Phase 2+)
- ❌ Cloud/remote sync (AWS) — local storage is schema-ready (`syncedAt` field) but no sync service exists yet
- ❌ Background-location tracking fix — real GPS accuracy degrades once backgrounded; tracked as `openspec/changes/background-location-tracking/`, needs a dev-client rebuild
- ❌ Dark mode (design polish)

---

## Running on your Android phone

### Prerequisites
- Node.js 16+ (`node -v`)
- Android phone with Android 8.0+ (API 26+)
- Android phone on same WiFi as your computer (or USB debug cable)
- Android SDK + a connected device/emulator (`adb devices`) — needed for the dev-client build below; Expo Go alone is no longer enough (see note)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Build and install a dev client on your connected device
npx expo run:android
```

**Why not Expo Go:** reliable GPS tracking while the app is backgrounded (screen off, phone in pocket) needs native config (background-location entitlement, Android foreground service) that only takes effect in a real native build — Expo Go's generic shell can't reflect it. `npx expo run:android` builds and installs a custom dev client with this project's actual native config; re-run it any time `app.json`'s native config changes (it re-syncs automatically). Once installed, day-to-day JS changes still hot-reload — you don't need to rebuild for every code change, only for native/config changes.

While tracking, you'll see a persistent notification ("Tracking your walk…") — that's the foreground service keeping GPS accurate in the background, not a bug.

If you hit trouble reviewing what happened on a walk (especially untethered, no laptop nearby): tap **Debug Log** on the main screen — Share exports everything logged so far via the OS share sheet, Clear resets it.

### First walk

1. **Open Expo Go app** on your phone (Expo should have installed it automatically)
2. **Tap the QR code** if prompted, or scan the QR code shown in terminal
3. **Accept location permissions** when prompted
4. **Tap "Start Walk"** — you'll see a blue dot (your position) on the map
5. **Walk around your block** (even 100-150 meters in a rough loop works)
6. **When you're close to where you started**, a **"✓ Close Territory"** button appears alongside "End Walk"
7. **Tap it** — you'll see your territory polygon on the map in green
8. Didn't make it back to the start? Tap **"End Walk"** instead — the trail stays visible, just without a territory polygon or reward

Done! You've validated Phase 0: GPS works, territory claiming works.

Testing without physically walking: use the Android Emulator's built-in location simulator (Extended Controls → Location), which drives the real Android location provider instead of a JS-level fixture. Import `testing/munich-route.gpx` under the Routes tab and play it back for a closed-loop test; stop playback partway through (or set a single point that doesn't return near the start) to simulate an open/incomplete walk.

---

## Architecture

```
App.tsx
├── React hooks: useState, useRef, useEffect
├── MapView (src/components/MapView.tsx) — real OpenStreetMap tiles via react-native-webview + Leaflet
│   └── src/web/mapHTML.ts: the Leaflet page + postMessage bridge (UPDATE_LOCATION/UPDATE_TRAIL/SHOW_TERRITORY/RESET)
├── GPS tracking (expo-location)
├── Utils:
│   ├── gps.ts: permission + foreground-service-backed location tracking (TaskManager)
│   ├── geometry.ts: distance, closure detection, polygon area
│   └── types.ts: TypeScript interfaces
├── Storage (src/storage/):
│   ├── WalkRepository.ts: repository interface (saveWalk/getWalks/getWalk/deleteWalk) + StoredWalk type
│   ├── sqliteWalkRepository.ts: expo-sqlite implementation (single-table, DynamoDB-shaped schema)
│   ├── inMemoryWalkRepository.ts: in-memory fake, used by the contract tests
│   └── DenEconomyRepository.ts + sqlite/inMemory implementations: single-row treats/building state
├── Economy (src/economy/):
│   ├── balanceConfig.ts: every tunable number (treats/walk, storage, passive rate, costs, soft cap)
│   ├── formulas.ts: pure functions built on the config (upgradeCost, storageCap, passiveTreatsPerHour, softCapBonusPercent)
│   └── denEconomy.ts: state transitions (applyPassiveAccrual, awardWalkTreats, upgradeBuilding)
└── UI:
    ├── Map region + pan/zoom
    ├── Trail polyline (blue dashed)
    ├── Territory polygon (green, if closed)
    ├── Bottom controls: stats + buttons
    ├── WalkHistoryScreen: list of past walks (src/components/)
    └── DenScreen: 3 building cards, next-upgrade tease (src/components/)
```

**State flow:**
1. `startWalk()` → create Walk record, start location subscription
2. GPS callback → update locations array, pan map to current position
3. `canCloseWalk()` checks: ≥10 points AND distance(start, end) < closure radius, where closure radius = `max(firstAccuracy + lastAccuracy + 10, 100)` meters — a 100m floor by default, widening further under poor GPS accuracy
4. `stopWalk()` → if closeable, `locationsToPolygon()` → show territory, save via `walkRepository.saveWalk()`
5. `endWalk()` → stop tracking, keep the trail as an open/unclosed walk, save via `walkRepository.saveWalk()`, no reward
6. `resetWalk()` → clear walk (Cancel) — never saved, nothing to persist
7. "View Past Walks" → `walkRepository.getWalks()` → `WalkHistoryScreen`
8. On app load → `applyPassiveAccrual()` for elapsed time since last open → treats balance shown in header
9. On closing a walk → `awardWalkTreats()` → treats balance updates, folded into the success alert

---

## What to test on your first walk

- [ ] **GPS starts tracking** — blue dot appears on map
- [ ] **Trail appears** — blue dashed line follows your path
- [ ] **Distance updates** — increases as you walk
- [ ] **Closure detection works** — "Can close!" appears when you're near start
- [ ] **Territory is claimed** — green polygon shows your route when you close
- [ ] **End Walk works** — tap it before closing the loop, trail stays visible, no reward shown
- [ ] **Walks survive a restart** — close and reopen the app, "View Past Walks" still shows your walk
- [ ] **Treats award on close** — closing a walk shows "+50 treats!" and the header count goes up
- [ ] **Treats persist and accrue** — close the app for a while, reopen, treats balance is at least what it was (plus any passive accrual)
- [ ] **Den screen works** — open "The Den", see 3 buildings, tap the tease-highlighted one to upgrade (needs enough treats), level/effect text updates
- [ ] **Phone doesn't crash** — foreground location tracking is stable for 15+ minutes

---

## Next steps (Phase 1)

1. ~~Passive treats tick + treats-per-walk~~ — done (`src/economy/`)
2. ~~Den screen~~ — done (`src/components/DenScreen.tsx`)
3. ~~Post-walk celebration~~ — done (`src/components/CelebrationScreen.tsx`)
4. Add tab navigation (Map / Den / Dog / Settings)
5. Wire up cloud sync (AWS — DynamoDB target) for data already saved locally via `syncedAt`

See [`openspec/specs/game-phases/spec.md`](openspec/specs/game-phases/spec.md) for the full Phase 0→1 transition.

---

## Debugging

**GPS not working?**
- Check location permissions: Settings → Apps → Dog Territory Defender → Permissions → Location
- Ensure "High accuracy" mode is on (Settings → Location)
- Try reloading: press 'r' in the Expo terminal

**Map shows wrong location, or blank?**
- Map starts zoomed out world-view; it centers/zooms in on your first GPS fix. Give it a moment.
- The map needs internet access (loads Leaflet + OpenStreetMap tiles) — a dead zone at launch can show a blank map.
- Drag/pinch the map manually if needed — it's a real Leaflet map now, pan/zoom both work.

**App crashes?**
- Check terminal for errors
- Restart Expo: Ctrl+C in terminal, then `npm run android` again

---

**Design North Star:** Every walk feels rewarding. Validation first.

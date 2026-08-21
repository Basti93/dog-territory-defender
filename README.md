# Dog Territory Defender

Location-based mobile game for dog owners: walk → GPS trail → close loop → claim territory. Spring-like, joyful, cookie-clicker background loop. Spec-driven — see `openspec/` for build plan and game design.

## Setup

### Prerequisites
- Node.js 16+
- Android phone (API 26+), same WiFi as your computer (or USB debug)
- Android SDK + connected device/emulator (`adb devices`)

### Run

```bash
npm install
npx expo run:android   # builds + installs dev client (Expo Go alone isn't enough)
```

**Why not Expo Go:** background GPS tracking needs native config (foreground service, background-location entitlement) that only takes effect in a real native build. Re-run `npx expo run:android` when native config changes — day-to-day JS changes hot-reload without a rebuild.

The earned-trigger notification (Den-economy overflow) added `expo-notifications` as a new native dependency — after pulling that change, run `npx expo install expo-notifications` (not a plain `npm install`; `expo install` resolves the SDK-54-compatible version) and rebuild the dev client (`npx expo run:android` / `run:ios`) before the notification permission prompt or delivery can be tested on-device. It's requested lazily (only when an overflow actually needs to be surfaced), not at app launch.

Testing without walking: Android Emulator → Extended Controls → Location → Routes, import a GPX route from `testing/`.

## Architecture

React Native / Expo app, no backend yet — everything runs and persists locally.

- **Map & GPS**: a WebView-hosted Leaflet map tracks and renders the live GPS trail; a foreground location service keeps tracking accurate while backgrounded.
- **Walk lifecycle**: a walk starts, accumulates GPS points, and closes into a claimed territory polygon once the path loops back near its start (accuracy-aware closure check). An unclosed walk can still be ended early, keeping the trail but earning no reward. A third way a `Walk` comes to exist: "Log a walk we missed" lets the player record an untracked walk (today or yesterday only) with no GPS trail — it earns the identical treats/XP/stats/achievements reward as a tracked walk, no reduced treatment. Every `Walk` carries a `startSource` (`button` vs `manual-log`) to tell the two apart in storage.
- **Storage**: walks, Den economy state, personal stats, and notification bookkeeping (overflow-already-surfaced flag, learned time-of-day bucket) each persist locally through a small repository layer, swappable for an in-memory fake in tests.
- **Economy**: a single config module holds every tunable number (treats per walk, upgrade costs, passive accrual rate, caps); pure formula functions built on top of it drive state transitions like awarding treats/XP and upgrading buildings. The reward-awarding path itself (`src/economy/walkRewards.ts`) is shared by both a tracked walk's closure and a manually-logged walk.
- **Notifications**: a local, earned-trigger-only notification (no clock-fired reminders) fires when the Den's treat storage overflows and hasn't already been surfaced, delivered near the player's own learned time-of-day walk pattern. Permission is requested lazily, only at the moment a notification is actually about to be scheduled.
- **UI**: the map screen, walk history, the Den (building upgrades), a stats/achievements screen, and the "Log a walk we missed" entry point.

**State flow, in short:** start a walk → track GPS points → check closability every update → on close, turn the trail into a territory polygon, save the walk, award treats and Den XP, and show a celebration screen.

## Folder overview

- **components** — screens and UI pieces (map, walk history, Den, stats, log-a-missed-walk)
- **economy** — balance config, formulas, and state transitions for treats/Den/stats
- **notifications** — earned-trigger notification decision logic and scheduling (Den-economy overflow only)
- **storage** — persistence layer for walks, Den economy, personal stats, and notification bookkeeping
- **utils** — GPS, geometry, and manual-walk-log helpers
- **web** — the map's web content, hosted in a WebView
- **openspec** — spec-driven build plan and game design docs (source of truth)
- **prototype** — clickable HTML design spec — match its visuals, not its structure
- **testing** — GPX routes for simulated walks
- **assets** — app icons and images

See `CLAUDE.md` for collaboration rules and `openspec/` for the phased build plan and game design specs.

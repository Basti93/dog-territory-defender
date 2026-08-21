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

- **Map & GPS**: a WebView-hosted Leaflet map tracks and renders the live GPS trail, plus the player's persistent Home Range (see below); a foreground location service keeps tracking accurate while backgrounded.
- **Walk lifecycle**: a walk starts, accumulates GPS points, and ends via one of two terminal actions — Finish Walk (always saves the trail and paints it into the Home Range, regardless of shape) or Cancel (discards the walk entirely). There is no loop-closure requirement anymore: a walk that never returns near its start still paints exactly like one that does. Reward eligibility (treats/XP) is gated on ground actually covered — at least 25 painted 20m grid cells, roughly 200m of real walking — not on the walk's shape; a shorter walk still saves and still paints, it just earns nothing. A third way a `Walk` comes to exist: "Log a walk we missed" lets the player record an untracked walk (today or yesterday only) with no GPS trail — it earns the identical treats/XP/stats/achievements reward as a tracked walk, no reduced treatment, but (unlike a tracked walk) never discovers or extends the Home Range on its own. Every `Walk` carries a `startSource` (`button` vs `manual-log`) to tell the two apart in storage. A manual log may optionally refresh the Bloom freshness of one route the player has previously walked with real GPS tracking — see Fresh Ground below — capped at 2 manual logs and 1 route refresh per calendar day.
- **The Home Range**: territory is a persistent 20m-square grid, not a polygon per walk. The **Range** is the permanent, monotonic outline of every cell any tracked walk has ever painted — it never shrinks. The **Bloom** is a colour-only freshness fill over that outline: each cell's "wildness" grows for up to 18 days since it was last walked, then holds steady — rendered as hue/saturation only, never as a number, with every cell equally visually present regardless of age. A `visits` count per cell drives a ghost-trail brightness channel so well-worn streets read as a brighter, denser vein. Rendering smooths the underlying grid with a Gaussian blur and a marching-squares contour so the Range reads as a soft rounded shape, not blocky cells. **Fresh Ground**: a qualifying walk's treats (never XP) are multiplied by `1 + 0.6 * meanWildness` of the ground it covered — up to ×1.60 for ground untouched in three-plus weeks, suppressed to no bonus at all below a ×1.25 display floor so a routine daily-loop walk shows no multiplier line. A manual log's route refresh always pays the same fixed ×1.112 regardless of which route is picked, so it can never out-earn an honestly-tracked walk. The Home Range also surfaces New Ground and "Buddy knows N streets" celebration beats. See `openspec/changes/home-range/design.md` for the full formulas and their validated worked values (`home-range-prototype.mjs`), and `openspec/changes/home-range-rewards/` for the payout wiring.
- **Storage**: walks, Den economy state, personal stats, and notification bookkeeping (overflow-already-surfaced flag, learned time-of-day bucket) each persist locally through a small repository layer, swappable for an in-memory fake in tests.
- **Economy**: a single config module holds every tunable number (upgrade costs, passive accrual rate, caps, Buddy's level-to-payout curve); pure formula functions built on top of it drive state transitions like awarding treats/XP and upgrading buildings. The reward-awarding path itself (`src/economy/walkRewards.ts`) is shared by both a tracked walk's closure and a manually-logged walk. The player's dog has a name (set once at first launch); the Den Level/XP number is framed as that dog's own level, and — as of `virtual-dog-companion` — the level itself now sets the per-walk treats payout rate (`buddyPayout`, boosted by the Sniff Garden's percentage bonus), so leveling up visibly pays out instead of being a bare progress signal. This is a deliberate, logged reopening of `den-level-xp`'s original "zero percentage impact" decision — see `openspec/changes/virtual-dog-companion/design.md`.
- **Notifications**: a local, earned-trigger-only notification (no clock-fired reminders) fires when the Den's treat storage overflows and hasn't already been surfaced, delivered near the player's own learned time-of-day walk pattern. Permission is requested lazily, only at the moment a notification is actually about to be scheduled.
- **UI**: the map screen, walk history, the Den (building upgrades), a stats/achievements screen, and the "Log a walk we missed" entry point.

**State flow, in short:** start a walk → track GPS points, painting a live preview into the Home Range as it goes → Finish Walk saves the trail and paints its cells for real → if it covered enough ground (≥25 cells), award treats (at Buddy's current per-walk rate, times the Fresh Ground bloom multiplier) and Den XP (bloom-unaffected), and show a celebration screen (which also shows a level-up's old/new rate when one occurs, and a Fresh Ground/New Ground beat when either fired).

## Folder overview

- **components** — screens and UI pieces (map, walk history, Den, stats, log-a-missed-walk)
- **economy** — balance config, formulas, and state transitions for treats/Den/stats
- **notifications** — earned-trigger notification decision logic and scheduling (Den-economy overflow only)
- **storage** — persistence layer for walks, Den economy, personal stats, notification bookkeeping, and the Home Range grid
- **utils** — GPS, geometry, the Home Range grid (cell addressing, freshness curve, painting, New Ground detection), and manual-walk-log helpers
- **web** — the map's web content, hosted in a WebView, including the Home Range raster builder and its Gaussian-blur/marching-squares/Lab-colour renderer
- **openspec** — spec-driven build plan and game design docs (source of truth)
- **prototype** — clickable HTML design spec — match its visuals, not its structure
- **testing** — GPX routes for simulated walks
- **assets** — app icons and images

See `CLAUDE.md` for collaboration rules and `openspec/` for the phased build plan and game design specs.

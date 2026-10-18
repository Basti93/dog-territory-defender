# Tails Up (working title: Dog Territory Defender)

Location-based mobile game for urban dog owners: walk with your dog, paint the streets you walk into a persistent Home Range, and watch your Viertel and your dog Buddy bloom. Spring-like, joyful, cookie-clicker background loop, anti-snowball social layer. Expo SDK 54 / React Native 0.81 / TypeScript. Game design lives in `docs/specs/`; collaboration rules in `CLAUDE.md`.

## Setup and dev
```bash
npm install                 # legacy-peer-deps=true in .npmrc
npx expo run:android        # builds + installs the dev client (Expo Go is not enough: background GPS needs native config)
npx expo start --dev-client # day-to-day; JS changes hot-reload
npm run check               # tsc --noEmit && jest --silent: the gate before every commit (no CI, no lint script)
npm run ios                 # expo run:ios
```
Prerequisites: Node 16+, Android SDK + device/emulator (`adb devices`, API 26+). Rebuild the dev client after native changes (new native package, `app.json` plugin, icon/splash, `expo prebuild`). Simulated walks: Android Emulator > Extended Controls > Location > Routes, import a GPX from `testing/`.

## Build, OTA, deploy
- **Android APK (cloud):** `npx eas build -p android --profile preview` (internal APK, channel `preview`). Local release: `npm run apk` (debug-keystore signed, personal use).
- **iOS:** build in Xcode, Release configuration, with the free team (`appleTeamId` in `app.json`); the profile expires after 7 days, so re-sign/reinstall weekly.
- **OTA (JS, images, sounds):** `npx eas update --channel preview --message "..."`. Runtime `0.2.0` (`runtimeVersion` policy `appVersion`); apps load it on next start (scene card "Neue Version", Settings "Nach Updates suchen"). Native changes need a new build **and** a new `version` in `app.json`. Rollback: `npx eas update:republish --channel preview`.
- **Server (household sync API):** `deploy/README.md` (home server, German) and `server/README.md` (API, ops CLI).
- After pulling native changes (`expo-audio` replaced `expo-av` in 0.2.0, plus `expo-haptics`, `expo-document-picker`, `expo-notifications`, `@react-native-community/datetimepicker`): `npm install`, then rebuild once.

## Architecture
Offline-first app, everything persists locally in SQLite (`expo-sqlite`); optional household sync via `server/`. Details of each area: `docs/specs/` and `docs/decisions/`.
- `App.tsx` + `src/app/`: composition, navigation with back stack (`backStack.ts`), walk session, launch effects, repositories.
- `src/components/`: screens and pieces (`world/` the "Unser Viertel" home scene, `postcards/` Album + bench, `buddy/`, `den/`, `onboarding/`); `src/screens/`; `src/ui/` clay UI kit (see its README).
- `src/economy/`: tunable config + pure formulas (treats, Den, stats, territories, neighbours); `src/storage/`: repositories with in-memory fakes for tests.
- `src/utils/`: GPS, geometry, Home Range grid, territory clustering, street lookup; `src/web/`: Leaflet map HTML in WebViews + Home Range raster renderer.
- `src/buddy/` (appearance, image/vector skin), `src/art/` (`artOr()` slot access), `src/postcards/` (pure postcard derivation), `src/utils/cornerDetection.ts` + `src/economy/corners.ts` ("Unsere Ecken"), `src/notifications/`, `src/feedback/` (sounds, haptics), `src/i18n/` (de/en), `src/sync/` (API client, outbox, presence).
- `server/` Fastify + Postgres API; `deploy/` Docker/Tailscale runbook and backup scripts; `plugins/` Expo config plugins.
- `assets/` (`art/` Blender sprites, `buddy/` layered parts, `sounds/`, `fonts/`); `scripts/` (`blender/`, `generateArt.mjs`, `generateAssets.mjs`, `generateSounds.mjs`); `testing/` GPX routes.
- `prototype/` clickable HTML design spec; `handover/claude-design/` brief + samples for Claude Design (no code).
- `docs/`: `specs/` game design (source of truth), `decisions/LOG.md` + one page per past change.

## Status (2026-10-18, runtime 0.2.0)
Core loop feature-complete; the owner validates on Android (iOS via free-team builds). Backlog and known stubs: `docs/specs/game-backlog.md`.
- Walks: GPS tracking (foreground service, survives closing the app), Finish/Cancel, plausible-step distance rule, no-movement walks leave no record, manual "log a walk we missed".
- Home Range: persistent 20 m grid painted by walks, Bloom freshness, auto-discovered named Territories, Somewhere Wild pins.
- "Unser Viertel" home scene: Viertel as live patchwork map, fence + gate, Buddy, three Den buildings (upgrade panels), Heimkehr reward moment; postcards on the bench and in the Album; achievements hang as rosettes on the fence.
- Buddy: animated clay rig with customisable look, moods that never guilt, sounds and music box.
- Economy: treats, Den XP/levels (Buddy's level sets the payout), milestones, anti-snowball mechanisms.
- Household sync (two phones, one dog and Range), opt-in live sharing of walks, neighbour dogs behind a server flag.
- Opt-in walk reminders (3 slots), onboarding, Backup/Restore, i18n de/en.
- Open: shared postcards (M5), see `docs/decisions/multiplayer-sync.md`. "Unsere Ecken" (named corners) and personal stats on the server (restore after a reinstall) are built; their server part (migrations 0006 + 0007) needs a deploy before the app update.

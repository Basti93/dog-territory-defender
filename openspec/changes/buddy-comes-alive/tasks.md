## 0. Sequencing and parallelism

- [ ] 0.1 Read `design.md` (Decisions 3, 4, 5, 7) and `specs/buddy-avatar/spec.md` first.
- [ ] 0.2 Groups 1, 2 and 4 are **independent and can run in parallel** (disjoint files). Group 3 (integration) and Group 5 (polish) **depend on 1 and 2** and are the only groups that edit existing files. Group 6 (docs) runs last.

| Group | Scope | Files owned | Depends on |
|---|---|---|---|
| 1 | Buddy avatar, mood logic, picker, appearance storage | `src/buddy/**`, `src/components/buddy/**`, `src/storage/*BuddyAppearance*`, `src/storage/__tests__/buddyAppearanceRepository.contract.test.ts` | none |
| 2 | Juice primitives | `src/ui/**` | none |
| 4 | App identity | `scripts/generateAssets.mjs`, `assets/**`, `app.json` | none |
| 3 | Integration into screens and `App.tsx` | `App.tsx`, `src/components/*Screen.tsx` | 1, 2 |
| 5 | Polish audit fixes | same files as Group 3 | 1, 2 (do in the same pass as 3 or after; same developer) |
| 6 | Docs | `README.md` | all |

Public interfaces other groups may code against before the work lands:
- Group 1: `<BuddyAvatar appearance size facing mood onPress? />`, `<BuddyAppearancePicker name initial onSave onSkip? />`, `BuddyAppearanceRepository`, `createSqliteBuddyAppearanceRepository`, `createInMemoryBuddyAppearanceRepository`, `defaultBuddyAppearance`, `resolveBuddyMood`.
- Group 2: `<PressableScale>`, `<AnimatedNumber value from? duration? format? />`, `<Confetti />`, `<TreatPop amount trigger />`, `<FadeSlideIn>`, `tokens`, `countUpValue`.

## 1. Group 1: Buddy avatar, picker, storage (files: `src/buddy/**`, `src/components/buddy/**`, `src/storage/*BuddyAppearance*`)

- [ ] 1.1 `src/buddy/buddyAppearance.ts`: `BuddyAppearance` type, option lists (coat, markings, earStyle, tailStyle, size, accentColour), `BUDDY_PALETTE` with the exact hex values from the `visual-design` delta, `defaultBuddyAppearance()` (golden, none, floppy, curly, medium, cream), `normalizeAppearance(unknown)` (per-field fallback), and a pure `noseColourFor(coat)` (chocolate gets brown, others dark).
- [ ] 1.2 `src/storage/BuddyAppearanceRepository.ts` (interface: `getAppearance`, `saveAppearance`, `hasChosen`), `inMemoryBuddyAppearanceRepository.ts`, `sqliteBuddyAppearanceRepository.ts` (singleton row, `CREATE TABLE IF NOT EXISTS`, normalise on read). Follow `sqliteNotificationRepository.ts`.
- [ ] 1.3 `src/storage/__tests__/buddyAppearanceRepository.contract.test.ts` against the in-memory fake: default on first read, `hasChosen()` false then true, full round-trip, unknown stored value falls back per field.
- [ ] 1.4 `src/components/buddy/buddyMood.ts`: `BuddyMood` type, `resolveBuddyMood`, `pickTrick(rng, previous)`, `nextTrickDelayMs(rng)` per Decision 4 and the mood table. Import the session types from `DoorstepScreen.tsx` as types only, or copy the two string unions with a comment to avoid a circular import (implementer's call; prefer type-only import).
- [ ] 1.5 `src/components/buddy/__tests__/buddyMood.test.ts`: long-absence gives excited greeting (never sleepy), same-day-reopen gives sleepy, hour 22 and 05 give sleepy while 06 and 21 do not, priority order, curious only when hinted, `pickTrick` never repeats `previous` for any rng value, `nextTrickDelayMs` stays within 12000-25000.
- [ ] 1.6 `src/components/buddy/BuddyAvatar.tsx` plus piece files (e.g. `BuddyBody.tsx`, `BuddyHead.tsx`, `buddyPieces.tsx`) per Decision 3: chunky rounded SVG pieces, each in an `Animated.View`, native driver for everything, max 12 animated nodes. Props: `appearance`, `size` (px), `facing` ('left' | 'right', mirror with `scaleX: -1` on the root), `mood`, `onPress`. Idle loop: breathing (body scaleY), blink, tail wag, ear flick, head tilt, weight shift. Tap: `happy` for ~1.5s then back. Random tricks (sit, stretch, shake) in `idle` only.
- [ ] 1.7 Lifecycle: one ref holds every animation handle and timer; one effect cleanup stops and clears them all on unmount and on mood change. No state updates after unmount.
- [ ] 1.8 `src/components/buddy/BuddyAppearancePicker.tsx`: title "What does {name} look like?", live animated preview (the one Buddy), swatch rows for coat/accent and chip rows for markings/ears/tail/size, `onSave(appearance)` and optional `onSkip`. Tone: warm, no emoji overload, no dark mode, min text 12px.
- [ ] 1.9 Manual check on the real device: smooth idle for 60s, no growing memory or timers after navigating away and back ten times, and `transformOrigin` pivots look right (else use the translate-rotate-translate fallback). If janky, drop weight shift and ear flick first.

## 2. Group 2: Juice primitives (files: `src/ui/**`)

- [ ] 2.1 `src/ui/tokens.ts`: export the existing Design Token hex values (green, meadow, blue, warm accent, brown, white, muted grey `#8A9A8A` as already used in screens). Do not add colours.
- [ ] 2.2 `src/ui/PressableScale.tsx`: spring scale to ~0.96 on press-in, back on release, native driver, forwards `onPress`/`disabled`/`style`/`accessibilityLabel`.
- [ ] 2.3 `src/ui/AnimatedNumber.tsx` plus exported pure `countUpValue(from, to, progress)` (eased, integer-floored, clamped, exact `to` at progress 1) and a small `formatCount` if needed. JS-driven, <=800ms, set state only when the integer changes.
- [ ] 2.4 `src/ui/__tests__/animatedNumber.test.ts`: `countUpValue` endpoints, monotonic, clamps progress outside 0..1, from === to, decreasing values, large numbers.
- [ ] 2.5 `src/ui/Confetti.tsx`: extract and generalise `CelebrationScreen`'s `ConfettiPiece`. 24 pieces, colours from `tokens` only, falls ~2s, native driver, `pointerEvents="none"`, layout from an injectable rng, stops on unmount.
- [ ] 2.6 `src/ui/TreatPop.tsx`: small "+N" text that floats up ~40px and fades over ~900ms on each `trigger` change; renders nothing at rest.
- [ ] 2.7 `src/ui/FadeSlideIn.tsx`: wrapper, opacity 0 to 1 and translateY 12 to 0 over ~220ms on mount, native driver.

## 3. Group 3: Integration (files: `App.tsx`, `src/components/*Screen.tsx`; depends on 1 and 2)

- [x] 3.1 `DoorstepScreen.tsx`: replace the `dogArt` emoji with `<BuddyAvatar>` (size about 96-120px), mood from `resolveBuddyMood` using `session`, local hour, and `curious` when the away strip contains a `somewhere-wild` line; keep the existing greeting/"Zzz" caption. Buddy must not push Start Walk below the fold on a ~6" screen: if height grows, shrink the portrait first. Add a new `buddyAppearance` prop passed from `App.tsx`.
- [x] 3.2 `DoorstepScreen.tsx`: Start Walk uses `PressableScale`; gentle 2-3 cycle pulse only when `session.kind === 'fresh-open'`. Other primary buttons on the screen use `PressableScale`.
- [x] 3.3 `DenScreen.tsx`: replace the `denScene` placeholder with Buddy (about 100px) beside the buildings; set `excited` for ~2s after a successful upgrade; building `cardIcon` does a scale-bounce on upgrade; `TreatPop` showing the cost on upgrade; upgrade cards use `PressableScale`; the treats value uses `AnimatedNumber`.
- [x] 3.4 `CelebrationScreen.tsx`: replace the local `ConfettiPiece`/`confetti` code with `<Confetti />`; add `<BuddyAvatar mood="excited">`; treats earned count up with `AnimatedNumber`; Continue button uses `PressableScale`. There is no XP bar or XP counter today: add a ticking XP-gained counter only if the celebration payload already carries the XP number; otherwise do **not** add a new field (that is economy plumbing, out of scope) and record the gap in the implementation report. (Gap recorded: `WalkRewardsCelebration` has no XP number, so no XP ticker was added; treats count up only.)
- [x] 3.5 `App.tsx`: create `buddyAppearanceRepository`, load the appearance at start (default on failure, never block), hold it in state, pass it to Doorstep/Den/Celebration/Settings; after `submitDogName` render `BuddyAppearancePicker` (Decision 7); wrap every screen branch in `FadeSlideIn` keyed per screen. Do **not** add Buddy to the live map.
- [x] 3.6 `SettingsScreen.tsx`: row "Change {name}'s look" opening the picker (reuse the same component, no skip button); save updates the repository and the `App.tsx` state.
- [x] 3.7 `DogNamePromptScreen.tsx`: Let's go! button uses `PressableScale`.
- [ ] 3.8 Optional if time: small Buddy in `WalkPortraitScreen.tsx`'s metadata area (static `idle`).

## 4. Group 4: App identity (files: `scripts/generateAssets.mjs`, `assets/**`, `app.json`)

- [ ] 4.1 `scripts/generateAssets.mjs` (pure Node, no npm deps): RGBA pixel buffer, supersampled anti-aliased circle/ellipse/rounded-shape fills, PNG encoder with `node:zlib` and CRC32. Motif: warm green circle (`#2ECC71`) with a cream (`#FBEFD5`) paw print or stylised dog head, spring-like. Outputs `assets/icon.png` (1024x1024), `assets/adaptive-icon.png` (1024x1024, motif inside the central safe zone, transparent background), `assets/splash.png` (centered motif), `assets/favicon.png` (48x48). Header comment: how to run (`node scripts/generateAssets.mjs`) and that outputs are checked in.
- [ ] 4.2 Run the script and check the PNGs open (view them).
- [ ] 4.3 `app.json`: `icon`, `userInterfaceStyle: "light"`, `orientation: "portrait"`, `android.adaptiveIcon` (foreground image, `backgroundColor` `#2ECC71`), splash with `backgroundColor` `#FAFAF8`. Check the `expo-splash-screen` ~31 plugin docs: in SDK 54 the splash image and background colour are configured in the plugin entry already in `plugins`; use that if the top-level `splash` key is deprecated.
- [ ] 4.4 Tell the founder in the report: JS changes hot-reload, but the icon and splash need `npx expo prebuild --platform android` then `npx expo run:android` (he runs it himself; `android/` is git-ignored).

## 5. Group 5: Polish audit (real gaps found; same files as Group 3)

- [x] 5.1 Text below the 12px spec minimum: `fontSize: 11` in `CelebrationScreen.tsx` (teaseLabel, badgeLabel), `DebugLogScreen.tsx`, `StatsScreen.tsx`, `TerritoryCard.tsx`. Raise to 12.
- [x] 5.2 Bare "Loading…" text in `DenScreen`, `StatsScreen`, `TerritoriesScreen`, `WalkHistoryScreen`: use a calm centred line, and `FadeSlideIn` once content arrives; no spinner dependency needed.
- [x] 5.3 Empty states with Buddy: `TerritoriesScreen` ("No territories claimed yet...") and `WalkHistoryScreen` ("No walks yet...") show a small idle Buddy above the existing text. `DoorstepScreen`'s `emptyPortrait` keeps its copy (Buddy is already above it).
- [x] 5.4 Headers: all screens already use title plus a "Close" text button on the right. Keep that convention (do not introduce back arrows); only ensure the Close tap target is at least 44px high via padding.
- [ ] 5.5 Copy warmth pass over buttons and notices: replace transactional strings only where they read cold, and keep the tone rules ("claim/defend/protect"). Emoji stay at current density; do not add more.

## 6. Group 6: Docs (last)

- [ ] 6.1 Manual verification on device: first-launch flow (name, look, Doorstep), existing-user path (no picker), Settings edit persists across restart, Buddy sleepy on re-open, excited on Celebration and upgrade, no Buddy on the live map, Start Walk visible on the Doorstep without scrolling.
- [x] 6.2 `README.md`: add a "Buddy" bullet under Architecture (what it is, folder pointers `src/buddy/`, `src/components/buddy/`, `src/ui/`), update the folder overview and the `assets` line, and mention the icon rebuild note. Remove "app icons and images" vagueness only if it becomes wrong.
- [ ] 6.3 Run `npm test`; all new pure-logic tests pass and existing suites are unchanged.

## 7. Group 7: Art pipeline (pre-rendered 3D sprites, design Decision 12)

- [x] 7.1 `assets/art/README.md`: the founder's generation checklist (locked style sentence, naming, size, per-asset prompt suffixes). `assets/art/.gitkeep`.
- [x] 7.2 `src/art/artAssets.ts`: typed registry (`ArtKey`, `buildingArt`, `artAssets`, `hasArt`, `artOr`), initially empty so Metro never requires a missing file. Test in `src/art/__tests__/artAssets.test.ts`.
- [x] 7.3 `design.md` Decision 12 and style-drift risk; `proposal.md` parked list; `visual-design` delta ADDED "Illustration Style".
- [x] 7.4 Swap placeholders for PNGs once generated: add each PNG to `artAssets` (`'doghouse-1': require('../../assets/art/doghouse-1.png'),`), then use `artOr(key, fallback)` in Den (building cards, `buildingArt`), icons and Doorstep/Celebration backdrops. Integration developer. Done: all 20 PNGs registered and wired into Den, Doorstep, Celebration and screen headers. Buddy PNG parts are still pending.

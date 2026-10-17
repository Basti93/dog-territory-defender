## Context

Today: `DoorstepScreen.tsx` shows a `🐕` emoji (`styles.dogArt`, `🐾` when `session.kind === 'same-day-reopen'`); `DenScreen.tsx` shows a placeholder `denScene` (two SVG circles, "Your dog is resting in the yard"); `CelebrationScreen.tsx` has a private `ConfettiPiece` using `Animated` + `Math.random()`; building cards use a plain coloured square (`cardIcon`); every primary button is a `TouchableOpacity`; `App.tsx` switches screens with an if-chain (`needsDogName` > `celebration` > `showDoorstep` > ...) and no transition; `assets/` is empty and `app.json` has no icon or splash. `react-native-svg` 15.12.1 is already a dependency and already used (`DenScreen`).

Constraints from the founder: start playing this week; every native dependency costs a dev-client rebuild; wants an animated dog that looks like his dog; wants it to feel like a finished game.

## Decisions

### 1. Procedural vector avatar with a customisable look, not a photo-derived dog

`visual-design` says dogs are illustrations/avatars, never photos. A "photo to Nintendogs" feature also needs on-device image processing or a model (native dependency or backend), and the result would be uncanny. Instead the player *describes* his dog (coat, markings, ears, tail, size, accent) and gets a cute stylised Buddy. Rejected: photo import, photo-to-avatar ML, free-form colour picker (invites off-palette, ugly results, and breaks the token rule).

### 2. Built-in `Animated` + `react-native-svg`; no reanimated, Lottie, or 3D

Rejected: **reanimated** (native dependency, rebuild, babel plugin change). **Lottie** (native dependency, and an artist-made file would be one fixed look, so appearance customisation would need many files or runtime recolouring). **3D / expo-gl / three** (native dependencies, heavy, overkill). **Sprite sheets** (customisation multiplies assets). Built-in `Animated` with `useNativeDriver: true` handles transform and opacity on the UI thread, which is all a chunky cartoon dog needs. `AnimatedNumber` must be JS-driven (text cannot use the native driver); see Risks.

### 3. SVG pieces, each inside an `Animated.View`

`Animated` cannot drive SVG attributes on the native driver, but it can drive the *transform of a View that contains an Svg*. So Buddy is a small tree of `Animated.View`s (body, head with ears nested inside so they follow tilt, tail, eyelids, tongue, Zzz, shadow, root for hops), each containing a static `Svg` for that piece. All motion is transform/opacity, so everything runs natively. Piece shapes are *static per appearance* (ear style, tail style, markings pick which SVG paths to draw); only the Views move. Budget: at most 12 animated nodes (target 10). Tail wag and ear flick rotate around a base joint using the `transformOrigin` style (supported by RN 0.81); if it misbehaves, fall back to translate-rotate-translate.

### 4. Pure mood and schedule logic in `buddyMood.ts`

Follows the `resolveDoorstepSession` pattern: exported pure functions beside the component, tested without a renderer.
- `resolveBuddyMood({ sessionKind, greetingFlavor, hour, curious })` returns the *base* mood and whether to play a one-off greeting.
- `pickTrick(rng, previous)` and `nextTrickDelayMs(rng)` with an injectable `rng: () => number`.
- Priority: transient override from props (`excited`/`happy`) > sleepy > curious > idle.

**Deliberate departure from the brief:** the brief said "sleepy for long absence". Long absence instead gets an `excited` greeting. A dog that is asleep, sad, or lonely after you were away is a guilt signal and breaks the anti-guilt rule (`home-dashboard`: no days-since-last-open signal anywhere). Sleepy is for `same-day-reopen` (this already matches the Doorstep's existing `isDozing`) and for 22:00-06:00 local time.

### 5. Persistence: singleton-row table, same shape as `NotificationRepository`

`BuddyAppearanceRepository { getAppearance(): Promise<BuddyAppearance>; saveAppearance(a): Promise<void>; hasChosen(): Promise<boolean> }`, with `createSqliteBuddyAppearanceRepository()` (table `buddy_appearance`, one row `id='singleton'`, one TEXT column per field, `CREATE TABLE IF NOT EXISTS`) and `createInMemoryBuddyAppearanceRepository()`. Rejected: columns on `den_economy` (mixes cosmetics into the economy state, which has a migration history and reward semantics); AsyncStorage/JSON file (new dependency or a second persistence idiom). Reads normalise unknown values to defaults (`normalizeAppearance`), so a future option removal never crashes. The first-launch gate does not need `hasChosen()` (see Decision 7); Settings can use it to label the row. The appearance *model*, option lists, palette and `defaultBuddyAppearance()` live in `src/buddy/buddyAppearance.ts` (not `components/`), mirroring how `notificationDecision.ts` sits beside the notification repository: storage must not import from `components/`. Everything else Buddy-related is under `src/components/buddy/`. The sqlite implementation has no automated test (no expo-sqlite jest harness exists in this repo, same as every other sqlite repository); the contract test runs against the in-memory fake.

### 6. Coat palette as an ADDED requirement, not an edit of "Design Tokens"

Palette values are in the `visual-design` delta. It is a separate requirement because `walk-portrait`'s active delta already MODIFIES "Design Tokens", and two MODIFIED deltas on one requirement overwrite each other at archive. Scoping the palette to the avatar (never UI chrome) also stops coat browns from drifting into screens. Colours are warm and slightly desaturated; charcoal instead of black; off-white so the white coat is visible on `#FAFAF8` (every coat also gets a Dog brown outline).

### 7. First-launch flow without a "has seen picker" flag

`submitDogName` in `App.tsx` sets a local `needsAppearance` state, which renders the picker. Skip or Save both clear it (Skip saves the default). Because the flag is set only by the name submission in the same session, existing named users never see it. If the app is killed between the two steps, the player lands on the Doorstep with the default look, which is acceptable and editable in Settings. No new persisted flag.

### 8. `src/ui/` primitives, each small and single-purpose

`PressableScale`, `AnimatedNumber` (+ exported pure `countUpValue(from, to, progress)`), `Confetti` (extracted from `CelebrationScreen`, colours from spec tokens, 24 pieces, injectable rng for layout), `TreatPop`, `FadeSlideIn`. One file each so a fresh agent opens only what it needs. A shared `src/ui/tokens.ts` exports the existing token hex values; new code imports it. Existing screens keep their local `COLORS` constants unless a task touches them anyway. No big-bang rewrite.

### 9. Start Walk pulse uses session state only

`DoorstepSession.kind === 'fresh-open'` (first open of the day). It does not mean "no walk today"; the Doorstep has no cheap, already-available signal for that, and adding a repository query purely for a pulse is not worth it. The pulse is 2-3 cycles of scale 1.0 to 1.03, then stops. No text.

### 10. Generated app icon, no image dependencies

`scripts/generateAssets.mjs` draws onto a raw RGBA buffer (circles, ellipses, anti-aliasing by supersampling) and encodes PNG with `node:zlib` plus a hand-rolled CRC32. Output is checked into `assets/`. Rationale: reproducible, reviewable, zero npm deps, re-runnable if the palette changes. `userInterfaceStyle` is `"light"` in `app.json` (no dark mode). `android/` is git-ignored and already generated locally, so the icon appears only after `npx expo prebuild --platform android` plus `npx expo run:android`. The implementer reports this; the founder runs it himself.

### 11. Parallel layout of the work

Three disjoint file sets (see `tasks.md`): Buddy + storage (Group 1), `src/ui/` + assets (Group 2), then integration into existing screens and `App.tsx` (Group 3). Only Group 3 edits existing files, so Groups 1 and 2 cannot conflict with each other or with Group 3.

### 12. Pre-rendered 3D illustration style

Decided by the founder. The game's look is **pre-rendered 3D illustration**: characters, Den buildings and icons are PNG sprites that look 3D (soft clay / Pixar-style render, rounded shapes, pastel spring palette from the spec tokens, soft studio lighting, slight top-down three-quarter view, transparent background, no text). The founder generates them with an AI image tool; code only animates them (move, scale, bounce, layer). The vector Buddy and the current flat UI are placeholders until the art lands. `src/art/artAssets.ts` is the registry the screens read, with a vector/flat fallback while a PNG is missing. Rejected:
- **Real-time 3D engine (Unity, Godot)**: a second toolchain and runtime, a rewrite of the app, far beyond "playing this week".
- **expo-three / GLB dog**: native GL dependencies (dev-client rebuild), heavy on low-end Android, and a photo-to-mesh pipeline gives uncanny results. Parked, not dead (see proposal).
- **Flat vector forever**: cheap and light, but it does not give the "complete game" look the founder wants.
- **Photos**: forbidden by `visual-design` (dogs are illustrations); also inconsistent in lighting and framing.

## Buddy mood table

| Mood | Triggered by | Visuals | Duration |
|---|---|---|---|
| `idle` | Default | Breathing, blink every 3-6s, slow tail wag, occasional ear flick and head tilt, weight shift, random trick every 12-25s | Continuous |
| `happy` | Player taps Buddy | Hop, fast wag, tongue out | ~1.5s, then back to requested mood |
| `excited` | Celebration screen; Den upgrade bought; long-absence fresh-open greeting | Repeated bouncing, rapid wag, tongue out | Celebration: whole screen. Upgrade and greeting: ~2s |
| `sleepy` | `same-day-reopen` session; local time 22:00-06:00 | Lying down, slow breathing, eyes closed, floating Zzz, tail still | Continuous; tap wakes to `happy`, then back to sleepy |
| `curious` | A Somewhere Wild invitation line exists in the away strip | Head tilt held, ears up, tail slow wag | Continuous while the hint holds |

Priority: transient (`happy` from tap, `excited` from caller) > `sleepy` > `curious` > `idle`.

## Risks / Trade-offs

- **SVG and View count on low-end Android.** Many Animated.Views each hosting an Svg can be heavy. Mitigation: max 12 animated nodes per Buddy, one Buddy per screen, native driver for all transforms, pieces are static SVG (never re-rendered per frame), picker preview reuses the single Buddy. Task 1.9 includes a manual check on the real device; if it janks, drop weight shift and ear flick first.
- **Loop and timer leaks.** Idle uses `Animated.loop` plus `setTimeout` chains for blink and trick scheduling. Mitigation: all handles in one ref, one `useEffect` cleanup that stops every animation and clears every timer; mood changes stop-and-restart through the same cleanup path. `nextTrickDelayMs` keeps timing decisions out of the component.
- **`AnimatedNumber` is JS-driven.** Mitigation: only short (<=800ms) counts on Celebration/Den, state updates only when the integer changes, never more than two on screen.
- **`transformOrigin` behaviour.** Verify on-device; fallback in Decision 3.
- **Doorstep fold.** Buddy replaces the emoji in `dogArt` and must not add vertical height beyond that block. If it does, shrink the portrait first, never Start Walk. Verified in task 3.1.
- **Icon and splash need a native rebuild.** Everything else hot-reloads (task 4.4).
- **Two active changes touch `visual-design`.** `home-dashboard` (Key Screen Intents), `walk-portrait` (Design Tokens). This change touches neither requirement, by design.
- **Style drift across AI-generated assets.** Separately generated images can differ in lighting, outline, saturation or camera angle. Mitigation: one locked style sentence pasted into every prompt, plus one style-reference image reused for every generation (Midjourney `--sref`, ChatGPT reference image). Both live in `assets/art/README.md`. Re-roll any asset that visibly breaks the set.

## Open questions

None blocking. Left to the implementer: exact SVG path shapes and proportions (target: big head, round body, short legs, large eyes), the picker's swatch layout, and the icon motif (green circle with cream paw print or dog head) within the palette.

## Decisions log (presentation)

Dated bullets for presentation-tier decisions (see CLAUDE.md "Process tiers"). Newest last.

- 2026-10-17 — Buddy's mood and the one-time greeting are resolved once per app launch in `App.tsx` (next to the away-strip resolution) and passed to the Doorstep as props, so remounting the Doorstep on every return trip never replays the greeting. A sleepy mood chosen at launch therefore holds for the whole launch. Reviewer finding; alternative (re-resolve per mount) rejected because it replayed the excited burst on every return.
- 2026-10-17 — Headless Blender (`scripts/blender/`) is the preferred art source for Den buildings, yard, icons and backdrops: deterministic, free, re-renderable, one shared camera/light/material rig guarantees set consistency. `scripts/generateArt.mjs` (Gemini/OpenAI) stays for Buddy likeness from the owner's dog photo, where modelling from primitives cannot deliver a resemblance.
- 2026-10-17 — `FadeSlideIn` is never wrapped around a screen that hosts a WebView (map, Doorstep's territory portrait, Walk Portrait, Territories cards): Android WebViews inside an animating-opacity parent can render blank. Those screens fade only their non-WebView children.
- 2026-10-17 — Den yard art has 3 growth stages while building levels run to 100; `YardScene.tsx` maps level ≥4 to stage 2 and ≥10 to stage 3 (`ART_TIER_2_FROM_LEVEL`, `ART_TIER_3_FROM_LEVEL`). Presentation-only thresholds, picked by eye, tune freely.
- 2026-10-17 — The pre-rendered image skin (`src/buddy/imageSkin.ts`, sources in `imageSkinSources.ts`) is now `BuddyAvatar`'s default skin; `vectorSkin` stays as the per-part fallback when an image source is missing. Markings and accent colour are not rendered by the image skin (the 3D set has none; accent is baked in); `size` is a uniform scale about the feet (small 0.88, large 1.12) with pivots scaled to match.
- 2026-10-18 — Blender renders use per-asset output sizes (icons 256, buildings 512, burst 768, sky 1024, yard 1536x1024) so decoded bitmap memory stays bounded on mid-range Android. Full-size 1024 everywhere was rejected as wasteful for sprites drawn at 32-200 dp.
- 2026-10-18 — Buddy is rendered as per-coat layered parts at 512px, with the image skin as default. Markings and size variants are not rendered (size is a uniform scale about the feet), and pivots are hard-coded in `imageSkinSources.ts` from `manifest.json`, so re-rendering parts means re-checking those pivots by hand.
- 2026-10-18 — Den buildings progress dramatically across 3 stages (tame, cosy, extraordinary), with stage-size ratios of about 50% / 72% / 92% of the frame so upgrades are felt. The first, tamer stage-3 renders were rejected after the owner asked for a progression "from tame to really big and extraordinary so you can really feel the upgrades".
- 2026-10-18 — The clay UI kit (`src/ui/`) plus Nunito is the app-wide look. Why: the owner's on-device check found the flat UI clashed with the clay sprites, so restyling only the art slots was not enough.
- 2026-10-18 — The map uses CARTO Voyager tiles with a pastel tint overlay and clay markers, to match the clay look. Attribution (OpenStreetMap contributors, CARTO) is required and shown in the map's attribution pill. Whether CARTO tiles allow CORS for the Doorstep/Walk Portrait image capture is unverified, so the portrait falls back to its neutral line if capture fails.
- 2026-10-18 — The Den yard scene is the hero at about 48% of screen height (clamped 340-440). The owner found the first, smaller yard too small to enjoy the buildings.

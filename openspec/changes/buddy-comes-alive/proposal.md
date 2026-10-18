## Status

Drafted by `senior-app-architect`, 2026-10-17. Not yet implemented.

## Why

The app works end to end (walk, Home Range, Den, Doorstep, Celebration) but still looks like a prototype: the dog on the Doorstep is a `🐕` emoji, the Den's "scene" is two grey circles, buttons have no press feedback, screens cut in with no transition, and the app has no icon or splash (`assets/` is empty, `app.json` has neither). The founder wants to use the app daily for the next week and have it "look and feel like a complete game", with an animated dog "like Nintendogs" that resembles his own dog.

`visual-design`'s "Delight Interaction Moments" already requires a tail-wag animation, a ticking XP counter and gentle confetti. None of those exist yet except a local confetti in `CelebrationScreen.tsx`. This change delivers them, plus the dog that owns them.

## Scope

**Current slice.** This change is **presentation only**: it adds **no mechanics, no economy numbers, no new persisted game state that affects rewards, and no new thresholds**. Everything the player sees animate is derived from state that already exists (`DoorstepSession.kind`, `DenEconomyState`, the celebration payload). The one new persisted record is cosmetic (Buddy's look).

Explicitly **parked** (do not build here):
- Dog accessories, hats, cosmetics shop: backlog (Long-term hooks).
- Pack companion dogs (a second, third dog on screen): backlog (Long-term hooks).
- Seasonal art / season-themed coats and backdrops: backlog (Repetition loop).
- Sound and haptics: still a deliberate fast-follow (needs a native dependency; see `home-dashboard`'s resolved Open Question).
- Letting the player upload a photo of their dog (see design Decision 1).
- Real-time 3D Buddy (photo, then Meshy/Tripo, then GLB, then expo-gl/expo-three): possible later step; the current slice ships pre-rendered 3D sprites only (design Decision 12).

## What changes

- **Buddy, a procedurally animated vector dog** (`src/components/buddy/`): chunky rounded SVG pieces, each wrapped in an `Animated.View` on the native driver. Idle life (breathe, blink, tail wag, ear flick, head tilt, weight shift, occasional sit/stretch/shake), five moods (`idle`, `happy`, `excited`, `sleepy`, `curious`), tappable.
- **Buddy's look is customisable** so the player can make it resemble his own dog: coat, markings, ear style, tail style, size, accent colour. Chosen in a second step right after the dog-naming prompt (skippable) and editable later in Settings. Persisted through a new tiny `BuddyAppearanceRepository`.
- **Shared juice primitives** (`src/ui/`): `PressableScale`, `AnimatedNumber`, `Confetti` (extracted from `CelebrationScreen`), `TreatPop`, `FadeSlideIn`.
- **Buddy and juice placed into screens**: Doorstep (replaces the emoji), Den (replaces the placeholder scene; hops when an upgrade is bought; building icon bounces), Celebration (excited, ticking counters, confetti), optional small Buddy in empty states. **Not** on the live map during a walk (phone-in-pocket rule).
- **App identity**: generated `icon`, `adaptive-icon`, `splash`, `favicon` PNGs wired into `app.json`.
- **Polish audit**: only real gaps found by reading the screens (listed in `tasks.md` group 5).

## Capabilities

- **New: `buddy-avatar`**: what Buddy is, its moods, its appearance model and persistence, where it appears and where it must not.
- **Modified: `visual-design`**: ADDED "Buddy Coat Palette" requirement; MODIFIED "Additional Exclusions" (avatar clarification) and "Delight Interaction Moments" (adds the Buddy, press, count-up and confetti moments with anti-guilt guardrails).

## New design tokens and why

The existing token list has no colour that can plausibly be a dog's fur. Brown `#8B6F47` is the only fit, and one brown cannot make a player say "that's my dog". The **Buddy coat palette** (8 coats, 3 accents, 3 nose/tongue tones) is defined in the `visual-design` delta as its own requirement, scoped to dog-avatar rendering only: UI chrome SHALL NOT use these colours. All are warm and slightly desaturated so they sit well on `#FAFAF8`; no pure black (warm charcoal instead), no dark mode. Full values are in the delta spec.

Mechanism note: the palette is an **ADDED requirement, not an edit to "Design Tokens"**, because the active change `walk-portrait` already MODIFIES "Design Tokens" (adds muted grey). Two MODIFIED deltas on one requirement would clobber each other at archive. The "Design Tokens" scenario "New color needed" is still satisfied: this proposal is the explanation it demands. See design Decision 6.

## Impact

- No new native dependencies; no dev-client rebuild is needed for any JS work. A **native rebuild is needed only to see the new app icon and splash** (task 4.4).
- New SQLite table `buddy_appearance` (singleton row). No migration of existing tables.
- Existing users (dog already named) get the default look and are not gated; they can change it in Settings.
- `App.tsx` gains one more first-launch step and a `FadeSlideIn` wrapper per screen. Group 3 owns all of `App.tsx`.
- `README.md` folder map and Architecture section get a Buddy entry (task 6.2).

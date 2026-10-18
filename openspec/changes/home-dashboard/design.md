## Context

`App.tsx` is a single-screen, no-navigation app: a boolean-per-screen switch (`showHistory`, `showDen`, `showDebugLog`, `showStats`, `showLogMissedWalk`, plus the `needsDogName`/`celebration` gates) picks which full-screen component to render, falling through to the live map + controls as the default. Several mount-time `useEffect`s already compute exactly the data this screen wants to show: passive Den accrual since last open (`applyPassiveAccrual`, whose delta is discarded today, only used to feed `recordTreatsEarned`), idle-accrued achievements (`pendingDenAchievements`, currently only surfaced via `DenScreen`), and the earned-trigger overflow-notification check (`checkAndScheduleEarnedTriggerNotification`, sharing `NotificationRepository`'s `overflowSurfaced` flag). `SomewhereWildCard.tsx` already exports a pure `evaluateSomewhereWild()` that resolves the exact "wild ground" fact this screen's away-strip is required to fold in, never as a number.

This document assumes `proposal.md`'s scope as settled and answers the concrete "how" questions it flagged.

## Goals / Non-Goals

**Goals:** land the Doorstep as a presentation layer with zero new economy/mechanic logic — every number it shows must trace to a function that already exists and is already tested; keep the anti-guilt guardrail structurally enforced (the day-gap number that picks a greeting flavor must be architecturally incapable of being interpolated into a user-facing string); reuse the already-verified Home Range rendering math for the portrait rather than writing a second renderer.

**Non-goals:** any new social/leaderboard data (social layer, backlog); any change to how treats/XP/achievements are computed; fixing `DenScreen.tsx`'s pre-existing XP progress bar (noted in `proposal.md`, out of scope); detecting or recovering an app-killed-mid-walk session (today, `appState.walk` is unpersisted React state and already resets to `null` on any relaunch — the Doorstep doesn't need to special-case this, it's pre-existing, unrelated behavior).

## Decision 1 — `currentTitleForLevel`: a new function, not a reuse of `titleForLevel`

`titleForLevel(level)` (`src/economy/milestones.ts`) returns non-null **only on an exact milestone level** (2, 4, 7, 11, 16, 22, 29, 37, …) — it exists solely to drive the one-away cliffhanger's "One more walk and he's a…" line at the moment a milestone is being approached, and is correctly null everywhere else. The Doorstep's dog row needs a *persistent* title — whatever Buddy currently holds, at any level, including levels between milestones (e.g. level 12, level 38) — which this function structurally cannot answer.

**Add `currentTitleForLevel(level): string | null`** to the same module: the title of the most recent milestone at or below `level`, i.e. `titleForLevel(mostRecentMilestoneLevelAtOrBelow(level))`. Concretely, reuses `milestoneIndexForLevel`'s existing walk-the-sequence loop (already private in that file) to find the highest milestone level `<= level`, then looks up its title the same way `titleForLevel` does. Behavior at the edges, both deliberate:
- **Level 1** (no milestone reached yet): returns `null`. The dog row's title segment is simply omitted for a level-1 dog — "Buddy · Level 1" with no em-dash/title, not a placeholder string. This is the one gap the concept's own example didn't address (its example level, 12, already has a title to show).
- **Past the 8th authored title** (level 45+, per `virtual-dog-companion/design.md`'s ladder): returns the 8th title ("Horizon Chaser") indefinitely, the same "last real thing said" behavior `titleForLevel` already has for the cliffhanger — not null, since Buddy has genuinely earned that title and it remains true; just not fresher than what's authored yet.

This is additive — `titleForLevel` and its cliffhanger call site (`economy/walkRewards.ts`) are untouched.

## Decision 2 — The territory portrait: answering the game-master's flagged feasibility question

**Feasible, and buildable without a second rendering implementation.** `src/web/homeRangeRendererScript.ts`'s `renderHomeRangeToMap` already separates cleanly into two halves: (a) pure math — Gaussian blur, the Lab-interpolated wildness color LUT, marching-squares contour extraction, all already vanilla JS with no Leaflet dependency — and (b) Leaflet-specific drawing — the `L.imageOverlay`/`L.polyline`/`L.layerGroup` calls that place that math's output onto an interactive, tile-backed map. The portrait only ever needed half (a).

**RESOLVED by user, 2026-08-22: OSM tiles behind the shape** — overrides this Decision's original "no basemap" recommendation below. The plain-canvas approach in the next two paragraphs describes the *rejected* no-basemap path, kept here for context; the actual scope is the tiled version described after it.

**Add one new exported function to the same script string**, `renderHomeRangePortrait(canvas, payload)`: runs the identical blur → color-LUT → fill-pixel loop already in `renderHomeRangeToMap`, plus the identical Range-outline (`HR_CONTOUR_THRESHOLD = 0.5`) marching-squares pass — but stroked directly onto the canvas 2D context (`ctx.moveTo/lineTo/stroke`) instead of as `L.polyline`s, and **deliberately omitting** the wild-ground contour pass and any marker — the concept's own enumeration is "Range outline + Bloom fill," nothing else, matching "no pins/numbers on it." This math-only function is still useful and still gets built — the tiled version composites it as an overlay on top of Leaflet tiles rather than drawing straight to a bare canvas.

**Host it in a new, dedicated, minimal WebView** — `src/web/portraitHTML.ts`, now a cut-down, non-interactive adaptation of `mapHTML.ts`'s Leaflet+tile setup (tiles + the Range/Bloom overlay, no pan/zoom/markers/gestures) rather than the originally-recommended tile-free host — + `src/components/TerritoryPortrait.tsx`. Flow: `TerritoryPortrait` calls `homeRangeRepository.getCells()`, builds the same `buildHomeRangeRasterPayload` (`src/web/homeRangeRaster.ts`) `MapView.tsx` already builds, posts it in as `RENDER_PORTRAIT`; the WebView auto-fits Leaflet to the raster's bounding box, waits for tiles to load, overlays `renderHomeRangePortrait`'s output, captures the composited result to a data URL, and posts back `PORTRAIT_READY { dataUrl }` (or `PORTRAIT_FAILED` on a tile-load timeout — see the network-dependency note below); the RN side then renders a plain `<Image source={{ uri: dataUrl }} resizeMode="contain" />`, tappable, with the WebView itself never visible.

**Why a separate WebView instead of reusing `MapView.tsx`'s existing one:** the Doorstep is shown before the map is ever mounted (no `MapView` instance exists yet at that point), and keeping this WebView's blast radius separate from the interactive map's means a slow/failed portrait render can never affect the map screen the player taps into next.

**Framing** ("fit whatever's claimed"): sized to `buildHomeRangeRasterPayload`'s own bounding box (`w`/`h`, already computed from the Range's cell extent) plus a small fixed cell-padding margin so the shape doesn't crop flush to the image edge — an implementer-level polish number, not logged as a balance threshold.

**First-launch/empty-Range case**: `buildHomeRangeRasterPayload` already returns `null` when there are no cells and no live-walk overlay — `TerritoryPortrait` simply isn't rendered when `cells.length === 0`, and `DoorstepScreen` falls back to the concept's dog + "hasn't marked the map yet" copy. No new empty-state branch needed in the rendering code itself.

**Network-dependency consequence of the tiles decision**: the portrait can now fail to render when offline or on a slow connection (tiles never load). `portraitHTML.ts` posts `PORTRAIT_FAILED` after a short timeout; `TerritoryPortrait` falls back to the dog + a neutral, non-error line (never a broken-image icon, never technical error text) — the same tone as the empty-Range fallback, not a new failure-mode voice.

**Risk, flagged for manual verification**: the portrait's render time/data-URL size hasn't been measured against a very large, long-lived Range (thousands of cells), and now also carries tile-load latency — mirrors `somewhere-wild/design.md`'s own flagged-not-measured risk for its bounded walk-history scan. `tasks.md` 8.7 covers checking this on both a fast connection and offline/throttled.

## Decision 3 — Session-state tracking: reuse `DenEconomyState.lastTickAt`, add no new field

`App.tsx`'s existing passive-accrual mount effect already does exactly this, incidentally: it reads `state.lastTickAt` (the timestamp `applyPassiveAccrual` set at the *previous* app open) before overwriting it with `now`. That pre-overwrite value **is** "when the app was last opened" — a signal that already exists, is already correctly maintained (it's set once, at the one place `applyPassiveAccrual` is ever called, per `grep` confirming there's no second call site), and needs no new persisted field.

**Add a pure function** (in `DoorstepScreen.tsx`, since it's Doorstep-specific, not general economy logic):
```
resolveDoorstepSession(previousLastTickAt, now): {
  kind: 'same-day-reopen' | 'fresh-open';
  greetingFlavor: 'first-open' | 'long-absence' | null; // null iff kind === 'same-day-reopen'
}
```
- `kind` is `'same-day-reopen'` iff `previousLastTickAt` and `now` fall on the same local calendar day (reusing the day-diff math below) — this drives the dog-dozing art and the tight 0-1-line strip cap.
- Otherwise `kind` is `'fresh-open'`, and `greetingFlavor` picks between the two greeting-copy pools: `'first-open'` if the gap is 0-1 calendar days (opened today or yesterday), `'long-absence'` if the gap is 2+ calendar days. **This 2-day cut reuses the "today/yesterday is recent" boundary already established twice elsewhere in this codebase** (the manual-log look-back window, and New Ground's 48-hour card window) rather than inventing a third arbitrary number — logged as a first-pass, easily-retuned threshold, not an empirically-derived one, consistent with how this project already logs threshold decisions it hasn't validated against real usage.

Both `'first-open'` and `'long-absence'` render the **identical** full-strip flow (per the concept's own "structurally identical" instruction) — `greetingFlavor` only selects which greeting-copy pool the (game-master-authored, not pinned here) rotation picks from.

**Hard guardrail, not a suggestion**: the day-gap number computed to decide `greetingFlavor` must never be read by, or interpolated into, any user-facing string, anywhere. It exists purely to pick between two fixed copy pools. This is the direct code-level implementation of the concept's own anti-pattern list ("no days-since-last-walk number... no apology framing") — worth stating explicitly because it's exactly the kind of internal signal a later, context-free edit could accidentally surface (e.g. "let's make the long-absence greeting more specific" by someone who doesn't know that's the one thing this screen is designed to never do).

**Day-diff math**: `SomewhereWildCard.tsx` already has a private `startOfLocalDay`/day-diff helper (used by its own `dayPhrase`). Rather than write a third slightly-different implementation, **extract it into `src/utils/manualWalkLog.ts`** (which already exports the same-purpose `calendarDayKey`, and is already imported well outside literal "manual walk log" concerns by `denEconomy.ts`/`walkRewards.ts` — this file is already the de facto calendar-utilities module despite its name) and have both `SomewhereWildCard.tsx` and `DoorstepScreen.tsx` import it. **Flagged, not fixed here**: if a third or fourth generic calendar helper lands in this file, it should be renamed/extracted to a dedicated `utils/calendarDay.ts` — not this change's job to do that rename as a drive-by.

**Why the Doorstep doesn't need an `AppState` foreground listener** (unlike `SomewhereWildCard`'s debounced re-evaluation): the Doorstep is shown exactly once per cold start, in the boolean-flag screen chain, then dismissed for the rest of the process's life once the player taps Start Walk / the portrait / the Den footer. There is no "re-foreground while already showing" case to debounce, because backgrounding and resuming the app mid-session never re-shows it — only a full relaunch does, which is a fresh mount and therefore a fresh, correct read of `lastTickAt`.

## Decision 4 — Away-strip line sourcing and priority order

The concept lists five possible sources but doesn't order them or say what happens when more than one is true at once. Resolved:

**On a `fresh-open`** (cap: up to 3 lines), in this order, each independently nullable:
1. **Somewhere Wild** — call `evaluateSomewhereWild()` (`SomewhereWildCard.tsx`, already exported) directly with the same deps it already takes. If it resolves a card (New Ground or wild-cluster state — that function already encodes its own internal priority between those two), use its `.text` verbatim as one line. **This is a straight reuse, not a second implementation** — the concept's own rule ("Bloom decay... only ever surface via the existing Somewhere Wild card... at most one") is satisfied by construction, not by re-deriving wildness/cluster logic a second time for this screen.
2. **Idle-accrued achievement** — from `pendingDenAchievements` (passed down from `App.tsx`, see Decision 6; not re-derived here, since re-running the accrual/unlock check a second time would see `lastTickAt` already advanced and silently compute a near-zero delta). If non-empty, show `Earned: {ACHIEVEMENTS[id].name}.` for the first entry; any remaining queued achievements stay queued for the Den screen exactly as they do today (this screen doesn't newly drain the whole queue at once, matching the existing one-at-a-time notice pattern).
3. **Treats economy** — mutually exclusive, storage-at-cap wins if both are true: if the overflow line's gating condition (Decision 6) says show it, show `The Doghouse is full — {treats} treats waiting.`; else if `accruedDelta > 0` (passed down from `App.tsx`, same reasoning as above), show `The Treat Bakery baked {accruedDelta} treats.`
4. **Occasional anchor line** — only considered if 1-3 all resolved to nothing (i.e. the strip would otherwise be empty): `Buddy's Bakery bakes faster the more he walks.`, shown with a flat, first-pass **25% chance**, plain `Math.random()` — no determinism requirement here (unlike the wild-cluster copy's variant rotation, which needed determinism to avoid the "does the marker jump around" bug class; this is zero-stakes, zero-mechanical-consequence flavor text). If the roll fails, the strip renders nothing, per the concept's explicit "nothing happened → strip doesn't render at all" rule.

**On a `same-day-reopen`** (cap: 1 line, no anchor line): the same 1-3 candidates are evaluated in the same order, but only the single highest-priority non-null result is shown, and item 3's phrasing shrinks to the concept's own smaller example (`+{accruedDelta} in the bowl.`) rather than the full Bakery sentence. No anchor line is ever eligible in this state (it's a first-open decorative touch, not a several-times-a-day one).

## Decision 5 — `personal-stats/spec.md`'s Achievement Unlock Presentation needs broadening, not a new mechanism

That requirement currently says a Den-triggered/idle achievement "SHALL surface as a lightweight in-Den notice" — naming the Den screen specifically. This screen now also wants to show the exact same fact, before Den is ever opened, using the exact same `pendingDenAchievements` queue and the exact same `unlockAchievements` record. This is a location broadening of an existing presentation requirement, not a new unlock mechanism, a new achievement type, or a mechanical change — see the `specs/personal-stats/spec.md` delta's `MODIFIED Requirement`.

**Queue-consumption rule**: whichever surface shows the achievement first calls the existing `onAcknowledgePendingAchievements` callback (same one `DenScreen` already calls) so it isn't shown a second time. Since the Doorstep is, by construction, the very first screen rendered after the mount effect that populates this queue, in practice the Doorstep will almost always win that race — which is the intended behavior (the player sees it immediately, not after a separate trip into Den).

## Decision 6 — Overflow-line/push-notification sequencing: a real ordering dependency, not two independent effects

The concept says the storage-at-cap line should "fold any pending overflow-notification state... don't duplicate" — the most natural reading is that it shares `NotificationRepository`'s existing `overflowSurfaced` flag (the actual notification-bookkeeping mechanism), not `DenScreen.tsx`'s separate, simpler, always-shows-when-capped banner (which is a different, older, already-shipped mechanism this change doesn't touch — noted so it isn't mistaken for something this change forgot to unify).

Today, `App.tsx` runs `checkAndScheduleEarnedTriggerNotification` in its own `useEffect(() => {...}, [])`, independently of the passive-accrual effect — two separate async chains racing on mount, with no ordering guarantee between them. That race is harmless today (nothing else reads `overflowSurfaced` mid-flight), but it becomes a real bug once the Doorstep also reads and writes that same flag: if the earned-trigger check runs first and schedules a push notification, the player would get a **push notification for an overflow they're looking at on the Doorstep in the very same app-open** — silly, and avoidable.

**Fix: sequence, don't parallelize.** The Doorstep's own overflow-line resolution (which needs to read `NotificationRepository`'s state, and if it decides to show the line, write `overflowSurfaced: true` immediately) must complete — including its write — **before** `checkAndScheduleEarnedTriggerNotification` runs. Concretely: merge these into one sequential async routine in `App.tsx`'s mount effects (`await` the Doorstep-facing overflow check, then `await checkAndScheduleEarnedTriggerNotification(...)`), not two independent `useEffect`s that happen to be declared in a particular order — declaration order alone does not sequence their internal `await`s. This means: **whichever channel the player is looking at right now wins**, and the other one correctly sees the fact as already surfaced.

## Decision 7 — Prop shape: repositories down, one-time-computed values down, nothing re-derived

Matching every other screen component in this codebase (`DenScreen`, `StatsScreen`, `SomewhereWildCard`) rather than centralizing more logic into `App.tsx`:

- **Passed as repository props**, fetched internally by `DoorstepScreen` on mount (full `DenEconomyState`, `HomeRangeRepository.getCells()`, `NotificationRepository` state, `evaluateSomewhereWild`'s own deps): `denEconomyRepository`, `homeRangeRepository`, `walkRepository`, `notificationRepository`. Nothing here needs `personalStatsRepository` directly — achievement content comes from the `pendingDenAchievements` prop below, not a fresh repository read.
- **Passed as already-computed values, not re-fetched or re-derived** (because re-deriving them after `App.tsx`'s own mount effect has already advanced `lastTickAt`/consumed the delta would silently produce ~0 or an empty queue): `accruedDelta: number`, `pendingDenAchievements: AchievementId[]`, plus the existing `dogName`/`treats`/`level` scalars `App.tsx` already holds in state (no need to read `DenEconomyState` twice for numbers `App.tsx` already has).
- **Callbacks**: `onAcknowledgePendingAchievements` (same one `DenScreen` already receives), `onStartWalk` (dismiss + call the existing `startWalk`), `onOpenMap` (dismiss only — the portrait tap), `onOpenDen` (dismiss + `setShowDen(true)`).

## Decisions 8-13 — Persistent home screen, folded in from a founder on-device finding (2026-08-22)

Decisions 1-7 above describe the Doorstep as originally scoped: a one-time landing gate shown once per cold start, never reappearing. On-device testing of that exact behavior (this capability's own manual-verification task 8.1) surfaced that it reads as a bug from the player's own perspective: once dismissed, there is no way back to the Doorstep for the rest of the session. The founder, in their own words:

> "For the home-dashboard, it should replace the current button list (screen after home screen) - so we only have one home screen. The settings/options and debug button and other not so important stuff goes to a burger menu and only the core game functions and data should be visible. So it's like an overview - also that fixes the issue that you can't go back to the new homescreen once you are on the 'old' homescreen. Of course the territory map screen needs to be still openable."

This reverses the "landing gate, not a hub" framing in `proposal.md`'s original What Changes (now updated) before it ever shipped — logged here plainly, per this project's "no silent drift" rule, rather than silently overwritten. `specs/home-dashboard/spec.md`'s "The Doorstep Is the Persistent Home Screen" requirement carries the same before/after note.

### Decision 8 — Return-to-Doorstep mechanism: extend the existing `showX` boolean convention, not a navigation library

`App.tsx` is a chain of early `if (x) return <ScreenX/>` blocks, one boolean per screen, no navigation library (by design — `CLAUDE.md`). The founder's ask does not require a router, a stack, or any new abstraction — it requires exactly one thing this convention doesn't already do: every screen's `onClose` currently only turns its own boolean off, leaving whatever's "underneath" (nothing, in most cases — the final unconditional map/idle-button-list block) to render instead of the Doorstep.

The fix: every dismiss handler that should return to the Doorstep additionally calls `setShowDoorstep(true)`, alongside `setShowX(false)`:

| Screen | Today's `onClose` | New `onClose` |
|---|---|---|
| The Den (`showDen`) | `setShowDen(false)` | `setShowDen(false); setShowDoorstep(true)` |
| Stats & Badges (`showStats`) | `setShowStats(false)` | `setShowStats(false); setShowDoorstep(true)` |
| Walk History (`showHistory`) | `setShowHistory(false); setHomeRangeRefreshKey(...)` | same, plus `setShowDoorstep(true)` |
| Debug Log (`showDebugLog`) | `setShowDebugLog(false)` | `setShowDebugLog(false); setShowDoorstep(true)` |
| Log a Missed Walk (`showLogMissedWalk`) | `setShowLogMissedWalk(false)` (in `onClose`; `logMissedWalk`'s own success path also sets this false) | same, plus `setShowDoorstep(true)` |
| Walk Portrait (`viewingWalk`) | `setViewingWalk(null)` | **unchanged** — nests under Walk History (`walk-portrait/design.md` precedent), returns to the still-mounted History list, not the Doorstep |
| Territories (`showTerritories`), both `onClose` and `onOpenMap` | `setShowTerritories(false)` | **unchanged** — Territories nests under the map screen (`territories/design.md` Decision 8, confirmed still correct); dismissing it returns to the map, not the Doorstep |
| The idle map screen itself | (no dismiss today — it's the unconditional fallback) | new "back to Doorstep" control calls `setShowDoorstep(true)` |
| "New Walk" button (`resetWalk`) | `resetWalk()` only | `resetWalk(); setShowDoorstep(true)` — see rationale below |

**Why "New Walk" also returns to the Doorstep:** today, `resetWalk()` clears `appState` and falls back to the same idle map screen — which used to have its own Start Walk button, so the player could immediately start walk #2 without leaving the map. Once that button list is removed (Decision 9), a player who taps "New Walk" would land on a now action-less idle map with nothing to tap except the new "back to Doorstep" control. Returning to the Doorstep directly closes that gap for free. Not explicitly requested by the founder, but a direct, small, in-scope consequence of removing the button list — flagged here rather than silently folded in.

**Alternative rejected: introduce a navigation library.** Nothing about this bug requires stack-based routing, deep links, or back-gesture handling a real router would add; `CLAUDE.md` is explicit the current architecture is intentional for this project's size.

**Alternative rejected: a single `screen` enum/string instead of N booleans.** Would be a larger, riskier refactor of every existing screen (touching `viewingWalk`'s nullable-object convention, `celebration`'s, etc.) for a bug whose actual fix is "a few `onClose` handlers need one more line."

### Decision 9 — The idle map screen: same final fallback block, restructured content, no new boolean

The final unconditional `return` in `App.tsx` does double duty: the *tracking* screen (map + Finish Walk/Cancel) when `appState.isTracking`, and the *idle* screen (map + six-button stack) when not. That split is correct and stays — the bug is only in the idle branch's content.

Idle branch changes:
- **Removed:** the idle-screen's Start Walk / Log a Missed Walk / View Past Walks / The Den / Stats & Badges / Debug Log buttons. Start Walk is redundant once it lives on the Doorstep one tap away — two "start a walk" entry points is one more than needed to keep in sync.
- **Added:** a single "back to Doorstep" control (`setShowDoorstep(true)`) replacing the removed stack. Exact styling is an implementer call — a small top-corner control mirroring `MapView.tsx`'s existing floating Territories-button chrome (`styles.territoriesButton`) would be visually consistent, but that's UI polish, not structural.
- **Unchanged:** the map itself, the distance/points/treats/level stats readout, `SomewhereWildCard`, `MapView`'s own `onOpenTerritories` floating button, and the conditional "New Walk" button (now also returning to the Doorstep — Decision 8).
- **Unchanged, explicitly confirmed still correct:** the tracking branch (`appState.isTracking === true`) — Finish Walk / Cancel, no Doorstep affordance anywhere in it.

**Where the "back to Doorstep" control lives — `App.tsx`, not `MapView.tsx`:** `MapView.tsx` already establishes the right boundary — it exposes `onOpenTerritories` as an optional callback without knowing what `TerritoriesScreen` is, and its own floating chrome exists only for concerns genuinely about *the map* (Territories is a map-scoped list). "Return to the app's home screen" is an app-level navigation concern; `MapView.tsx` shouldn't gain a second, unrelated reason to know about `App.tsx`'s screen stack. It belongs in `App.tsx`'s existing `styles.controls` panel, where the removed button stack already lived.

### Decision 10 — Lift `resolveDoorstepSession`/`resolveAwayStripLines`/`pickGreeting` out of `DoorstepScreen`, into `App.tsx`'s existing mount effect

This is the one real technical risk in folding in the persistent-home-screen behavior, and it's not hypothetical — tracing it through confirms a concrete regression it would otherwise introduce.

**The mechanism:** `App.tsx` renders exactly one screen at a time via early-return branches. Navigating away from the Doorstep means `showDoorstep` becomes `false` and React fully **unmounts** `<DoorstepScreen/>`. Making the Doorstep reachable again (Decision 8) means React **mounts a brand-new `DoorstepScreen` instance** later — every `useState` inside it, including `session`, starts over.

`DoorstepScreen`'s own mount effect already has a guard whose doc comment states the intent plainly: *"the Doorstep resolves its state exactly once per cold start."* That guard (`if (previousLastTickAt === null || session !== null) return`) only protects against the effect re-running *within one mount* — it does nothing across a full unmount/remount cycle, because `session` is back to `null` on the new instance regardless. Every return trip to the Doorstep this session would re-run `resolveDoorstepSession` and `resolveAwayStripLines` from scratch.

`resolveDoorstepSession`'s output is harmless to recompute (`previousLastTickAt` and same-day `now` don't move enough to flip session kind within one session). `resolveAwayStripLines` is the real problem: `accruedDelta`, `showOverflowLine`, and `justRevealedTerritoryIncome` are `App.tsx` state set **once**, by the merged mount effect (Decision 6), and never cleared afterward. A remounted `DoorstepScreen` would recompute the away-strip from those same still-nonzero values every time, so a player who taps into the Den and back out would see "+12 in the bowl" (or the storage-at-cap line, or the territory-income reveal) reappear on every single return — a real, repeat-firing regression. (`pendingDenAchievements` is already safe: it's an `App.tsx` array explicitly cleared to `[]` after first display via `onAcknowledgePendingAchievements`, so a remount naturally sees it empty on the second visit — no change needed there.)

**The fix:** move the `resolveDoorstepSession(...)`, `resolveAwayStripLines(...)`, and `pickGreeting(...)` calls out of `DoorstepScreen`'s own mount effect and into `App.tsx`'s existing merged mount effect from Decision 6 (which already runs exactly once per app process — precisely the guarantee this needs). Add resolved `App.tsx` state (a `DoorstepSession | null`, a greeting string, an `AwayStripLine[]`) computed once there, then pass them down to `DoorstepScreen` as plain already-resolved props — exactly like `accruedDelta`/`pendingDenAchievements`/`showOverflowLine` already are, per this file's own Decision 7 convention ("nothing re-derived downstream of an already-resolved fact"). `DoorstepScreen` becomes fully consistent with its own documented rule instead of being the one place that doesn't follow it.

`resolveDoorstepSession`, `resolveAwayStripLines`, and `pickGreeting` themselves are untouched — still pure functions, still unit-tested exactly as today (`DoorstepScreen.test.ts`). Only their call site moves.

**What stays a live per-mount fetch, deliberately:** `denEconomyRepository.getState()` (building levels feeding `getUpgradeTease`/`storageCap`/`buddyTreatsPerWalk`) and `TerritoryPortrait`'s own Home Range fetch. Both should legitimately re-fetch every time the Doorstep is revisited — a player who upgrades a building in the Den or paints new ground and then returns to the Doorstep should see that reflected immediately. Only the once-per-launch away-strip/greeting facts need to stop re-deriving.

**Alternative rejected: keep the Doorstep permanently mounted, overlay other screens on top of it.** Would genuinely solve the remount problem, but is a materially bigger architectural change — it breaks the "exactly one screen renders" invariant every other screen in this file relies on, with no existing precedent in this codebase. Not warranted to fix a repeat-firing away-strip line.

**Alternative rejected: a module-level `let awayStripResolvedThisSession = false` flag inside `DoorstepScreen.tsx`.** Would work, but hides the one-shot guarantee outside React's data flow, in mutable module state a fresh agent reading this file months from now would have no reason to expect. Lifting to `App.tsx` state keeps the guarantee visible and consistent with every other "resolved once, passed down" value already in this file.

### Decision 11 — A related, pre-existing latent bug, fixed as a one-line consequence of the same code path

The earned-trigger notification-tap listener (`App.tsx`, the `Notifications.addNotificationResponseReceivedListener` effect and its matching `getLastNotificationResponseAsync` check) calls `setShowDen(true)` directly, without touching `showDoorstep`. Today, if a cold start is triggered by tapping that notification, `showDoorstep` defaults to `true` at the same time `showDen` becomes `true` — since `showDoorstep`'s `if` branch is checked first in the chain, **the Den never actually opens**; the player just sees the Doorstep, with no indication the notification tap did anything. This is already latent today, independent of the persistent-home-screen change, but it sits in the exact code path being restructured here (every other forward-navigation into a screen already clears `showDoorstep` — this is the one that doesn't). Fixed as a one-line addition (`setShowDoorstep(false)` alongside the existing `setShowDen(true)`, in both places that effect calls it) — the same one-line pattern every other `onOpenX` handler in this file already applies, not a new mechanism.

### Decision 12 — Doorstep's direct-access row: History and Stats only, not a third Den icon

The founder's candidates for "core game functions and data" visible directly on the Doorstep: View Past Walks, The Den, Stats & Badges (Start Walk is already there). The Den already has its own entry point — the existing footer tease (`"🦴 {treats} / {cap} treats · Upgrade for {cost}"`, tapping it calls `onOpenDen`) — so a second, redundant Den icon would be exactly the "competes with Start Walk" clutter this screen's own design (Decision 7's restrained prop/layout philosophy) already avoids. The direct-access row is therefore two items: **View Past Walks** and **Stats & Badges**.

Placement: a slim icon row between the Start Walk button and the Den tease footer (existing layout order: dog row → territory portrait → away-strip → Start Walk → Den tease footer → territory-income line). Start Walk stays the first and most visually prominent actionable element; the icon row reads as a secondary utility strip beneath it. Exact icon/label styling is an implementer call — restrained (small, muted-color, consistent with the Den tease footer's own understated treatment) rather than full-width colored buttons like the removed idle-screen stack.

### Decision 13 — "Log a walk we missed" goes in the burger menu, not the direct-access row; the burger menu is a local `Modal` overlay

The founder asked for a reasoned call, not a guess, on Log a Missed Walk's placement. Recommendation: **burger menu**, alongside Debug Log.

Reasoning: Doorstep-worthiness, per this screen's own "single primary action, nothing competes with Start Walk" design intent (Decision 7) and the founder's own framing ("core game functions... visible" vs. "not so important stuff"), tracks *how often a player reaches for something*, not *whether it's a real reward-granting action*. Log a Missed Walk **is** a real, full-reward action — but it's a recovery path for a walk that already happened without GPS tracking running, used occasionally (capped at 2/day, `evaluateManualLogQuota`), not a daily-loop action every session touches the way Start Walk, checking History, or checking Stats are. The burger menu — reserved for infrequent/secondary actions — fits by that same frequency logic, independent of also sitting next to a genuinely "not important" item like Debug Log.

**The burger menu itself:** a new small component (implementer's choice of filename, e.g. `DoorstepMenu.tsx`) using React Native's built-in `Modal` (`transparent`, a simple slide-up or fade sheet — no new dependency), listing exactly two rows: Debug Log and Log a Walk We Missed. Its own open/closed boolean is **local state inside `DoorstepScreen`** (a `useState`, not lifted to `App.tsx`) — nothing outside `DoorstepScreen` needs to coordinate on whether the menu overlay is open; it's purely presentational UI state, unlike every other `showX` in `App.tsx`, which all gate a full-screen navigation destination.

Tapping either row calls a new callback prop (`onOpenDebugLog` / `onOpenLogMissedWalk`, added alongside the existing `onStartWalk`/`onOpenMap`/`onOpenDen`), which `App.tsx` wires the same way it already wires `onOpenDen`: `() => { setShowDoorstep(false); setShowDebugLog(true); }` (and the equivalent for `showLogMissedWalk`). The menu's own local `isOpen` state should close itself in the same handler, so it doesn't reappear already-open the next time the Doorstep remounts.

**Alternative rejected: a `showBurgerMenu` boolean in `App.tsx`, rendered as its own screen branch.** Every other boolean in that chain gates a genuine full-screen destination; the burger menu is a small transient overlay on top of one screen (the Doorstep), not a destination of its own. Modeling it as local component state matches what it actually is and keeps `App.tsx`'s already-long boolean list from growing for something that isn't a screen.

**Full item accounting — nothing from the removed button list is unaccounted for:**

| Removed idle-screen button | New home |
|---|---|
| Start Walk | Doorstep (already existed there — the idle-screen copy is simply deleted) |
| Log a walk we missed | Burger menu |
| View Past Walks | Doorstep direct-access row |
| The Den | Doorstep footer tease (already existed there — no new icon added) |
| Stats & Badges | Doorstep direct-access row |
| Debug Log | Burger menu |

## Collect-tap scoping

The fly/bounce animation itself is in-scope now: plain RN `Animated` (translate + fade the treats-line text/icon toward the footer counter's position) — no new dependency, matches the project's existing (SVG-based, no animation library) visual toolkit. **The sound is a separate, larger question**, flagged in `proposal.md`'s Open Questions rather than decided here: this codebase has never played a sound (no `expo-audio`/`expo-av` in `package.json`, no audio asset anywhere under `assets/`), despite `game-backlog/spec.md`'s standing "audio-first" cross-cutting constraint. Adding the project's first audio dependency and sourcing a "ding" asset for one tap interaction is a real, if small, scope increase that deserves an explicit yes/no rather than a silent library add — recommended default (not decided here): ship the animation now, treat the sound as a fast-follow once an asset is sourced.

## Noted, not fixed here

`visual-design/spec.md`'s "Additional Exclusions" requirement already bans "gamey chrome (XP bars...)" everywhere in the app, yet `DenScreen.tsx` already ships a literal XP progress bar (`levelBarTrack`/`levelBarFill`), pre-dating this change. This proposal's "no XP bar" instruction for the Doorstep specifically is honored by construction (the dog row is a number + title, nothing else) — but a future reader comparing this screen's restraint against `DenScreen`'s existing bar shouldn't read that as this change's oversight; it's a pre-existing, already-shipped inconsistency this change isn't scoped to touch.

## Risks / Trade-offs

- **[Portrait data-URL size at a very large Range]** — not measured; see Decision 2. Flag for manual on-device verification with a long-lived synthetic dataset, mirroring `somewhere-wild`'s own precedent for an unmeasured-at-scale risk.
- **[Overflow-line/notification sequencing (Decision 6) is a real behavior change to two existing mount effects]** — low risk (both effects already exist and are already tested independently), but the merge itself needs its own test coverage (see `tasks.md`), since sequencing bugs here are exactly the kind of thing that only shows up as "got a redundant push notification" on a real device, not in a unit test that doesn't exercise timing.
- **[The 2-day long-absence threshold and the 25% anchor-line chance are both unvalidated first-pass numbers]** — accepted, logged as such per project convention; cheap to retune, no economy stake either way.
- **[No basemap on the portrait vs. tiles behind it is still an open call]** — see `proposal.md` Open Questions; doesn't block starting the rest of this change, since `TerritoryPortrait.tsx`'s prop surface (`onReady(dataUrl)`, tappable) is the same either way — only `portraitHTML.ts`'s internals would change if the answer comes back "yes, show tiles."
- **[Decisions 8-13 reverse a requirement drafted earlier in this same change, before it ever shipped]** — logged plainly rather than smoothed over: `specs/home-dashboard/spec.md`'s "Doorstep Precedes the Map, Once Per Cold Start" requirement (and this file's own Decision 3 framing, "why the Doorstep doesn't need an `AppState` foreground listener... because backgrounding and resuming... never re-shows it") described a one-time landing gate. That's now superseded by "The Doorstep Is the Persistent Home Screen." Caught by this capability's own on-device manual-verification task (8.1) before archiving, not after — the reason `home-dashboard` was still open when this reversal happened.
- **[`DoorstepScreen.tsx`'s prop surface grows again]** (two new resolved values — `session`/`greeting`/`awayStripLines` — plus four new callback props: `onOpenHistory`, `onOpenStats`, `onOpenDebugLog`, `onOpenLogMissedWalk`). Consistent with Decision 7's existing "everything pre-resolved, nothing re-derived" convention, but worth a fresh agent noting: this component is now a fairly thin presentational shell over a large, mostly-`App.tsx`-owned prop list — a deliberate, already-established pattern, not new sprawl introduced by Decisions 8-13.
- **[Manual verification is the only real coverage for the `App.tsx`-level navigation wiring itself]** (Decisions 8, 9, 11) — same as every prior change touching this file, which has no test file of its own. The pure-function pieces (`resolveDoorstepSession`/`resolveAwayStripLines`/`pickGreeting`) keep their existing unit tests unchanged, since their logic isn't changing, only their call site (Decision 10).

## Source

Concept: `game-master` subagent pass ("The Doorstep"), provided verbatim. Technical scoping and Decisions 1-7: `senior-app-architect`, grounded in this session's direct reads of `App.tsx`, `src/economy/denEconomy.ts`, `src/economy/milestones.ts`, `src/economy/formulas.ts`, `src/economy/personalStats.ts`, `src/storage/HomeRangeRepository.ts`, `src/storage/NotificationRepository.ts`, `src/notifications/earnedTrigger.ts`, `src/notifications/notificationDecision.ts`, `src/components/SomewhereWildCard.tsx`, `src/components/DenScreen.tsx`, `src/web/homeRangeRendererScript.ts`, `src/web/homeRangeRaster.ts`, `src/utils/manualWalkLog.ts`, `src/utils/grid.ts`, `package.json`, `app.json`, and the archived `virtual-dog-companion`, `home-range`, `home-range-rewards`, `somewhere-wild`, and `walk-start-notifications` changes' `design.md`s.

Bug report behind Decisions 8-13: the founder, on-device, verbatim quote above. Technical scoping: `senior-app-architect`, additionally grounded in `src/components/DoorstepScreen.tsx` as actually implemented, `src/components/MapView.tsx`, `src/components/__tests__/DoorstepScreen.test.ts`, and the `territories` change's `design.md` Decision 8 / `tasks.md` 10.3 (confirming the Territories entry point needed no change).

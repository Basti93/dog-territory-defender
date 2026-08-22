## 0. Sequencing

- [x] 0.1 Read `design.md` in full, especially Decisions 1, 3, 4, and 6 — this task list assumes those resolutions (the new `currentTitleForLevel`, the `lastTickAt`-reuse for session state, the away-strip priority order, and the overflow/notification sequencing fix) as settled, not open questions.
- [x] 0.2 RESOLVED by user, 2026-08-22: collect-tap sound is visual-only (no audio dependency); portrait shows OSM tiles behind the shape (overrides `design.md`'s own "no basemap" recommendation — see `proposal.md`'s Open Questions and task 2.3's rewritten scope below).

## 1. `currentTitleForLevel` — pure function, lowest risk, buildable first

- [x] 1.1 In `src/economy/milestones.ts`: add `currentTitleForLevel(level): string | null` per `design.md` Decision 1 — the title of the most recent milestone at or below `level`; `null` below the first milestone level; the 8th authored title indefinitely past level 37. Reuse the existing milestone-sequence-walking logic already in that file rather than re-deriving it.
- [x] 1.2 Unit tests in `src/economy/__tests__/milestones.test.ts`: level 1 returns `null`; a level between two milestones (e.g. 12) returns the lower milestone's title; an exact milestone level returns its own title; level 45+ returns the 8th title, not `null`.

## 2. Territory portrait rendering

- [x] 2.1 In `src/web/homeRangeRendererScript.ts`: add `renderHomeRangePortrait(canvas, payload)` per `design.md` Decision 2 — reuses the existing blur/color-LUT/fill-pixel loop and the existing `HR_CONTOUR_THRESHOLD = 0.5` marching-squares pass, stroked via the canvas 2D context instead of `L.polyline`. Deliberately omits the wild-ground contour pass and any marker. No Leaflet dependency in this function.
- [x] 2.2 Extend `src/web/__tests__/homeRangeRendererScript.test.ts` with coverage for `renderHomeRangePortrait` (same synthetic-payload style already used for the existing contour tests) — confirm it draws the fill and Range-outline contour and does not draw a wild-ground contour or marker.
- [x] 2.3 New `src/web/portraitHTML.ts`: **RESOLVED to include OSM tiles (task 0.2)** — a cut-down, non-interactive adaptation of `mapHTML.ts`'s Leaflet+tile setup (tiles + the Range/Bloom overlay via `HOME_RANGE_RENDERER_SCRIPT`, no pan/zoom/markers/gestures/attribution-UI chrome beyond what OSM's tile terms require), auto-fit to the raster's bounding box, then captured to a data URL (e.g. `leaflet-image` equivalent or a Leaflet `_getMapPanePos`/canvas-renderer snapshot approach — implementer's call on the concrete capture mechanism, note it in a code comment since this is new territory for this codebase). Listens for `RENDER_PORTRAIT { raster, w, h }`, posts back `PORTRAIT_READY { dataUrl }` on success or `PORTRAIT_FAILED` if tiles don't load (offline/no network) within a short timeout.
- [x] 2.4 New `src/components/TerritoryPortrait.tsx`: fetches `homeRangeRepository.getCells()`, builds the raster payload via the existing `buildHomeRangeRasterPayload` (`src/web/homeRangeRaster.ts`), posts it to a hidden `portraitHTML` WebView, and renders a plain tappable `<Image source={{ uri: dataUrl }} resizeMode="contain" />` once `PORTRAIT_READY` arrives. Renders nothing (caller shows the empty-Range fallback instead) when `cells.length === 0`. On `PORTRAIT_FAILED` (no network/tiles didn't load in time): fall back to the dog + a neutral, non-error line (e.g. reuse the empty-Range invitation copy's tone) — never a broken-image icon or a technical error string.
- [x] 2.5 Small fixed cell-padding margin around the raster's own bounding box so the shape doesn't crop flush to the portrait's edges (implementer's polish number, not a logged threshold).

## 3. Away-strip and session-state pure logic

- [x] 3.1 Extract `SomewhereWildCard.tsx`'s private day-diff helper into `src/utils/manualWalkLog.ts` (alongside the existing `calendarDayKey`) per `design.md` Decision 3; update `SomewhereWildCard.tsx` to import it. No behavior change — confirm `src/components/__tests__/SomewhereWildCard.test.ts` still passes unmodified.
- [x] 3.2 New `src/components/DoorstepScreen.tsx`: pure exported function `resolveDoorstepSession(previousLastTickAt, now)` per `design.md` Decision 3 (`'same-day-reopen' | 'fresh-open'` kind, plus a `greetingFlavor` only meaningful for `'fresh-open'`, using the 2-calendar-day cut). The day-gap number itself MUST NOT be returned as part of any string, only as the enum/flavor selection — enforce this by construction (the function's return type has no numeric field a caller could interpolate).
- [x] 3.3 Pure exported function `resolveAwayStripLines(deps, sessionKind)` per `design.md` Decision 4: calls `evaluateSomewhereWild` directly (no reimplementation), reads `pendingDenAchievements`/`accruedDelta`/overflow state from `deps`, applies the priority order and the fresh-open (up to 3, + 25%-chance anchor line if all three are null) vs. same-day-reopen (at most 1, no anchor line, smaller treats phrasing) caps.
- [x] 3.4 Unit tests in `src/components/__tests__/DoorstepScreen.test.ts` (matching `SomewhereWildCard.test.ts`'s pattern of testing the pure logic directly, no React renderer needed): every priority-order combination (all four sources true at once picks the right 3; storage-at-cap suppresses the plain accrual line; same-day-reopen caps to 1 and never shows the anchor line; nothing true renders nothing on a `fresh-open` when the anchor-line roll fails); `resolveDoorstepSession`'s boundary at exactly 1 vs. 2 calendar days.

## 4. Overflow-line / earned-trigger notification sequencing fix

- [x] 4.1 In `App.tsx`: merge the passive-accrual mount effect and `checkAndScheduleEarnedTriggerNotification`'s mount effect into one sequential async routine per `design.md` Decision 6 — the Doorstep-facing overflow-line resolution (including its `notificationRepository.saveState({ overflowSurfaced: true, ... })` write, if it decides to show the line) must complete before `checkAndScheduleEarnedTriggerNotification` runs.
- [x] 4.2 Add `accruedDelta` to component state in `App.tsx` (currently computed and discarded inside the existing effect) and pass it, plus the existing `pendingDenAchievements`, down to `DoorstepScreen` as props — per `design.md` Decision 7, neither is safe to re-derive inside `DoorstepScreen` itself.
- [x] 4.3 Unit/integration test covering the sequencing fix itself (per `design.md`'s flagged risk that this is exactly the kind of bug that only shows up as timing-dependent on-device): given a still-unsurfaced overflow, resolving the Doorstep's overflow line first results in `checkAndScheduleEarnedTriggerNotification` finding `overflowSurfaced` already `true` and not scheduling a notification.

## 5. Wiring `DoorstepScreen` into `App.tsx`

- [x] 5.1 Add `showDoorstep` boolean state (default `true`) to `App.tsx`, inserted as the first screen check after the existing `needsDogName` gate and before the `celebration`/`showHistory`/etc. chain.
- [x] 5.2 Wire `DoorstepScreen`'s props per `design.md` Decision 7: repositories (`denEconomyRepository`, `homeRangeRepository`, `walkRepository`, `notificationRepository`), already-computed values (`dogName`, `treats`, `level`, `accruedDelta`, `pendingDenAchievements`), and callbacks (`onAcknowledgePendingAchievements`, `onStartWalk` → dismiss + call the existing `startWalk`, `onOpenMap` → dismiss only, `onOpenDen` → dismiss + `setShowDen(true)`).
- [x] 5.3 Dog row: name, Level, `currentTitleForLevel` (task 1.1), and the existing `buddyTreatsPerWalk` "brings home N treats a walk" line (reuse `DenScreen.tsx`'s existing phrasing/function, don't re-derive).
- [x] 5.4 Den tease footer: reuse `getUpgradeTease` and `storageCap` (the same functions `DenScreen.tsx` already calls) for the `"🦴 {treats} / {cap} treats · {Building} Lv {level} → {cost}"` line; tapping it triggers `onOpenDen`.
- [x] 5.5 Collect-tap animation (RN `Animated`): the treats line's fly/bounce into the footer counter, visual-only per task 0.2's resolution — no audio dependency added. Leave a clearly-marked TODO comment pointing at this task for the sound fast-follow, not a silent omission.
- [x] 5.6 Three session-state art/copy: dog awake + rotating greeting (`'first-open'`/`'long-absence'` flavors) vs. dog dozing (`'same-day-reopen'`) — game-master-authored copy for the greeting variants, not invented here (matches this project's precedent of not inventing placeholder copy for a game-master-owned line).

## 6. Spec deltas

- [ ] 6.1 This change's `specs/home-dashboard/spec.md` (new capability), `specs/den-economy/spec.md`, `specs/personal-stats/spec.md`, and `specs/visual-design/spec.md` deltas are already drafted (architect planning pass) — apply via `/opsx:apply` once sections 1-5 are implemented and verified, same flow as every prior change in this project.
- [x] 6.2 Update `README.md`'s folder-map and architecture summary to mention The Doorstep, mirroring how prior changes updated the same sections.

## 7. Automated coverage

- [x] 7.1 `npx tsc --noEmit` clean.
- [x] 7.2 Full path test: a synthetic Den/Home-Range/notification state produces the expected Doorstep session state and away-strip lines end-to-end (not just each pure unit in isolation) — matching `somewhere-wild`'s own task 8.2 precedent of testing the full path, not only the formula.

## 8. Manual on-device verification

**Needs a real device/emulator — left for the user to run, same pattern as every prior change in this project.**

- [ ] 8.1 Confirm the Doorstep appears once at cold start, never reappears mid-session after dismissing it via any of the three exits (Start Walk, portrait tap, Den footer tap).
- [ ] 8.2 Confirm the territory portrait renders correctly for a real, non-trivial Home Range, is tappable to the map, and the empty-Range fallback (dog + invitation copy) shows correctly on a fresh install with no Range yet.
- [ ] 8.3 Force each of the three session states (fresh install same-day re-open by relaunching twice today; a long-absence state by advancing the device clock or backdating `lastTickAt` in a debug build) and confirm the correct art/copy/strip-cap for each, and that no days-count or freshness number is visible anywhere.
- [ ] 8.4 Force a Den-economy overflow, open the app, and confirm the Doorstep's storage-at-cap line appears and the earned-trigger push notification does NOT also fire for that same overflow (Decision 6's sequencing fix) — then confirm normal overflow-notification delivery still works correctly on a later, freshly-cleared-then-recapped overflow.
- [ ] 8.5 Force an idle-accrual achievement unlock (advance the clock enough for passive accrual to cross a treats threshold) and confirm it surfaces once on the Doorstep and is not shown again when the Den screen is subsequently opened.
- [ ] 8.6 Confirm the "Somewhere Wild" line, when it appears on the Doorstep, matches the exact same fact/copy the map screen's own card would show for the same underlying state.
- [ ] 8.7 Confirm the portrait's data-URL render time/size is acceptable on a Home Range with a large, long-lived synthetic cell count (design.md's flagged, unmeasured risk) — now with tile-load latency in the mix per the OSM-basemap decision, on both a fast connection and a throttled/offline one (confirm the `PORTRAIT_FAILED` fallback triggers correctly when offline).

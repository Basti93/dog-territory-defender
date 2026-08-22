## 0. Sequencing

- [x] 0.1 Read `design.md` in full, especially Decision 1 (the draw-on-animation feasibility call and why the render-to-image path is not reused for it) and Decision 2 (the two distinct rendering states) — this task list assumes both as settled, not open questions.
- [x] 0.2 Confirm the four Open Questions in `proposal.md` with the founder/game-master, or explicitly proceed with their recommended defaults — either way, note which happened in this section before starting section 5's copy-bearing work. **Resolved 2026-08-22: all four accepted at their recommended defaults** (New Ground: color-only, no text; manual-log-no-route metadata row: date+treats only; "Too short" → "Short stroll"; no end-of-trail marker) — see `proposal.md`'s "Open Questions — RESOLVED" section.

## 1. Data model — new optional `Walk` fields, lowest risk, buildable first

- [x] 1.1 In `src/types.ts`: add `newGroundCellIds?: string[]`, `treatsEarned?: number`, `refreshedRouteWalkId?: string` to `Walk`, per `design.md` Decisions 4/5/6. All optional; no change to any existing field or to `StoredWalk`.
- [x] 1.2 In `App.tsx`'s `finishWalk`: set `newGroundCellIds: Array.from(newGround)` on `finishedWalk` before its existing `walkRepository.saveWalk(finishedWalk)` call (no new computation — `newGround` is already computed at that point). After `awardWalkRewards` resolves, add a second `walkRepository.saveWalk({ ...finishedWalk, treatsEarned: result.celebration.treatsEarned })` call inside the existing `try` block, per `design.md` Decision 5.
- [x] 1.3 In `App.tsx`'s `logMissedWalk`: when `refreshApplied` becomes `true`, set `refreshedRouteWalkId: refreshRouteWalkId` on the record that gets saved. Combine with the `treatsEarned` patch from `awardWalkRewards`'s result into one second `saveWalk` call (both resolve at nearby points in the same function — no need for two separate patch writes), per `design.md` Decision 6.
- [x] 1.4 Log (via the existing `log()` utility, matching every other storage call site's convention) if either second `saveWalk` patch throws — per `design.md`'s flagged risk, this must never surface as a user-visible error, only a debug-log entry.
- [x] 1.5 Contract test additions in `src/storage/__tests__/walkRepository.contract.test.ts`: a walk saved, then re-saved with the new fields added, round-trips all three correctly; a walk saved without them round-trips with all three `undefined`, not throwing.

## 2. Pure logic — trail splitting, time-of-day phrase, geocoding export

- [x] 2.1 In `src/utils/grid.ts`: add `splitTrailByNewGround(locations, newGroundCellIds): { color: 'base' | 'new-ground'; points: Location[] }[]` per `design.md` Decision 4 — one pass over `locations`, mapping each point to its cell via the existing `cellForLocation`, emitting contiguous same-color runs. A missing/empty `newGroundCellIds` produces one all-`'base'` run.
- [x] 2.2 Unit tests in `src/utils/__tests__/grid.test.ts`: an all-base trail (empty/undefined `newGroundCellIds`); a trail with New Ground only at the start, only at the end, and interleaved in the middle; a single-point trail.
- [x] 2.3 In `src/utils/manualWalkLog.ts`: add a time-of-day phrase function (`dayAndTimeOfDayPhrase(timestamp): string`, e.g. `"Tuesday morning"`) per `design.md` Decision 7 — hour-bucket boundaries are the implementer's polish call, not a logged threshold.
- [x] 2.4 Unit tests in `src/utils/__tests__/manualWalkLog.test.ts` covering each bucket boundary and the day-of-week formatting.
- [x] 2.5 In `src/utils/streetLookup.ts`: export `resolveLabelForPoint` (or add a one-line named re-export, implementer's naming call) per `design.md` Decision 7 — no change to its existing logic, caching, or error handling.
- [x] 2.6 Confirm `src/utils/__tests__/streetLookup.test.ts` still passes unmodified (this is a visibility change only, not a behavior change).

## 3. Rendering — muted Home Range variant and the live, animated trail WebView

- [x] 3.1 In `src/web/homeRangeRendererScript.ts`: add `renderHomeRangeMuted(map, payload, previousLayerGroup)` per `design.md` Decisions 2/3 — reuses the existing blur/marching-squares pipeline; flat single-tone fill (`#8A9A8A`, the newly-formalized Muted grey token) and outline, no gradient, no wild-ground contour pass, no marker, reduced opacity.
- [x] 3.2 Extend `src/web/__tests__/homeRangeRendererScript.test.ts` with coverage for `renderHomeRangeMuted` (same synthetic-payload pattern as the existing `renderHomeRangeToMap`/`renderHomeRangePortrait` tests) — confirms it draws exactly one fill/outline pass and does not draw a wild-ground contour or any marker.
- [x] 3.3 New `src/web/walkPortraitHTML.ts`: a dedicated, non-interactive (per `design.md` Decision 1's explicit Leaflet-options list), live (never-captured) WebView modeled on `mapHTML.ts`'s existing tile-layer/trail/message-listener setup. Listens for `RENDER_WALK { walkLatLngs, newGroundRuns, raster }`: renders `renderHomeRangeMuted`'s output as the background (fit to `raster`'s bounds via `map.fitBounds`, mirroring `mapHTML.ts`'s existing `SHOW_HOME_RANGE` fit-bounds logic), auto-fits the map to `walkLatLngs`'s own bounds, places a paw-icon `L.divIcon` marker at the trail's start point (mirrors `current-position`/`wild-spot-marker`'s existing divIcon convention), and runs the two-phase reveal animation from `design.md` Decision 1 (Phase A: chronological base-color reveal via a growing `L.polyline` coordinate array; Phase B: re-color the New Ground runs to the bright-green token) once per `RENDER_WALK` message.
- [x] 3.4 New `src/components/WalkPortraitScreen.tsx`: resolves which of Decision 2's two states applies (walk-trail vs. no-linked-route fallback — see section 4 below for the resolution logic), then either hosts `walkPortraitHTML.ts` in a visible (not hidden, per Decision 1 — this WebView **is** the screen, unlike `TerritoryPortrait`'s hidden capture host) `WebView`, posting `RENDER_WALK` once it loads, or renders `<TerritoryPortrait homeRangeRepository={...} onPress={() => {}} />` directly for the fallback state (Decision 2 — no new rendering code for this state). Renders the metadata row (section 5) below either.
- [x] 3.5 Small fixed padding margin around the walk's own trail bounds (mirrors `portraitHTML.ts`'s existing `CELL_PADDING` precedent) so the trail doesn't crop flush to the screen edge — implementer's polish number, not a logged threshold.

## 4. Resolving which state a walk is in

- [x] 4.1 In `WalkPortraitScreen.tsx`: given a `StoredWalk`, resolve to one of three states per `design.md` Decision 2 — (a) `locations.length > 0` → walk-trail state using its own trail; (b) `locations.length === 0 && refreshedRouteWalkId` → fetch that route via `walkRepository.getWalk(refreshedRouteWalkId)`; if it still exists, walk-trail state using the **linked route's** trail (per `design.md` Decision 6, the manual log's own record is otherwise untouched); if `getWalk` resolves `null` (deleted since), fall through to (c); (c) no trail available at all → the no-linked-route fallback state (Decision 2).
- [x] 4.2 Unit test (pure logic extracted from the above, matching this project's precedent of testing state-resolution logic without a React renderer, e.g. `SomewhereWildCard.test.ts`'s pattern): all three states resolve correctly, including the dangling-reference case (`refreshedRouteWalkId` set but `getWalk` returns `null`) falling through to the fallback state, not an error.

## 5. Metadata row and copy

- [x] 5.1 Metadata row per `design.md` Decision 5 and the `walk-history` spec delta's "Walk Portrait Metadata Row" requirement: date (via `dayAndTimeOfDayPhrase`) plus, where a location resolves (section 2.5's exported `resolveLabelForPoint` on the relevant trail's start point), a place-anchored title line (e.g. "Tuesday morning, around Hirschgarten"); distance (`cumulativeDistance`, already exported) and duration (last-minus-first `Location.timestamp`) shown only when a real trail exists (states (a)/(b) from section 4); treats earned (`walk.treatsEarned`, omitted entirely if absent rather than showing `0`); date + treats only for the no-trail fallback state (c).
- [x] 5.2 No-trail fallback state copy (`design.md` Decision 2 / `proposal.md`'s recommended defaults, pending 0.2's confirmation): "No trail recorded for this one. It still counts — and here's everywhere Buddy knows." — game-master-authored line, not invented here if 0.2 surfaces a different final wording. Implemented verbatim (with `dogDisplayName(dogName)` substituted for "Buddy", matching this codebase's existing templating convention).
- [x] 5.3 `WalkHistoryScreen.tsx`: change `'Too short'` to `'Short stroll'` (or 0.2's confirmed alternative) per the `walk-history` spec delta's "Each entry identifies the walk" requirement.
- [x] 5.4 `WalkHistoryScreen.tsx`: wrap each row in a `TouchableOpacity` calling a new `onSelectWalk(item)` prop; the existing Delete `TouchableOpacity` stays a separate, nested tap target (verify `hitSlop`/touch-target sizing doesn't create an accidental double-fire — the Delete button's existing `onPress` must still fire on its own tap without also triggering the row's `onSelectWalk`). The double-fire check itself needs a real device/simulator (React Native's touch responder negotiation isn't exercisable under Jest) — left to section 9's manual pass (task 9.3).

## 6. Wiring into `App.tsx`

- [x] 6.1 Add `viewingWalk: StoredWalk | null` state to `App.tsx` per `design.md` Decision 8 (mirrors the existing `celebration` nullable-object pattern, not a new boolean).
- [x] 6.2 Pass `homeRangeRepository` and a new `onSelectWalk={(walk) => setViewingWalk(walk)}` prop to the existing `<WalkHistoryScreen>` render call.
- [x] 6.3 Render `<WalkPortraitScreen>` when `viewingWalk` is non-null (above/instead of the `showHistory` branch, while `showHistory` itself remains `true` underneath so dismissing returns to the list, not the map), wired with `walkRepository`, `homeRangeRepository`, the `viewingWalk` itself, and an `onClose={() => setViewingWalk(null)}`.

## 7. Spec deltas

- [ ] 7.1 This change's `specs/walk-history/spec.md`, `specs/walk-storage/spec.md`, and `specs/visual-design/spec.md` deltas are already drafted (architect planning pass) — apply via `/opsx:apply` once sections 1-6 are implemented and verified, same flow as every prior change in this project. **Left unchecked/unrun per this task's own explicit instruction: `/opsx:apply` is not run by the implementing agent.**
- [x] 7.2 Update `README.md`'s folder-map and architecture summary to mention Walk Portrait, mirroring how `home-dashboard` updated the same sections.

## 8. Automated coverage

- [x] 8.1 `npx tsc --noEmit` clean.
- [x] 8.2 Full path test: a synthetic tracked walk (with New Ground cells and `treatsEarned`), a manual log with a linked route, a manual log with no linked route, and a manual log whose linked route has been deleted, each produce the correct one of Decision 2's states and the correct metadata row contents end-to-end — matching `home-dashboard`'s own task 7.2 / `somewhere-wild`'s task 8.2 precedent of testing the full path, not only each unit in isolation.

## 9. Manual on-device verification

**Needs a real device/emulator — left for the user to run, same pattern as every prior change in this project.**

- [ ] 9.1 Confirm the trail draw-on animation is visually smooth (no stutter, no dropped frames) at ~1.2s on a real device, for both a short (~10-point) and a long (~500+ point) walk.
- [ ] 9.2 Confirm New Ground segments visibly finish drawing last (Decision 1's two-phase reveal) and are clearly distinguishable in color from the rest of the trail at a glance.
- [ ] 9.3 Confirm tapping any history row (tracked, manual-log-with-route, manual-log-without-route, non-qualifying) opens the correct one of the three states, and that Delete still works without also opening the Portrait.
- [ ] 9.4 Confirm the no-linked-route fallback state renders `TerritoryPortrait` correctly (including its own already-verified offline/empty-Range fallbacks) and never looks like an error or a disabled row.
- [ ] 9.5 Delete a manual log's linked route from history, then reopen that manual log's Portrait — confirm it falls back to the no-linked-route state, not a crash or broken image.
- [ ] 9.6 Confirm the muted Home Range background is visually distinct from — and doesn't compete with — the walk's own trail, and that no wildness-gradient color appears anywhere in that background layer.
- [ ] 9.7 Confirm the metadata row's place-anchored title line resolves correctly on a real device (cross-check against `somewhere-wild`'s own flagged device-fragmentation risk for reverse geocoding) and that the no-linked-route state correctly omits it rather than showing a broken label.
- [ ] 9.8 Confirm no pace/speed/ranking/comparison/share affordance appears anywhere on this screen, matching the brief's explicit "never build" list.

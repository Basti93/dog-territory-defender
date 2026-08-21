## 0. Sequencing and scope

- [ ] 0.1 Read `design.md` in full, including the "Technical Split Addendum" appended at the end — it resolves three things this task list assumes as settled: the two-way split (`home-range` vs. sibling `home-range-rewards`), the retirement of `canCloseWalk`/loop-closure in favor of the 25-cell qualifying floor, and the one-time migration approach. Do not re-derive these from `proposal.md` alone.
- [ ] 0.2 **Out of scope here, ships in `home-range-rewards` instead:** `bloomMultiplier`/Fresh Ground treats bonus, manual-log route refresh, New Ground/Fresh Ground celebration copy, "Buddy knows N streets" display. This change ends with a correct, rendered, persisted Range/Bloom that pays exactly what today's polygon pays (i.e. `awardWalkTreats` untouched) and correct XP.
- [ ] 0.3 `gps-accuracy-aware-closure` (in-flight) touches `canCloseWalk` in `geometry.ts`, which section 6 below deletes. No action needed on this change's side — let it land/archive on its own schedule; section 6.1 deletes the function regardless of whether that change's own delta has been applied yet, since deletion doesn't conflict with an already-merged edit to the same function.

## 1. Grid module — pure functions, no I/O

- [ ] 1.1 New `src/utils/grid.ts`: cell addressing (`cellForLocation(lat, lon) -> {ix, iy}` per `design.md` Decision 1's `D_LAT`/`dLon(iy)` formulas), `wildness(lastRefreshedMs, nowMs)` per Decision 2's curve (τ=5, ceiling at 18 days), and the two anti-exploit segment guards (`MAX_SEGMENT_M = 60`, `MAX_SEGMENT_SPEED_MS = 4.5`).
- [ ] 1.2 `paintedCells(locations: Location[]): Set<CellId>` — resamples the path every 5m between fixes (skipping any segment that fails the guards in 1.1) and returns every cell whose centre is within `PAINT_RADIUS_M = 25m` of the resampled path. This is the function both a live walk (section 4) and the migration backfill (section 3) call — one implementation, not two.
- [ ] 1.3 `newGroundCells(painted: Set<CellId>, range: Set<CellId>): Set<CellId>` — set difference with 8-neighbour dilation per Decision 5, plus `streetsKnown(rangeCellCount: number): number = max(1, floor(rangeCellCount / 11))`.
- [ ] 1.4 Unit tests (`grid.test.ts`) against the worked values in `design.md`: a 1.5km loop paints ~165 cells; the false-positive jitter sweep (Decision 5's table) stays under the 12-cell New Ground threshold at σ up to 20m; the true-positive detour sweep fires at 220m and not at 200m; `wildness(0)===0`, `wildness(18 days)===1`, `wildness(365 days)===wildness(30 days)` bit-identical. Replay `testing/munich-route.gpx`/`munich-route2.gpx`/`munich-route-3.gpx` (parse GPX to `Location[]`, a small test-only helper) through `paintedCells` at least once each as a real-data sanity check, not just the synthetic loop.

## 2. Cell storage

- [ ] 2.1 New `src/storage/HomeRangeRepository.ts` (interface, mirroring `WalkRepository`'s shape) with `getCells(): Promise<Cell[]>`, `paintCells(cells: {ix, iy, refreshedAt: number, tracked: boolean}[]): Promise<void>` (batch upsert — creates a cell if new, otherwise bumps `lastRefreshed`/`lastTracked`/`visits` per Decision 1's per-cell record), and a bounded read for rendering (`getCellsInBounds(minIx, maxIx, minIy, maxIy): Promise<Cell[]>` — Decision 6's raster payload needs a viewport-scoped query, not the whole table, per this file's own Risks section on unbounded Range growth).
- [ ] 2.2 `sqliteHomeRangeRepository.ts`: one `cells` table, `(ix, iy)` composite primary key, columns `lastRefreshed INTEGER, lastTracked INTEGER, visits INTEGER`. `paintCells` runs as a single transaction (per Decision 1's "no DB write per fix" cost budget — this is the batch write at walk close, never per-GPS-fix).
- [ ] 2.3 `inMemoryHomeRangeRepository.ts` for tests, matching this project's existing `inMemory*Repository.ts` pattern (see `inMemoryWalkRepository.ts`).
- [ ] 2.4 Contract test (`homeRangeRepository.contract.test.ts`) run against both implementations, matching `walkRepository.contract.test.ts`'s existing pattern: paint idempotency (painting the same cell twice bumps `visits` but the cell count doesn't double), `lastTracked` is only ever set by a `tracked: true` paint call (never by a refresh — this is the field `home-range-rewards` depends on later for the manual-log/defense-exploit boundary `design.md` calls out).

## 2.5 Walk history no longer deletes ground from the map

- [ ] 2.5.1 `WalkHistoryScreen.tsx`'s delete confirmation ("Delete walk? This cannot be undone.") currently implies the walk's territory disappears too (true today, since the polygon lives only inside the `Walk` record). Once `HomeRangeRepository` is a separate store (section 2) that's no longer true — deleting a walk removes only its own record, per `walk-history`'s modified "Deleting a walk never shrinks the Home Range" requirement. Update the confirmation copy so it doesn't imply otherwise (exact wording is a `game-master` copy question, not settled here; the functional requirement — don't touch the cell table on delete — is not optional).

## 3. Migration — replay existing walks into the grid once

- [ ] 3.1 One-time backfill: on first app load after this change ships, read every stored `Walk` with a non-empty `locations` array (tracked, open or closed — manual logs have `locations: []` and are skipped structurally, not by a special case), call `paintedCells` on each, and `paintCells` the result with `tracked: true` and `refreshedAt: walk.startTime` (not `Date.now()` — an old walk must seed a wild patch, not a fresh one). Guard with a one-time flag in the same singleton-row pattern `dogName`/`xp` already use in `DenEconomyState`, so this never re-runs.
- [ ] 3.2 Test: two walks with real trails plus one manual log (empty locations) backfill correctly — the manual log contributes zero cells, the two tracked walks' cells land with `lastRefreshed` equal to each walk's own `startTime`, and running the backfill twice (simulating a second app load) doesn't double-count `visits`.

## 4. Wire painting into a live walk close

- [ ] 4.1 Retire the three-button model per `design.md`'s Addendum: `App.tsx`'s `stopWalk`/`canClose`/`canCloseWalk` gate and the separate `endWalk` become a single "Finish Walk" action. It always saves the walk (trail preserved, per the existing `walk-lifecycle` "End Walk preserves the trail" requirement, now unconditional) and always calls `paintedCells`/`paintCells(..., tracked: true)` on the recorded trail. `Cancel` is unchanged.
- [ ] 4.2 Reward eligibility (the call into `awardWalkRewards`) gates on `paintedCells(...).size >= 25` instead of the deleted `canCloseWalk`. Below the floor, the walk still saves and still paints (section 4.1), just isn't rewarded — mirrors today's "closes but doesn't qualify" non-outcome, not a new failure mode.
- [ ] 4.3 Delete `canCloseWalk`, `MIN_CLOSURE_RADIUS_M`, `CLOSURE_ACCURACY_MARGIN_M`, `locationsToPolygon`, `calculatePolygonArea` from `geometry.ts`; delete `TerritoryPolygon` from `types.ts` and `territory?: TerritoryPolygon` from `Walk`. Update every remaining reference (`walkRewards.ts`'s `hasTerritory`/`areaM2` on `WalkRewardsCelebration`, `App.tsx`'s `stopWalk`, `CelebrationScreen.tsx`'s territory-claimed copy branch — these become "was this walk reward-eligible" and "cells painted," not "did it form a polygon").
- [ ] 4.4 Update `geometry.test.ts` (remove the deleted functions' coverage) and `walkRewards.test.ts`/`App`-level tests for the new eligibility gate.

## 5. Rendering — the WebView/Leaflet bridge rewrite

**This is the highest-risk section in the whole change — `design.md`'s own Risks section calls it out as living "entirely in the renderer," not optional polish. Do 5.1 as a standalone spike before touching `MapView.tsx`/`App.tsx` at all.**

- [ ] 5.1 **Spike, gated go/no-go:** a standalone dev-only HTML harness (same pattern as `mapHTML.ts`, but run directly in a browser or a throwaway RN screen — not wired into the live app) that takes a raster payload built from replaying `testing/munich-route2.gpx` (the biggest of the three test GPX files) through `paintedCells`, and renders: (a) the Range outline via Gaussian blur (σ=1 cell) + marching-squares 0.5-contour, (b) the Bloom fill via the same blurred raster, wildness→hue/saturation, interpolated in Lab (not sRGB — `design.md` measured a naive sRGB lerp costs ~26% of the perceptible one-day step), constant `fillAlpha = 0.28`, (c) `visits`→alpha ghost-trail density. Confirm on an actual device/simulator, not just a desktop browser, that a full re-render (blur + contour + upsample) on pan/zoom stays smooth enough to not read as janky — this number isn't in `design.md` because it was never measured on a WebView, only in Node. **If this doesn't hold up, stop and report back before continuing — this is the blocking risk the parent review flagged, and section 5.2 onward assumes it's resolved.**
- [ ] 5.2 Replace `SHOW_ALL_TERRITORIES`/`SHOW_TERRITORY` in `mapHTML.ts` with a single `SHOW_HOME_RANGE` message per Decision 6's bridge payload shape (`{ origin: [ix0, iy0], w, h, wild: base64(Uint8Array), visits: base64(Uint8Array) }`), viewport-scoped (2.5km × 2.5km window, downsample to 2 cells/pixel at wide zooms per Decision 6). `MapView.tsx` computes the requested window from the current map bounds and calls `HomeRangeRepository.getCellsInBounds` (section 2.1) to build it — replacing its current `walkRepository.getWalks()` + `territories.map(...)` flow entirely.
- [ ] 5.3 Live-walk painting preview: while a walk is in progress, paint cells incrementally into the renderer as fixes arrive (not the DB — section 2.2's batch write still only happens at Finish Walk) so the player sees the Bloom extend in real time, matching the existing live-trail behavior (`UPDATE_TRAIL`). Reuses `paintedCells` (section 1.2) called incrementally on the growing `locations` array — the "incremental per-fix cost is ~1/750th of a full repaint" budget from `design.md` Decision 1 is what makes this affordable; don't recompute a full repaint per fix if it's cheaper to diff.
- [ ] 5.4 Remove the now-dead `SHOW_ALL_TERRITORIES`/`SHOW_TERRITORY` handlers, `allTerritoriesLayer`, `territoryPolygon` from `mapHTML.ts`, and `territoryRefreshKey`'s polygon-refresh plumbing from `App.tsx`/`MapView.tsx` wherever it's no longer needed (the equivalent "refresh after returning from history" trigger for the raster is still needed — don't delete the concept, just its polygon-shaped implementation).

## 6. New Ground detection wired to the live walk

- [ ] 6.1 At Finish Walk, snapshot the Range (as a hash set, per Decision 5) before painting this walk's cells, compute `newGroundCells` (section 1.3) against it, and pass a boolean/count through `WalkRewardsCelebration` (or an adjacent result shape) even though `home-range-rewards` is what actually surfaces a celebration beat for it — the detection and the count need to exist and be tested here, since they're pure functions of data this change already owns; only the UI/copy is deferred.
- [ ] 6.2 `streetsKnown` (section 1.3) computed from the post-walk Range size, exposed from wherever `home-range-rewards`' Den-screen stat will read it — again, compute it here, display it there.

## 7. XP area-term replacement

- [ ] 7.1 `src/economy/formulas.ts`: `xpAwardForWalk` takes `cellsPainted: number` instead of `areaM2: number`, computing `5 · min(cellsPainted · 400, 20000) / 1000` per `design.md`'s "Consequence that must be resolved" section (a cell is 400m², so `cellsPainted · 400` is the walk's real painted footprint). Update `BALANCE.xp.areaCapM2`'s doc comment — the cap now binds at 50 painted cells (~450m walked), tighter than before; confirm this against the `testing/munich-route*.gpx` replays from section 1.4 rather than shipping on the formula alone.
- [ ] 7.2 Update every call site: `denEconomy.ts`'s `awardWalkXp`, `walkRewards.ts`'s `awardWalkRewards`/`trailingAverageXp` (both currently pass `w.territory?.area ?? 0` — replace with a painted-cell count derived the same way section 4.2 does), `App.tsx`'s `stopWalk`.
- [ ] 7.3 Update `formulas.test.ts`/`denEconomy.test.ts`/`walkRewards.test.ts` coverage that references `areaM2`/polygon area.

## 8. Spec deltas

- [ ] 8.1 Apply this change's `specs/` deltas (`walk-lifecycle`, `game-phases`, `den-economy`, `visual-design`) via `/opsx:apply` once sections 1-7 are implemented and verified — do not hand-edit `openspec/specs/` directly.
- [ ] 8.2 Update `README.md`'s territory/closure description (currently references the polygon and `canCloseWalk`'s ≥10-points/20m rule) to describe the Range/Bloom model and the new 25-cell reward-eligibility floor instead.

## 9. Automated coverage

- [ ] 9.1 Cover the deleted-function removal doesn't leave dead imports (`tsc`/build should already catch this, but check `geometry.ts`'s remaining exports — `getDistance`/`cumulativeDistance` stay, they're unrelated to the polygon).
- [ ] 9.2 Do not attempt to automate the rendering visual-quality check (blur smoothness, contour roundness, color perceptibility) — covered by manual on-device verification below, matching this project's existing precedent for anything that's fundamentally a "does this look right" question.

## 10. Manual on-device verification

**Needs a real device/emulator — left for the user to run, same pattern as every prior change in this project.**

- [ ] 10.1 Fresh install: walk a short loop (or replay `testing/munich-route.gpx`), confirm the Range renders as a soft rounded outline (not hard polygon corners) and the Bloom fill reads as a plausible color, not a blocky grid.
- [ ] 10.2 Walk the same route on two different (simulated) days; confirm the Bloom visibly shifts color between the two closes.
- [ ] 10.3 Walk a route that doesn't return near its start ("Finish Walk" with no loop); confirm it still paints the Range and (if ≥25 cells) still earns treats/XP — this is the behavior change section 4 makes; confirm it doesn't regress the existing "walk too short" non-reward case below 25 cells.
- [ ] 10.4 On an existing dev install with real prior walk history, confirm the one-time migration (section 3) seeds a sensible-looking Range on first load after this update, without a duplicate run on a second app open.
- [ ] 10.5 Confirm map performance (pan/zoom, live-walk painting) stays smooth on the actual test device used for section 5.1's spike — re-check this explicitly on whatever device that spike used, since a desktop-browser spike result doesn't guarantee an on-device result.

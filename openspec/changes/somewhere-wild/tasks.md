## 0. Sequencing

- [x] 0.1 Both upstream changes have archived: `home-range` (`openspec/changes/archive/2026-08-21-home-range`) and `home-range-rewards` (`openspec/changes/archive/2026-08-21-home-range-rewards`). **Verified against the archived tasks.md, not assumed:** `home-range`'s task 5.1 (the rendering spike) is checked — "resolved: go," confirmed on a real device (soft edges, plausible fill). Its section 10 manual on-device pass is only partially checked: 10.1 (fresh-install render quality) is confirmed on-device; 10.2–10.5 (day-to-day Bloom colour shift, no-loop-walk reward path, migration backfill, pan/zoom performance) remain unchecked. This change's stated need — "the renderer confirmed working on a real device first, not just unit-tested" — is satisfied by 5.1 + 10.1 specifically; 10.2–10.5 test unrelated concerns (colour-over-time, reward gating, migration, perf) that this change's second contour pass doesn't depend on, so they are not a blocker here, but flag to the user that they remain open on `home-range`'s own ledger. `home-range-rewards` imports `BALANCE.freshGround.k` and `BALANCE.freshGround.displayThresholdMultiplier` from `src/economy/balanceConfig.ts` (corrected from this task's original guess of `BALANCE.homeRange.bloomK`/`FRESH_GROUND_UI_THRESHOLD` — see `design.md` Decision 2) — both constants exist in code now. Do not start section 3 or later without both.
- [x] 0.2 Read `design.md` in full, especially Decisions 2 and 3 — this task list assumes the two fixes to the original game-master algorithm (derived threshold, bounded label-fallback scan, marker/card fail together) as settled, not open questions.

## 1. Second contour — pure rendering, lowest risk, buildable first

- [x] 1.1 In `src/web/homeRangeRendererScript.ts`: add `HR_WILD_CONTOUR_THRESHOLD`, computed from `BALANCE.freshGround.k`/`BALANCE.freshGround.displayThresholdMultiplier` (both in `src/economy/balanceConfig.ts`) per `design.md` Decision 2's formula (rounded up to the nearest 0.05) — passed in as a constant baked at build time (mirrors how `HR_CELL_M` etc. already mirror `utils/grid.ts`'s constants into the vanilla-JS string), not recomputed inside the WebView from raw `BALANCE` data it has no access to.
- [x] 1.2 Second `hrMarchingSquaresSegments(wildBlurred, w, h, HR_WILD_CONTOUR_THRESHOLD)` pass in `renderHomeRangeToMap`, stroked distinctly from the existing Range outline: warm accent `#F39C12`, thinner weight, dashed (`dashArray`). Added to the same `layerGroup` so it's added/removed together with the rest of the Home Range render.
- [x] 1.3 Extend `src/web/__tests__/homeRangeRendererScript.test.ts` with coverage for the second contour pass (same style of pure-math test the existing Range-outline contour already has — a synthetic wild-cell blob above/below the threshold produces/doesn't produce segments).

## 2. Wild cluster selection — pure functions, RN side

- [x] 2.1 `src/utils/grid.ts`: add `export` to `CELLS_PER_STREET` (currently module-private) so the new cluster module can import it directly instead of re-declaring the same number.
- [x] 2.2 New `src/utils/wildSpot.ts`: connected-components over Range cells at or above the derived wild threshold, 8-neighbour adjacency, dropping components smaller than `CELLS_PER_STREET`, scored by summed `visits`, tie-broken per `design.md` Decision 3 (cell count, then lowest `(ix, iy)`; anchor tie-broken the same way among cells sharing the winning component's highest `visits`). Pure function of `Cell[]` + `nowMs`, no I/O — matches `grid.ts`'s existing pattern.
- [x] 2.3 Unit tests: a synthetic Range with one clear winning cluster picks it; a tie on `visits` sum resolves deterministically; a component just under `CELLS_PER_STREET` is dropped; an empty/all-fresh Range returns no winner (the "neither" card state's data-level precondition).

## 3. Label resolution

- [x] 3.1 New `src/utils/streetLookup.ts`: wraps `expo-location.reverseGeocodeAsync`. Primary path: reverse-geocode the winning cluster's anchor cell centre (or, for the New Ground state, a real GPS fix from the discovering walk — no anchor-cell approximation needed there). Fallback path (only for the wild-cluster state, per `design.md` Decision 3 Fix 1): bounded scan of `WalkRepository.getWalks()` — bounding-box pre-filter, most recent 20 matches, `paintedCells()` intersection check — reverse-geocoding a real location from the first walk found to overlap the cluster.
- [x] 3.2 If neither path resolves a label, return `null` — callers (section 5) must treat `null` as "render nothing this cycle," never a placeholder string. This is Fix 2 from `design.md` Decision 3: no orphaned marker when the label fails.
- [x] 3.3 In-memory cache keyed by anchor cell id (wild-cluster state) / event `occurredAt` (New Ground state), so a resolved label isn't re-fetched every foreground check within the same app session. Persisted caching (surviving a cold start) is optional polish, not required for correctness.
- [x] 3.4 Unit tests against a fake/mock geocoder (no real network call in tests): primary-path success short-circuits the fallback scan; primary-path failure falls through to the bounded scan and finds a match; both failing returns `null`; the bounding-box pre-filter actually narrows the candidate set before the more expensive `paintedCells()` call (a performance-intent test, not just a correctness one).

## 4. New Ground event persistence

- [x] 4.1 Extend `HomeRangeRepository` (interface, sqlite impl, in-memory impl) with `getLastNewGroundEvent()`/`recordNewGroundEvent(occurredAt, cellIds)` per `design.md` Decision 4 — a single overwritten row, same singleton-row convention `DenEconomyState` already uses elsewhere in this codebase, not a new sibling repository file and not an event log.
- [x] 4.2 Wire the write into `App.tsx`'s existing Finish Walk call site (`home-range`'s task 6.1, which already computes `newGroundCells(...)` in memory) — when the count clears `NEW_GROUND_MIN_CELLS`, also call `recordNewGroundEvent`. No new computation, only a new persisted write of a value already being computed today.
- [x] 4.3 Contract test (matching `homeRangeRepository.contract.test.ts`'s existing pattern): recording an event overwrites any previous one (never appends/accumulates); reading with no event ever recorded returns `null`.

## 5. The "Somewhere Wild" card

- [x] 5.1 New `src/components/SomewhereWildCard.tsx`: renders one of three states — New Ground (event exists and `now - occurredAt <= 48h`, priority 1), wild cluster (priority 2, only if section 2/3 resolve a winner and a label), or renders nothing (`null`) — never an empty-state placeholder. **Copy finalized by `game-master`, see `design.md`'s "Card copy, finalized by `game-master`" section — 4 rotating wild-cluster variants plus the with/without-place New Ground template, ready to implement verbatim.**
- [x] 5.2 Tap behaviour: pans the map to the relevant spot (New Ground event's location or the wild cluster's anchor) and shows/re-shows the marker from section 6. No dismiss button, per the brief's explicit rejection of one.
- [x] 5.3 Wire into `App.tsx`'s main map screen tree — explicitly not `DenScreen.tsx`, per `home-range-rewards/design.md`'s FLAG 2 resolution (never a Den percentage and a Fresh Ground signal on the same screen) — and not a push notification.
- [x] 5.4 `AppState` foreground listener (new to this codebase — no existing usage to match; keep it a plain `AppState.addEventListener('change', ...)` effect, not a new abstraction layer, consistent with this project's minimal-indirection precedent) triggers re-evaluation of sections 2–4's data, debounced per `design.md` Decision 6 (implementation's choice of interval/dirty-check, not pinned down here).
- [x] 5.5 Visual weight check: one line of text, one small icon, muted, never taller than the map, never animates — confirmed against `visual-design/spec.md`'s existing Success Criteria the same way `home-range-rewards` task 3.4 already does for its own celebration beats.

## 6. Marker bridge message

- [x] 6.1 New `SHOW_WILD_SPOT` postMessage (mirrors `SHOW_HOME_RANGE`'s existing shape/pattern in `mapHTML.ts`/`MapView.tsx`) carrying just a lat/lon (or `null` to clear); WebView side drops/removes an `L.marker` styled with the same warm accent token as the second contour.
- [x] 6.2 `MapView.tsx` sends this whenever section 2/3's winning cluster (or the New Ground event's location) changes, and clears it when neither state applies.

## 7. Spec deltas

- [ ] 7.1 This change's `specs/home-range/spec.md` delta is already drafted (architect planning pass) — apply via `/opsx:apply` once sections 1–6 are implemented and verified, same flow as every prior change in this project.
- [x] 7.2 Update `README.md`'s Home Range paragraph to mention the wild-ground contour, marker, and "Somewhere Wild" card, mirroring how `home-range`/`virtual-dog-companion` updated the same section.

## 8. Automated coverage

- [x] 8.1 `npx tsc --noEmit` clean.
- [x] 8.2 Full path test: a synthetic Range + walk history + mocked geocoder produces the expected card state end-to-end (not just each unit in isolation) — matching `home-range-rewards`' own task 5.1 precedent of testing the full path, not only the pure formula.

## 9. Manual on-device verification

**Needs a real device/emulator — left for the user to run, same pattern as every prior change in this project.**

- [ ] 9.1 Confirm the second (wild-ground) contour is visually distinct from the existing Range outline at a glance, and only appears where a real Fresh Ground bonus would actually apply (cross-check against `home-range-rewards`'s own on-device verification of the multiplier, since this change's whole premise depends on that being true).
- [ ] 9.2 Confirm the marker and the card agree — tapping the card pans to and highlights the same spot the marker is on, every time.
- [ ] 9.3 Confirm the "neither" state (no card, no marker) is silent — no flash of an empty card, no layout jump.
- [ ] 9.4 **Test reverse geocoding on more than one device/Android version**, per `design.md` Decision 5's flagged device-fragmentation risk — confirm the "geocoding fails → nothing renders" fallback behaves correctly (not a broken card) on a device where it's known/suspected not to resolve.
- [ ] 9.5 Confirm the New Ground card state actually appears within 48h of a real walk that discovers new ground, and silently stops appearing after.
- [ ] 9.6 Confirm foreground re-evaluation doesn't cause a noticeable stutter or repeated network calls when rapidly switching apps.

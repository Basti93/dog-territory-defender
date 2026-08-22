## 0. Pre-flight

- [x] 0.1 Confirm `somewhere-wild` and `home-dashboard` are at the code state described in `proposal.md`'s Status section (re-check `tasks.md` in both change dirs for any drift since this session) before starting section 6/8 below, which touch `SomewhereWildCard.tsx`/`streetLookup.ts` and the away-strip respectively. Confirmed by direct inspection this session: `src/components/DoorstepScreen.tsx`, `src/components/TerritoryPortrait.tsx`, `src/web/portraitHTML.ts`, `src/components/SomewhereWildCard.tsx`, `src/utils/streetLookup.ts` all exist and match the described implementation.
- [x] 0.2 Territories-list entry point RESOLVED by user, 2026-08-22: the map screen (see `proposal.md`/`design.md` Decision 8). Title priority order and fallback naming copy remain implementer-level defaults per `design.md` (Everyday → Wild One → Far One tiebreak; "Buddy's New Range" fallback) — low-stakes, adjustable, not escalated further.

## 1. Data model: `Cell.territoryId` and the new `Territory` entity

- [x] 1.1 Extend `HomeRangeRepository`'s `Cell` interface with `territoryId: TerritoryId | null` (design.md Decision 1); extend `PaintCellInput` with an optional `territoryId`, used only on the INSERT path for a brand-new cell row — the UPDATE path for an already-existing cell must never touch this column.
- [x] 1.2 Add `HomeRangeRepository.reassignCellsToTerritory(fromTerritoryId, toTerritoryId): Promise<void>` — one bulk `UPDATE ... SET territoryId = ? WHERE territoryId = ?`, used only during a merge (design.md Decision 3, Step 4). **Deviation:** `fromTerritoryId` also accepts `null`, reused by the migration backfill's initial bulk assignment (see task 3.2's note) — same bulk-by-current-value SQL shape, one method instead of two.
- [x] 1.3 Add `HomeRangeRepository.getCellsByTerritory(territoryId): Promise<Cell[]>` — a scoped read mirroring `getCellsInBounds`'s existing viewport-scoped-read pattern, used by the territories list screen and per-territory portrait rendering.
- [x] 1.4 Add `HomeRangeRepository.getWorldMass(): Promise<{ cellCount: number; visitsSum: number }>` — a single ungrouped aggregate query (`SELECT COUNT(*), SUM(visits) FROM home_range_cells`), with a code comment at the query site pointing at design.md Decision 6's split-invariance requirement and explicitly stating this method must never gain a `territoryId` parameter or a grouped variant.
- [x] 1.5 `sqliteHomeRangeRepository.ts`: add the `territoryId` column (nullable) and a `lastVisitCreditedDayKey` column (see task 7.1) to the `home_range_cells` table via `CREATE TABLE IF NOT EXISTS` plus an `ALTER TABLE ... ADD COLUMN` migration guard for existing installs (mirrors `sqliteDenEconomyRepository.ts`'s existing `addColumnIfMissing` pattern); implement tasks 1.1-1.4 against it.
- [x] 1.6 `inMemoryHomeRangeRepository.ts`: mirror tasks 1.1-1.4 for the in-memory test implementation.
- [x] 1.7 New `src/storage/TerritoryRepository.ts` interface: `getTerritories(): Promise<Territory[]>`, `getTerritory(id): Promise<Territory | null>`, `createTerritory(name, createdAt): Promise<TerritoryId>`, `renameTerritory(id, name): Promise<void>`, `mergeTerritoryStats(survivorId, absorbedId): Promise<void>` (sums `walksHere`/`treatsEarnedHere` into survivor, deletes absorbed row), `incrementTerritoryStats(id, { walksIncrement, treatsIncrement }): Promise<void>`. Never touches the cells table (design.md Decision 1). Also added `generateTerritoryId`/`territoryIdCreatedAt` — `TerritoryId` encodes its `createdAt` in a sortable prefix so the pure clustering algorithm (task 2.2) can resolve "older wins" without needing I/O.
- [x] 1.8 `sqliteTerritoryRepository.ts` + `inMemoryTerritoryRepository.ts`, mirroring every other repository pair in this codebase.
- [x] 1.9 Contract tests for `TerritoryRepository` (`src/storage/__tests__/territoryRepository.contract.test.ts`) and for the new `HomeRangeRepository` methods (extended `homeRangeRepository.contract.test.ts` with territory-membership, `getWorldMass`, and daily-visits-cap coverage). Also added a dedicated `assignTerritoryToCells(cellIds, territoryId)` method (coordinate-scoped, not covered by tasks.md's literal list) — needed for the migration backfill (task 3.2) to assign each pre-existing cell its own individually-resolved territory, which a bulk-by-current-value method can't do when multiple territories are being created in one backfill pass.

## 2. Clustering/merge algorithm (pure functions)

- [x] 2.1 New `src/utils/territoryCluster.ts`: `SPAWN_DISTANCE_M = 400` constant with design.md Decision 2's reasoning in a doc comment; a bounding-box-then-exact-distance nearest-territory lookup (reusing `streetLookup.ts`'s `rectsOverlap` shape).
- [x] 2.2 `resolveTerritoryChanges(rangeBeforeCells, paintedCellIds, now, territoryCreatedAt)` implementing design.md Decision 3's five steps exactly (assimilate-or-orphan, group orphans into new territories via 8-neighbour-OR-within-`SPAWN_DISTANCE_M` connected components reusing `wildSpot.ts`'s flood-fill/tie-break conventions, persist-shape output, bounded merge-pair scan using the exact `newGroundCells` adjacency check, majority-cell attribution) — returns a plan object (cell→territoryId assignments, new territories to create with their founding anchor cell, merge pairs with survivor/loser resolved, the single credited territoryId, whether the player already had a territory before this walk) for the caller to persist; no I/O in this file. **Deviation from the literal 3-arg signature tasks.md listed:** takes an explicit `territoryCreatedAt: ReadonlyMap<TerritoryId, number>` 4th argument (the caller's already-fetched `TerritoryRepository.getTerritories()` result, reduced to id→createdAt) rather than deriving "older wins" from ID-string parsing inside this file — keeps the merge-survivor rule's data dependency explicit and testable without coupling this pure module to `TerritoryRepository`'s ID-encoding scheme. Also added `resolveCelebrationTerritoryBeat(plan, birthNames, territoryNames)` — pure selection logic for which celebration beat(s) to show, given the caller's already-resolved name lookups (task 6's testable core).
- [x] 2.3 Unit tests (`src/utils/__tests__/territoryCluster.test.ts`): first-ever walk births exactly one territory; a walk within 400m of one existing territory assimilates without birthing; a walk farther than 400m births a new one; two territories whose cells become literally adjacent merge with the older surviving; two territories within spawn distance but not touching do NOT merge; a walk with two disconnected new blobs births two territories in one walk; majority-attribution tie-break is deterministic; plus `resolveCelebrationTerritoryBeat` coverage (first-territory silence, second-territory announcement, two-births-on-first-walk edge case, merge beat, no-beat case).

## 3. Migration backfill

- [x] 3.1 Add `territoriesBackfillComplete: boolean` to `DenEconomyState` (default `false`), same guarded-singleton-flag family as `homeRangeBackfillComplete`.
- [x] 3.2 New `src/storage/territoryMigration.ts`: `runTerritoryMigrationIfNeeded` (design.md Decision 9) — replays `resolveTerritoryChanges` over the full existing `home_range_cells` table in stable (`lastRefreshed`, then `ix`/`iy`) order, guarded by the new flag, idempotent. Persists via one grouped `assignTerritoryToCells` call per resolved territory at the end of the pass (not one write per cell) — see task 1.9's note on why a coordinate-scoped write method was needed here (a bulk-by-current-value `reassignCellsToTerritory(null, X)` can't route different null-territoryId cells to different destination territories in the same pass).
- [x] 3.3 Wire into `App.tsx`'s existing app-load migration sequence, after `runHomeRangeMigrationIfNeeded` (territory assignment needs a populated Range to cluster) — chained via `.then()`.
- [x] 3.4 Migration test (`src/storage/__tests__/territoryMigration.test.ts`): a synthetic pre-existing Range with two geographically separate clusters backfills into two territories, not one; plus one-contiguous-blob-stays-one-territory and idempotent-on-second-run coverage.

## 4. Wiring into Finish Walk

- [x] 4.1 `App.tsx`'s `finishWalk`: calls `resolveTerritoryChanges` using the already-fetched `rangeBefore`/`painted`, then persists the plan: `TerritoryRepository.createTerritory` for each birth (name via task 5's reverse-geocode call), `HomeRangeRepository.paintCells` with `territoryId` filled in per new cell, then (AFTER painting — see the correctness note below) `HomeRangeRepository.reassignCellsToTerritory` + `TerritoryRepository.mergeTerritoryStats` for each merge, and `TerritoryRepository.incrementTerritoryStats` for the single credited territory (walksHere +1, treatsEarnedHere += this walk's actual awarded treats, or 0 when the walk doesn't clear the rewards floor). **Correctness note (caught via the task 13.2 full-path test):** merges MUST be applied after this walk's own new cells are painted, not before — a new cell assimilated into a territory that turns out to be this walk's merge loser must already exist in the table by the time `reassignCellsToTerritory`'s bulk "every cell currently in fromId" UPDATE runs, matching design.md Decision 3's own Step-3-then-Step-4 ordering.
- [x] 4.2 Skip all of task 4.1 entirely for a manual log — `logMissedWalk` never calls `resolveTerritoryChanges` at all (structural exclusion, per design.md Decision 5; manual logs route through a separate function that was never touched).
- [x] 4.3 Sequencing: territory resolution runs using the Range snapshot from *before* this walk's own paint (the same `rangeBefore` New Ground detection already snapshots).

## 5. Naming

- [x] 5.1 New exported `resolveTerritoryName(anchorLat, anchorLon, dogName)` in `streetLookup.ts`, reusing the existing private `resolveLabelForPoint`; composes `{dog}'s {place} Range` via `dogDisplayName`.
- [x] 5.2 Fallback name (`"{dog}'s New Range"`, placeholder pending `game-master` finalization per task 0.2, marked with a TODO comment) when reverse-geocoding fails — never leaves a territory unnamed.
- [x] 5.3 Unit tests (`src/utils/__tests__/streetLookup.test.ts`): naming success composes the dog+place name; naming failure (empty geocode result, and a thrown error) still produces a valid, non-empty fallback name; the generic "Your dog" fallback is used when no dog name is set.

## 6. Celebration beats

- [x] 6.1 `CelebrationScreen.tsx`: two new optional props (`newTerritoryName: string | null`, `mergedTerritoryNames: [string, string] | null`), rendered as two new boxes following the exact shape of the existing New Ground/Fresh Ground boxes. Copy used verbatim from this task's own text: "A new territory! {dog} found a second home." for the birth beat and "{dog} connected his two worlds!" for the merge beat — both marked with a TODO(game-master copy pass) comment since neither interpolates the territory's own name yet (not given verbatim anywhere in proposal.md/design.md).
- [x] 6.2 `App.tsx`'s `finishWalk` wires the territory-resolution result into the celebration screen's props via `resolveCelebrationTerritoryBeat`, gating the birth beat on "player had ≥1 territory before this walk" (design.md's first-territory exclusion, implemented inside that pure function).
- [x] 6.3 Unit tests (`src/utils/__tests__/territoryCluster.test.ts`'s `resolveCelebrationTerritoryBeat` suite): first-ever territory produces no birth beat; a second territory produces one; two births on the very first walk announce only the second; a merge produces the merge beat with both names; no birth/merge produces no beats.

## 7. Passive income formula

- [x] 7.1 `sqliteHomeRangeRepository.ts`'s (and `inMemoryHomeRangeRepository.ts`'s) `paintCells`: added the daily visits cap — only increments `visits` when the cell's stored `lastVisitCreditedDayKey` (via `calendarDayKey`) differs from today's; always updates `lastVisitCreditedDayKey` to today's key on a tracked paint regardless; every other column is unaffected.
- [x] 7.2 New `src/economy/territoryEconomy.ts`: `territoryMass(cells, visits)`, `territoryRate(worldMass, buddyLevel)`, `territoryDisplayRate(mass, worldMass, territoryRate)`, `TERRITORY_INCOME_DISPLAY_FLOOR`, implementing design.md Decision 6's exact formula (kept as its own file rather than folded into `formulas.ts`, mirroring `milestones.ts`'s precedent of splitting out a distinct economy concern).
- [x] 7.3 `denEconomy.ts`'s `applyPassiveAccrual`: accepts an optional `worldMass` parameter (default `{cellCount:0, visitsSum:0}` so every existing caller keeps working unchanged), adding `territoryRate(...)` to the existing `passiveTreatsPerHour(...)` term.
- [x] 7.4 Added `territoryIncomeRevealed: boolean` to `DenEconomyState` (default `false`); `applyPassiveAccrual` flips it once the combined `territoryRate` observes `>= TERRITORY_INCOME_DISPLAY_FLOOR`, never re-checked backward.
- [x] 7.5 **Required split-invariance test** (`src/economy/__tests__/territoryEconomy.test.ts`): an identical total cell/visit count fabricated once as a single territory and once split across three (and, separately, nine) arbitrary territories asserts a bit-identical `territoryRate`. Also a static-inspection test asserting `getWorldMass()`'s actual SQL string literal contains no `GROUP BY`/`territoryId`.
- [x] 7.6 Unit tests: the display floor (`territoryRate < 1` reveals nothing, `>= 1` reveals once and never un-reveals — in `denEconomy.test.ts`); per-territory `territoryDisplayRate` values sum back to the global `territoryRate` (in `territoryEconomy.test.ts`).

## 8. Display: reveal beat, permanent line, per-territory card line

- [x] 8.1 Extended `resolveAwayStripLines` (`DoorstepScreen.tsx`) with a new, lowest-priority-but-still-real-fact source: the one-off territory-income reveal (`justRevealedTerritoryIncome`/`territoryIncomeRate` on `AwayStripDeps`), computed once by `App.tsx`'s merged mount effect (comparing `territoryIncomeRevealed` before/after that open's `applyPassiveAccrual` call) and passed down, never re-derived in `DoorstepScreen`.
- [x] 8.2 Added the permanent "🌍 {dog}'s territories bring home ≈N treats an hour" line to the Doorstep's footer area and to `DenScreen.tsx`'s footer, both gated on `territoryIncomeRevealed === true` (each screen's own state fetch), mirroring `getUpgradeTease`'s "once true, always shown" convention.
- [x] 8.3 Territory card (`TerritoryCard.tsx`): per-territory `territoryDisplayRate` line, gated on the same global `territoryIncomeRevealed` flag (computed once in `TerritoriesScreen.tsx` and passed down), shown as an absolute number only, never a percentage.

## 9. Titles

- [x] 9.1 New `src/utils/territoryTitles.ts`: `assignTerritoryTitles(territories, cellsByTerritory, now)` implementing design.md Decision 4's priority-ordered (`Everyday → Wild One → Far One`), at-most-one-per-territory, category-can-go-unawarded algorithm.
- [x] 9.2 Unit tests (`src/utils/__tests__/territoryTitles.test.ts`): distinct winners per category; a tie collapsing two categories onto one territory cascades to the next-best candidate; a category goes unawarded when territories run out; a single territory shows no title.

## 10. Territories list screen

- [x] 10.1 New `src/components/TerritoriesScreen.tsx` (list of territory cards, mirroring `StatsScreen.tsx`'s repository-backed list-screen shape) + `src/components/TerritoryCard.tsx`, reusing `TerritoryPortrait`'s rendering path scoped to `getCellsByTerritory(id)`'s result. **Implementation note:** `TerritoryPortrait.tsx` gained a small, backward-compatible extension (an optional `cells?: Cell[]` prop that, when supplied, skips its own internal `getCells()` fetch) rather than a parallel rendering component — the existing Doorstep usage (no `cells` prop) is unaffected.
- [x] 10.2 Rename control (pencil-edit) on the card, wired to `TerritoryRepository.renameTerritory`.
- [x] 10.3 Entry point into this screen: **RESOLVED — the map screen** (task 0.2). Added a floating button to `MapView.tsx`'s own chrome (an overlay `TouchableOpacity` on top of the WebView, since `MapView.tsx` had no prior button chrome to align next to) that triggers the new screen via `App.tsx`'s existing `showX` boolean-toggle convention.

## 11. Somewhere Wild territory-aware copy

- [x] 11.1 `SomewhereWildCard.tsx`/`streetLookup.ts`: when the winning wild cluster's anchor cell has a resolved `territoryId` (optional `territoryRepository` dependency, backward-compatible), the copy-assembly step looks up that territory's name and prefers it over the raw reverse-geocoded street label — still exactly one card app-wide.
- [x] 11.2 Unit tests (`src/components/__tests__/SomewhereWildCard.test.ts`): a wild cluster inside a named territory uses the territory name (even when the raw geocode also succeeds); a wild cluster with no territory assigned falls back to the existing street-label behavior unchanged, even when `territoryRepository` is supplied.

## 12. Spec deltas

- [ ] 12.1 This change's `specs/territories/spec.md` (new capability), `specs/home-range/spec.md`, `specs/den-economy/spec.md`, and `specs/anti-snowball/spec.md` deltas are already drafted (architect planning pass) — apply via `/opsx:apply` **after** `somewhere-wild` and `home-dashboard` have both applied. Left unchecked/not run per this implementation pass's explicit instruction not to run `/opsx:apply`.
- [ ] 12.2 Once `home-dashboard` has applied, add the deferred `MODIFIED Requirement` to `openspec/specs/home-dashboard/spec.md`'s "While You Were Out" strip requirement, naming the territory-income reveal as a fifth sourcing condition. Left unchecked — the base capability doesn't exist in `openspec/specs/` yet.
- [x] 12.3 Updated `README.md`'s folder-map and architecture summary to mention Territories.

## 13. Automated coverage

- [x] 13.1 `npx tsc --noEmit` clean.
- [x] 13.2 Full path test (`src/storage/__tests__/territoriesFullPath.test.ts`): a synthetic multi-walk history (two separate neighborhoods, then a bridging walk) produces the expected sequence of territory births, a merge with correct survivor/stat-sum, correct per-walk stat attribution, and a `territoryRate` confirmed split-invariant against a manually-summed `getWorldMass()`-shaped aggregate. This test is what caught and fixed the paint-before-merge ordering bug noted in task 4.1.

## 14. Manual on-device verification

**Needs a real device/emulator — left for the user to run, same pattern as every prior change in this project.**

- [ ] 14.1 Walk a real short loop near an existing Home Range, confirm no new territory is created (assimilation works); walk somewhere genuinely far away (400m+), confirm a new territory is created and named, and the celebration screen shows the discovery beat.
- [ ] 14.2 Walk a route that bridges two existing territories, confirm they merge, the celebration screen shows the merge beat instead of/alongside the birth beat as designed, and the merged territory keeps the older one's name and summed stats.
- [ ] 14.3 Confirm reverse-geocoding failure (e.g. airplane mode at the moment a territory would be born) still produces a nameable, renameable territory, never a broken/blank one.
- [ ] 14.4 Confirm the per-territory card shows exactly the four specified stats and no ranking/comparison chrome; confirm titles appear correctly once ≥2 territories exist and disappear correctly back to zero territories shown with 1.
- [ ] 14.5 Confirm the territory-income line stays invisible below the 1 treat/hour floor, reveals once via the expected surface, and persists thereafter on both the Doorstep and Den screens across app restarts.
- [ ] 14.6 Confirm repainting the same ground twice in one day does not visibly do anything different the second time (the daily visits cap is silent, per its own requirement) — no dimmed cells, no message, nothing.
- [ ] 14.7 Confirm the rename control works from a territory's own card and that the celebration screen never offers it.
- [ ] 14.8 Test reverse geocoding for territory naming on more than one device/Android version, per `somewhere-wild`'s own already-flagged device-fragmentation risk (design.md Decision 5) — confirm the fallback name path behaves correctly where geocoding is known/suspected not to resolve.

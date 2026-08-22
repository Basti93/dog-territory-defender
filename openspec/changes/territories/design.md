## Context

`home-range` (archived) built one persistent grid (`src/utils/grid.ts`, `src/storage/HomeRangeRepository.ts`) with no internal structure — every cell is just a member of "the Range." `somewhere-wild` (landed, not yet archived) already proved out one relevant pattern on top of that grid: 8-neighbour connected-components clustering with deterministic tie-breaks (`src/utils/wildSpot.ts`'s `wildestCluster`), and reverse-geocode naming with a walk-history fallback chain (`src/utils/streetLookup.ts`). This change reuses both directly rather than re-deriving them.

**Goals:** give the grid a stable, sticky partition into named sub-regions that a fresh agent can reason about without re-deriving from scratch each read; keep the passive-income addition provably invariant to how many territories a player happens to have (the game-economist's explicit, non-negotiable correctness constraint); reuse every existing primitive (`wildness()`, `streetsKnown()`, `paintedCells()`, the repository/migration/singleton-flag conventions) rather than inventing parallel ones.

**Non-goals:** any cross-player concept (Phase 3); re-tuning the passive-income formula's constants (game-economist-validated, verbatim); a general graph/clustering abstraction — the algorithm below is written procedurally, not as a reusable graph library, because there is exactly one caller.

## Decision 1 — Territory membership lives on `Cell`, not in a computed-on-read graph

**Chosen:** add `territoryId: TerritoryId | null` directly to `HomeRangeRepository`'s `Cell` record (null only transiently, during the one-time migration backfill — see Decision 5). `HomeRangeRepository` remains the sole owner of the cells table and the sole writer of `territoryId` (at insert time for a brand-new cell, and via one new bulk-reassignment method during a merge). A separate, new `TerritoryRepository` owns only the `Territory` entity itself — `id`, `name`, `createdAt`, `walksHere`, `treatsEarnedHere` — and never touches the cells table.

**Rejected: compute territory membership on the fly via connected-components over the whole grid at render time**, the same way `wildestCluster` computes its winning cluster fresh on every evaluation. This fails for a reason specific to this feature that doesn't apply to `wildestCluster`: birth and merge use *different* thresholds (400m to birth/assimilate vs. literal touching to merge — see Decision 2), so "which territory does this cell belong to" is not a pure function of the *current* cell set alone — it depends on *history* (which territory absorbed a gap-separated cell first, before some later walk happened to close the gap). A live recompute can only ever re-derive one consistent partition at the *current* threshold, which would either (a) fragment into far more, tinier territories than intended if literal-touching were the only rule, or (b) silently re-cluster (and re-merge, and re-name) territories across a session as fresh cells are painted, with no record of the merge ever having "happened" for the celebration beat to hook into. Sticky, persisted membership is what makes "Buddy connected his two worlds!" a real, one-time event rather than a re-derived label that could theoretically flip back and forth.

**Rejected: a new `CellTerritoryMembership` join table**, keeping `Cell` itself untouched. Cell membership is 1:1 and mandatory (every cell belongs to exactly one territory, no cell is ever un-owned once painted) — a join table only earns its complexity for many-to-many or optional relationships. A plain nullable column, written once and reassigned only during the rare bulk merge, is the same pattern `lastRefreshed`/`lastTracked`/`visits` already established on this exact record.

## Decision 2 — Two distinct thresholds: assimilate/birth (soft, 400m) vs. merge (hard, literal touching)

The concept uses two different words for two different situations, and they need two different thresholds, not one shared one:

- **Assimilation/birth threshold — `SPAWN_DISTANCE_M = 400`** (20 cells at `CELL_M = 20`). Governs only *newly painted cells that aren't yet in any territory*: if the nearest existing territory's nearest cell is within 400m, the new cell joins it; otherwise it becomes part of a new territory. This threshold is deliberately generous — a dog's usual neighborhood almost never forms one unbroken, gapless blob (a park the dog walks around, not through; a one-way street walked in one direction only) and a 0-gap "must literally touch" rule would fragment one obviously-single neighborhood into several. **This is the "reasonable default, not balance-critical" number the brief asked for** — safe to retune later without a game-economist pass, since it affects only how territories are drawn, never the passive-income total (see Decision 6's split-invariance guardrail: `worldMass` doesn't care how cells are partitioned).
- **Merge threshold — literal 8-neighbour adjacency/overlap**, reusing `home-range`'s already-shipped `newGroundCells` dilation check verbatim (same "candidate cell has a Range neighbour" primitive, applied here to two *different* territoryIds instead of "in the Range or not"). Deliberately much stricter than the birth threshold: merging two independently-named, independently-aged territories is a much higher-stakes, name-losing (well — name-*keeping*-for-one-of-them) operation than a raw cell picking a neighbour, and the concept's own words ("grow into contact/overlap") describe literal touching, not "within a few hundred metres." Using the same threshold for both would mean two territories 300m apart could merge the moment *any* walk drops one cell into that gap without ever visibly bridging them on the map — a merge with no obvious "why did this happen" story for the player. Requiring literal contact means every merge is always visible on the map as connected ground.

**Rejected: one unified proximity threshold via a general union-find over {existing territories, new cells}.** Explored first (see the algorithm's shape below, which *is* a bounded, cheap union-find, just over a small, precisely-scoped edge set) — but a single shared distance for both birth-assimilation and merge conflates two decisions the concept explicitly wants different: how close is "close enough to just be part of the same neighborhood" vs. how close is "close enough that two *already-named* things should stop being two things." Keeping them numerically distinct, using the same underlying "cheap bounding-box pre-filter, then exact nearest-cell distance" mechanics `streetLookup.ts` already established for its own overlap checks, gets both the cheap implementation and the two-different-questions correctness.

## Decision 3 — The clustering/merge algorithm, concretely (per Finish Walk)

Runs once per finished tracked walk (manual logs are excluded structurally — see Decision 5's note on why), at the existing `finishWalk` call site in `App.tsx`, using data it already fetches (`rangeBefore`, `painted`) plus one new read (`rangeBefore`'s cells now carry `territoryId`, so no extra repository call is needed to know current membership).

```
newCells = painted \ rangeBeforeSet          // cells this walk touches for the first time ever
knownCells = painted ∩ rangeBeforeSet        // cells this walk re-covers; territoryId already set

if newCells is empty:
    // This walk only re-covered known ground — no birth, no assimilation, no merge possible.
    skip to Attribution (step 5) using knownCells' existing territoryId(s).

Step 1 — Assimilate-or-orphan pass, once per cell in newCells:
    nearestExistingTerritory = nearest territory (by nearest-cell distance; bounding-box
      pre-filter first, mirroring streetLookup.ts's rectsOverlap check, before the exact
      distance computation) among all territories present in rangeBefore.
    if nearestExistingTerritory's distance <= SPAWN_DISTANCE_M:
        tag this cell "assimilated" into nearestExistingTerritory.id
    else:
        tag this cell "orphan"

Step 2 — Group orphans into new territories:
    8-neighbour-OR-within-SPAWN_DISTANCE_M connected components over the "orphan" cells only
    (reusing wildSpot.ts's flood-fill shape and its lowest-(ix,iy) tie-break convention for
    determinism) — each resulting group births exactly one new Territory (id, name via
    reverse-geocode of the group's lowest-(ix,iy) cell centre — see Decision 5 for the naming
    call and its fallback).
    (A single walk producing two geographically separate orphan groups — e.g. an anti-exploit
    segment-gap split the walk's own trail into two disconnected painted blobs — correctly
    births two territories, not one; this is a real, if rare, edge case worth a unit test.)

Step 3 — Persist cell assignment:
    Insert every newCells row via HomeRangeRepository.paintCells (already called at this site),
    now carrying each cell's resolved territoryId in PaintCellInput. Cells in knownCells are
    UPDATEd exactly as today (lastRefreshed/lastTracked/visits) — their territoryId column is
    never touched by an UPDATE, only ever by the bulk reassignment in Step 4.

Step 4 — Merge check, bounded to this walk's own footprint:
    Scan every cell in newCells plus their immediate 8 neighbours (a small, bounded set — never
    the whole grid) for any pair of adjacent cells whose territoryId differs. Each such pair is a
    merge edge. Resolve into merge groups via a tiny union-find (at most a handful of distinct
    territoryIds in practice). For each group with >1 territory: survivor = the one with the
    smallest createdAt ("older wins", per the brief's own naming rule). For every other territory
    in the group: HomeRangeRepository.reassignCellsToTerritory(loserId, survivorId) (one bulk
    UPDATE); TerritoryRepository sums walksHere/treatsEarnedHere into the survivor and deletes
    the loser's row.

Step 5 — Attribution (walksHere += 1, treatsEarnedHere += this walk's treatsAwarded):
    creditTerritory = the territoryId with the most of THIS WALK's own painted cells (painted,
    not just newCells), evaluated after Steps 1-4 resolve — i.e. exactly one territory gets
    credit per walk, even in the rare multi-territory-touched case (tie-break: lowest
    territoryId string). This is a deliberate simplification — see "Rejected" below.
```

**Rejected: proportional/split attribution** (crediting `walksHere`/`treatsEarnedHere` fractionally across every territory a single walk's cells happen to touch). The only realistic way one walk touches multiple territories at all is the rare anti-exploit segment-gap edge case (Decision 3's parenthetical) or a walk that happens to bridge two territories in the same motion it merges them (in which case there's only one territory left by Step 5 anyway). Splitting a treats/walk count across territories for that rare case adds real implementation complexity (fractional counters, rounding rules) for a scenario that will essentially never surface in practice — majority-cell attribution is simpler, deterministic, and the discrepancy it introduces (a walk barely grazing a second territory doesn't get counted there) is not something a player will ever notice, let alone find unfair, given territories are explicitly never compared to each other.

**On the very first walk ever (no existing territories):** Step 1's "nearest existing territory" search is over an empty set — every cell in `newCells` trivially becomes "orphan," and Step 2 births exactly one territory from them. No special-casing needed; the general algorithm already produces the correct first-territory behavior.

## Decision 4 — Title assignment: live-computed, at-most-one-per-territory, category can go unawarded

Computed fresh every time the territories list renders (never persisted — "The Wild One" is explicitly allowed to read live `wildness()`, per the brief, since it's a descriptive label, not a decaying score the anti-snowball/no-decay conventions elsewhere in this codebase would otherwise forbid persisting). Inputs: every territory's own `walksHere` counter (Everyday), every territory's cells' current mean `wildness()` (Wild One), and distance from the player's oldest territory (Far One — "home" is defined as whichever territory has the smallest `createdAt`, i.e. the player's very first territory ever, not a manually flagged "home" — no such flag exists or is needed).

**Algorithm:** rank categories in a fixed priority order — proposed `Everyday → Wild One → Far One` (the order the brief itself lists them in; flagged in `proposal.md` as a `game-master` call, not pinned here as final). For each category in priority order, pick its argmax territory; if that territory has already been awarded a higher-priority title, skip to the category's next-best candidate; if every territory is already holding a title (only possible with fewer territories than categories), the category simply goes unawarded this render. A player with exactly one territory sees zero titles (nothing to differentiate a solo territory from).

**Rejected: forcing every territory to hold exactly one title whenever categories ≥ territories.** With, say, two territories and three categories, forcing a title onto both would mean inventing a tie-break that manufactures a distinction that doesn't exist (e.g. Far One always trivially "wins" for the only non-home territory even if it's also the most-walked one) — better to let a category go quietly unawarded than manufacture a hollow title. This matches the "nothing loses" framing more literally than "everything must win something": a territory with no title yet isn't a loser, it just doesn't have enough sibling territories yet for a title to mean anything.

## Decision 5 — Naming: reuse `streetLookup.ts` verbatim, same failure mode as `somewhere-wild`

A new territory's name is resolved via `resolveLabelForPoint`-equivalent reverse-geocoding of its founding group's lowest-`(ix,iy)` cell centre (same tie-break convention as everywhere else in this codebase), composed as `Buddy's {place} Range` (or the dog's actual name via `dogDisplayName`, matching every other dog-name-aware string in this codebase). **Same device-fragmentation risk `somewhere-wild/design.md` Decision 5 already flagged and accepted**: the OS geocoder can fail on some real devices. Unlike Somewhere Wild's card (which simply renders nothing on failure — the fact it describes is optional, transient, and re-evaluated later), a territory *must* exist and be nameable the moment it's born (the celebration beat needs a name to put in its copy, and the territory needs a name the instant it appears in the list) — so failure here needs a real fallback string, not a "render nothing" degradation. **Proposed fallback: "Buddy's New Range"** (placeholder copy, `proposal.md`'s Open Questions flags this for `game-master` finalization, not invented as final here) — the fallback name is not retried automatically; the player can always fix it via the existing rename-anytime pencil-edit once the territory is on-screen.

**Manual logs never trigger any of this.** A manual log has `locations: []` (no GPS trail), so it paints zero cells (`paintedCells([])` returns an empty set) — it structurally cannot create `newCells`, cannot birth or assimilate anything, and is excluded from territory attribution the same deliberate way `home-range`'s own migration already excludes manual logs from Home Range painting ("a manual log has no GPS evidence to discover ground with" — the identical reasoning applies here). A manual-log route refresh only re-touches cells already in the Range with an already-set `territoryId`; nothing about territory membership changes.

## Decision 6 — The passive-income formula, verbatim, and the split-invariance guardrail

**Exact formula, game-economist-validated, not to be altered without a new validation pass:**

```
mass(t) = 1·cells(t) + 2·visits(t)
worldMass = Σ mass(t) over all territories   // == a single global aggregate over ALL cells, not
                                              // a value computed per-territory and then summed
territoryRate = R_max · (1 − exp(−worldMass / 300000))
R_max = buddyPayout(level) / 48
totalPassive = existingDenPassiveTreatsPerHour + territoryRate   // added inside applyPassiveAccrual
```

**Correctness constraint an implementer MUST NOT violate, stated concretely:** because `mass(t)` is linear in `cells(t)`/`visits(t)`, `Σ mass(t)` over however many territories a player happens to have is *always* exactly equal to `totalCells + 2·totalVisits` computed over the raw, whole `home_range_cells` table with no `GROUP BY territoryId` at all. **`worldMass` must be computed by a single ungrouped aggregate query** (`SELECT COUNT(*), SUM(visits) FROM home_range_cells`) — a new `HomeRangeRepository.getWorldMass()` method, added specifically so this is impossible to get wrong by construction: the method takes no `territoryId` parameter and there is no territory-scoped variant of it to accidentally call in a loop. The exponential saturation (`1 − exp(...)`) is then applied exactly **once**, to that single number — never once per territory and summed. Splitting one territory into two (or merging two into one) via this change's own birth/assimilate/merge logic must never change the resulting `territoryRate` by even a rounding error, because `worldMass`'s computation never looks at territory boundaries at all. **Required test:** fabricate an identical total cell/visit count once as a single territory and once split across three arbitrary territories; assert `territoryRate` is bit-identical in both cases. This is the concrete, automatable form of the game-economist's "MUST be split-invariant" requirement — without it, a player could inflate their passive income by deliberately walking in a pattern that maximizes the *number* of territories they hold, exactly the exploit class this constraint exists to close.

**Anti-farming (`visits` daily cap):** enforced at the exact point `visits` is incremented — `sqliteHomeRangeRepository.ts`'s `paintCells`, which already tracks `lastTracked`/`visits` per cell. Add a `lastVisitCreditedDayKey` column (reusing `calendarDayKey` from `src/utils/manualWalkLog.ts`, this codebase's existing day-boundary helper) and only increment `visits` when the cell's stored day-key differs from today's; **`walks here` and every other stat still increments normally regardless of this cap** — only the `visits` column (which feeds nothing except `mass(t)`) is capped. No UI ever reads or displays `visits` directly (confirmed: today it only feeds `wildestCluster`'s ranking and the ghost-trail render channel, neither of which is a raw numeric readout) — this change adds no new display of it either, per the brief's explicit "never display a raw `visits` count" rule.

**Display gating and the one-off reveal:** `territoryRate` is computed every `applyPassiveAccrual` call but not surfaced anywhere until it first crosses 1 treat/hour — a new `DenEconomyState.territoryIncomeRevealed: boolean` flag (same guarded-singleton-flag family as `homeRangeBackfillComplete`), flipped once, checked at read time, never re-evaluated backward (this is safe because `worldMass` is monotonically non-decreasing forever — cells are never removed per `home-range`'s own "Range Is Monotonic and Never Shrinks" requirement, and the daily-capped `visits` also only ever increases — so `territoryRate` can never drop back below the reveal threshold once crossed). The one-off beat reuses `home-dashboard`'s away-strip mechanism (`resolveAwayStripLines`) as a new, lowest-priority source, since that screen already owns exactly this class of fact ("something happened passively while you were away") — see `proposal.md`'s "What's deliberately not in this change's specs/ folder" for why the formal spec delta for that integration is deferred, not the integration itself. After the reveal, a permanent line ("🌍 Buddy's territories bring home ≈N treats an hour") renders on both the Doorstep and the Den screen footer, mirroring the always-visible `getUpgradeTease` line's own "once true, always shown" convention — no further gating needed given the monotonicity argument above.

**Per-territory display rate ("absolute rates, never percentages, never ranked"):** each territory's own card shows `territoryRate · mass(t)/worldMass` — an exact proportional split of the single already-correct global rate, so the per-territory numbers always sum back to the global total (conservation; splitting or merging territories redistributes the same total differently, never inflates it — the split-invariance guarantee above already covers the *total*, and this is a pure downstream display computation over that already-correct total, not a second independent rate computation). Displayed as a plain absolute number ("≈0.3 treats/hour"), never as "12% of total" — the underlying math is a proportion, but the on-screen text is never framed as one, honoring the letter of "never percentages" while still answering "how much does *this* territory contribute." Gated on the same global `territoryIncomeRevealed` flag (no separate per-territory threshold — avoids some territories showing a rate before others, which would itself read as an implicit ranking).

**Rejected: gate each territory's own display line on its own individual mass crossing some threshold**, rather than the single global flag. This would mean a brand-new, tiny territory shows no income line while an established one does — an implicit "this one doesn't count yet" comparison the brief's "never rank" rule exists to prevent. One global reveal moment, shown identically (in position, not in number) on every territory's card thereafter, avoids that.

## Decision 7 — Anti-snowball and Den-economy spec deltas: extend existing exclusions, don't invent new ones

`territoryRate` is level-dependent (via `R_max = buddyPayout(level)/48`) exactly the same way Buddy's per-walk treats payout already is — and `anti-snowball/spec.md`'s "Hard Power Gap Soft-Cap" requirement already carries a named exclusion list for exactly this class of thing (Buddy's Level's income curve, `bloomMultiplier`). This change's `anti-snowball` delta is a one-sentence extension of that same list, not a new requirement — the reasoning ("an income effect, not a capped percentage bonus applied to a defense/XP/find-rate quantity") is identical to the reasoning already on record for the two existing exclusions, so it's cited, not re-argued.

`den-economy/spec.md` gets one new `ADDED Requirement` ("Territory Passive Income") rather than folding this into the existing "Treats Currency and Passive Generation" requirement, because it has its own distinct display-threshold-suppression rule (mirroring "Fresh Ground Payout..."'s own suppression pattern) that the base requirement doesn't currently need — same "one requirement per independently-testable rule" granularity this spec file already uses elsewhere (compare how "Fresh Ground..." and "Manual-Log Route Refresh..." are already two separate requirements rather than one).

## Decision 8 — Territories list screen: a new screen, entry point left open

A new `TerritoriesScreen.tsx` (list of territory cards, mirroring `StatsScreen.tsx`'s existing "read-only repository-backed list screen" shape and `App.tsx`'s existing `showX` boolean-toggle navigation convention — no new navigation abstraction). Each card reuses `TerritoryPortrait`'s existing rendering path (`buildHomeRangeRasterPayload` + `portraitHTML.ts`), scoped to that territory's own cells only (via the new `HomeRangeRepository.getCellsByTerritory(territoryId)`) — **no new rendering code is needed**, since `buildHomeRangeRasterPayload` already takes a plain `Cell[]` and has no opinion about which cells are in it. **Entry point RESOLVED by user, 2026-08-22: the map screen** — a new entry point on the map screen's own chrome (alongside its existing controls, e.g. `MapView.tsx`'s existing button-overlay pattern), not the Doorstep and not folded into `StatsScreen.tsx`.

## Decision 9 — Migration: a second one-time backfill, same guarded-singleton pattern

Existing installs already have a populated `home_range_cells` table with `territoryId` uniformly `NULL` the moment this change ships (schema migration adds the column). A new `runTerritoryMigrationIfNeeded` (mirrors `homeRangeMigration.ts` exactly: guarded by `DenEconomyState.territoriesBackfillComplete`, idempotent, safe to call on every app load) replays the *same* clustering algorithm from Decision 3 over full history in one pass: walk every existing cell in stable insertion/`lastRefreshed` order, treating each as if it were a fresh `newCells` batch of size one against whatever territories have been built up so far in this same pass. This reuses the exact same pure functions Decision 3 already specifies — no separate "bulk clustering" algorithm needs to be written or validated independently.

## Risks / Trade-offs

- **[400m `SPAWN_DISTANCE_M` is an unvalidated first-pass number]** — explicitly flagged as such in `proposal.md`, per the brief's own "not balance-critical" framing. Safe to retune later without a game-economist pass (Decision 2 already establishes the split-invariance guarantee doesn't depend on it), but should still be logged as a decision if changed, per this project's standing "no silent drift" rule.
- **[Reverse-geocoding failure at territory-birth time needs a real fallback string, unlike Somewhere Wild's "render nothing"]** — see Decision 5. The proposed fallback copy is explicitly a placeholder, not finalized.
- **[This change is large for one OpenSpec change]** — a formal split (mirroring `home-range`/`home-range-rewards`'s own precedent of a structural half and a payout half) was considered and rejected: unlike that split, neither half here is independently "worse than before" without the other (a territory with no income term is still a complete, useful feature; the income term has nothing to attach to without territories existing) — the split-invariance guarantee that's this change's one hard correctness constraint also spans both halves, so verifying it requires both to exist together anyway. Kept as one change per this task's explicit instruction; `tasks.md` is sectioned so the structural work (birth/merge/naming/stats/titles) and the income work are still independently implementable and reviewable in sequence, even though they ship as one change.
- **[Title priority order and the naming/entry-point Open Questions are explicitly unresolved]** — see `proposal.md`'s Open Questions; not silently decided here.

## Source

Concept: `game-master` subagent pass ("Buddy's Territories"). Passive-income formula: `game-economist` subagent pass. Both provided verbatim; not re-litigated. Technical scoping, the clustering/merge algorithm, the data-model decision, and the split-invariance guardrail: `senior-app-architect`, grounded in `src/utils/grid.ts`, `src/utils/wildSpot.ts`, `src/utils/streetLookup.ts`, `src/storage/HomeRangeRepository.ts`, `src/storage/sqliteHomeRangeRepository.ts`, `src/storage/homeRangeMigration.ts`, `src/economy/denEconomy.ts`, `src/economy/formulas.ts`, `src/economy/balanceConfig.ts`, `src/components/CelebrationScreen.tsx`, `src/components/SomewhereWildCard.tsx`, `src/components/TerritoryPortrait.tsx`, `src/components/DenScreen.tsx`, `App.tsx`, and the `home-range`, `home-range-rewards`, `somewhere-wild`, and `home-dashboard` changes' own `design.md`s.

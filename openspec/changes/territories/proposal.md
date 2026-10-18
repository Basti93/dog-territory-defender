## Status

Drafted by `senior-app-architect`, scoping a concept already designed by a `game-master` subagent pass ("Buddy's Territories") and validated by a `game-economist` pass (the passive-income formula). Neither the fun/UX design nor the economy formula is re-litigated here — this proposal only scopes them into buildable work, grounded in the current code, and flags a few places (below, and in full in `design.md`) where the concept needs one concrete technical answer this pass supplies.

**Two upstream capabilities this change touches are implemented in code but not yet archived as OpenSpec changes** — verified directly against the repo, not assumed:
- `somewhere-wild` — `src/utils/wildSpot.ts`, `src/utils/streetLookup.ts`, `src/components/SomewhereWildCard.tsx` all exist and are wired into `App.tsx`/`MapView.tsx`. Its own `tasks.md` shows every implementation task checked; only its spec-delta apply (task 7.1) and manual on-device verification (section 9) remain open.
- `home-dashboard` — `src/components/DoorstepScreen.tsx`, `src/components/TerritoryPortrait.tsx`, `src/web/portraitHTML.ts` all exist and are wired into `App.tsx`. Same state: only its spec-delta apply (task 6.1) and manual verification (section 8) remain open.

Neither has run `/opsx:apply` yet, so `openspec/specs/` does not yet contain a `home-dashboard` capability, and `openspec/specs/home-range/spec.md` does not yet contain `somewhere-wild`'s Somewhere-Wild requirements. This change's spec deltas are written against what the **code** already does (confirmed by direct inspection this session), not against not-yet-applied spec text. **Sequencing note for whoever runs `/opsx:apply`:** apply `somewhere-wild` and `home-dashboard` before applying this change, so this change's `home-range` delta (territory-aware Somewhere Wild copy) lands on top of Somewhere Wild's own requirements instead of racing them. This change does not touch `home-dashboard`'s spec file directly (see "What's deliberately not in this change's specs/ folder" below) — its away-strip integration is a documented follow-up, not silently skipped.

## Why

The founder's original ask was to let a dog with two neighborhoods (home + a rarely-visited office, a parents' house, a second city) see them as two distinct, nameable places instead of one undifferentiated blob — and to give the Den a second, small, always-growing passive-income source tied to how much ground the player has claimed overall. The game-master's reframe: territories are never ranked "weak vs. strong" against each other (that's a snowball/competition frame this game explicitly avoids before any social layer) — instead each territory earns exactly one flavor-of-character title ("The Everyday," "The Wild One," "The Far One") so a small second territory feels like its own place with its own personality, not a losing runner-up to the player's main one.

This is a presentation and light-structure layer over the Home Range grid the core loop already built (`home-range`), plus one additive passive-income term in the Den (`den-economy`) — it introduces no new backlog mechanic (no social layer, no leaderboard, no Pack).

## What Changes

The single persistent Home Range grid gains a partition: every cell belongs to exactly one **Territory** (a new concept — id, name, `createdAt`, and two monotonic counters). Territories are never manually drawn:

1. **Auto-birth.** A walk that paints ground more than 400m (`SPAWN_DISTANCE_M`, a reasonable default — see design.md Decision 2, not a balance-critical number) from every existing territory's claimed cells births a new territory around that ground. Ground within 400m of exactly one existing territory joins it instead, even if not literally touching (a walked-around park or a one-way street the dog never covers shouldn't fragment one neighborhood into two territories).
2. **Auto-merge.** When two different territories' claimed cells become 8-neighbour-adjacent (literally touching or overlapping — the same dilation check `home-range`'s New Ground detection already uses), they merge into one, framed as "Buddy connected his two worlds!" The merged territory keeps the older territory's id, name, and `createdAt`; its two monotonic counters (`walksHere`, `treatsEarnedHere`) sum.
3. **Naming.** A new territory is named via reverse-geocode of its founding ground (reusing `src/utils/streetLookup.ts` from `somewhere-wild`, not reimplemented) — e.g. "Buddy's Hauptstraße Range." Renameable anytime via a pencil-edit on the territory's own card; never offered on the post-walk celebration screen (no keyboard mid-confetti).
4. **Discovery beat.** The post-walk celebration screen gains two new optional beats, following the exact pattern the existing New Ground/Fresh Ground beats already use (`src/components/CelebrationScreen.tsx`): a "new territory" beat (fires only when this walk creates an *additional* territory beyond the player's first — the player's very first-ever territory is silent, since "a second home" only reads as a discovery once there's a first to contrast it with) and a "territories merged" beat.
5. **Per-territory display — four monotonic stats, shown only on that territory's own card, never compared to a sibling:** streets known (existing `streetsKnown`, scoped to that territory's cells), walks here, treats earned here ever, first claimed. No ranked list, no percentage-of-total, no "strength"/"health" score, no days-since-visited, ever (game-master's hard "never build" list, carried through unmodified).
6. **One character title per territory**, computed live (not persisted) each time the territory list renders, awarded by category (Everyday = most walks; Wild One = highest current average `wildness()` — a live descriptive label, explicitly allowed to use `wildness()` unlike a persisted score; Far One = furthest from the player's oldest territory), with no territory ever holding two titles at once and a title simply going unawarded if there aren't enough territories to give every category a distinct winner (a player with exactly one territory sees no title at all).
7. **"Somewhere Wild" becomes territory-aware in copy** (e.g. "The Work Territory has gone wild") but stays exactly one pick app-wide, never one per territory — a small copy-assembly change in `src/components/SomewhereWildCard.tsx`, not a new pick mechanism.
8. **Territory passive income**, an additive term to the Den's existing passive treats/hour, using the game-economist-validated formula (verbatim, in `design.md` Decision 6, with the split-invariance guardrail called out as a correctness constraint, not a style note): `mass(t) = cells(t) + 2·visits(t)`, `worldMass = Σ mass(t)` computed as one global, ungrouped aggregate (never a per-territory curve summed afterward), `territoryRate = R_max·(1 − exp(−worldMass/300000))`, `R_max = buddyPayout(level)/48`. A required anti-farming fix caps `visits` at +1 per cell per calendar day, completely silently (no UI trace of the cap anywhere). Hidden entirely (no line, no placeholder) until the global rate crosses 1 treat/hour, at which point a one-off discovery beat fires once and a permanent line appears thereafter on the Doorstep and Den screens.

## What's deliberately not in this change's `specs/` folder

- **No delta to a `home-dashboard` capability spec.** That capability doesn't exist in `openspec/specs/` yet (only pending, unapplied, inside `openspec/changes/home-dashboard/`). This change's away-strip integration (the one-off territory-income reveal, reusing `resolveAwayStripLines`) is scoped in `design.md` and tracked in `tasks.md`, but the formal spec delta is deferred to a follow-up once `home-dashboard` itself has applied — see `design.md`'s Decision 7 for why writing a delta against a not-yet-existent capability from a different in-flight change would be structurally invalid, not merely inconvenient.
- **No new `anti-snowball` mechanism.** Only a one-line extension of the *existing* "Hard Power Gap Soft-Cap" exclusion list (see Capabilities below) — `territoryRate` is an income effect exactly like Buddy's Level and `bloomMultiplier` already are, not a new capped bonus.

## Capabilities

### New Capabilities
- `territories` — the Territory entity, auto-birth/assimilation/merge, naming/rename, per-territory stat display, and the one-title-per-territory rule.

### Modified Capabilities
- `home-range` — every Cell gains territory membership (an `ADDED Requirement`, safe to apply against the current base spec today); the Somewhere Wild card's copy becomes territory-aware (a second `ADDED Requirement` in the same delta file, explicitly marked "apply only after `somewhere-wild` lands" — see Status above).
- `den-economy` — adds the Territory Passive Income requirement (the formula above), additive to the existing "Treats Currency and Passive Generation" requirement, with its own display-threshold suppression rule mirroring Fresh Ground's existing pattern.
- `anti-snowball` — extends "Hard Power Gap Soft-Cap"'s existing exclusion list (Buddy's Level, `bloomMultiplier`) to also name `territoryRate`, for the identical reason: it's a function of walk geography and elapsed calendar time (via `worldMass`) and Buddy's Level's own already-excluded income curve, never a capped percentage bonus.

### Not modified
- `game-backlog` — no backlog item is pulled or changed here.
- `personal-stats` — per-territory `walksHere`/`treatsEarnedHere` are territory-scoped presentation counters owned by the new `territories` capability, not lifetime personal-stats achievements; nothing here changes what personal-stats tracks or how achievements unlock.
- `pack-collection` — untouched; territories hold no Pack-related state.

## Impact

- `src/storage/HomeRangeRepository.ts`: `Cell` gains `territoryId: TerritoryId | null` (null only transiently during migration); `PaintCellInput` gains an optional `territoryId` (used only when inserting a brand-new cell row); two new methods (`reassignCellsToTerritory`, `getWorldMass`) — see `design.md` Decision 1 for why territory membership lives here rather than on a new repository, and why `getWorldMass` must be a single ungrouped aggregate query (the split-invariance guardrail).
- New files: `src/storage/TerritoryRepository.ts` (+ sqlite/in-memory impls, mirroring every other repository in this codebase), `src/storage/territoryMigration.ts` (one-time backfill, same guarded-singleton-flag pattern as `homeRangeMigration.ts`), `src/utils/territoryCluster.ts` (pure birth/assimilate/merge logic, no I/O — mirrors `src/utils/wildSpot.ts`'s shape), `src/components/TerritoriesScreen.tsx` + a per-territory card component.
- `src/economy/denEconomy.ts`: `DenEconomyState` gains `territoriesBackfillComplete: boolean` and `territoryIncomeRevealed: boolean` (two more guarded one-time flags, same family as `homeRangeBackfillComplete`); `applyPassiveAccrual` gains a `worldMass` parameter feeding the new additive term.
- `src/components/CelebrationScreen.tsx`: two new optional props/boxes (new-territory beat, merge beat), same shape as the existing New Ground/Fresh Ground boxes.
- `src/components/SomewhereWildCard.tsx` / `src/utils/streetLookup.ts`: copy assembly prefers the winning wild cluster's territory name, when resolvable, over the raw street label.
- `App.tsx`: the Finish Walk call site (`finishWalk`, currently around line 280) gains one call into `territoryCluster.ts`'s resolution function, using data (`rangeBefore`, `painted`) it already fetches — no new repository read added to the hot path beyond what Territory-metadata writes require.
- No new external dependency, no new backend, no new permission.

## Scope

Current slice: a presentation layer over the Home Range grid plus one additive passive-income term in the Den; no social layer, leaderboard, Pack or streak. Recorded caveat: a territory only auto-births when a walk lands 400m+ from an existing one, so most solo testers in a short window may never see a second territory; this is a long-tail feature for players who already walk in two separated places.

## Open Questions — need a call before implementation

- **Title priority order when multiple categories tie on the same territory** (design.md Decision 4): proposed order Everyday → Wild One → Far One (the order the game-master listed them in), used only to decide which title a territory keeps when it would otherwise win two. Flagged as a `game-master` copy/balance call, not pinned here.
- **Territory list screen's entry point — RESOLVED by user, 2026-08-22: the map screen.** A new entry point on the map screen's own chrome (alongside its existing controls), not the Doorstep and not folded into Stats. See `design.md` Decision 8 and `tasks.md` 10.3.
- **New-territory naming fallback when reverse-geocoding fails** (design.md Decision 3, same device-fragmentation risk `somewhere-wild` already flagged for its own naming): proposed fallback copy ("Buddy's New Range") is a placeholder pending `game-master` finalization, not final copy.

## Source

Concept: `game-master` subagent pass ("Buddy's Territories"), passive-income formula validated by a `game-economist` pass, both provided verbatim to this scoping pass and not re-litigated. Technical scoping, the clustering/merge algorithm, the data-model decision, and the split-invariance guardrail: `senior-app-architect`, grounded in `src/utils/grid.ts`, `src/utils/wildSpot.ts`, `src/utils/streetLookup.ts`, `src/storage/HomeRangeRepository.ts`, `src/storage/sqliteHomeRangeRepository.ts`, `src/storage/homeRangeMigration.ts`, `src/economy/denEconomy.ts`, `src/economy/formulas.ts`, `src/economy/balanceConfig.ts`, `src/components/CelebrationScreen.tsx`, `src/components/SomewhereWildCard.tsx`, `src/components/TerritoryPortrait.tsx`, `App.tsx`'s `finishWalk`, and the archived/pending `home-range`, `home-range-rewards`, `somewhere-wild`, and `home-dashboard` changes' `design.md`s.

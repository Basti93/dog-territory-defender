## Context

This design came out of a 3-agent pass: two independent design drafts (an XP/Den-Level system, and this personal-stats/achievements system) plus a game-master compliance review checking both against `game-phases`, `anti-snowball`, `den-economy`, and the actual codebase. The XP/Level system was parked (see Decisions below); this document covers only what's being built. See `proposal.md` for motivation.

Existing patterns this design must follow: `WalkRepository`/`sqliteWalkRepository.ts` and `DenEconomyRepository`/`sqliteDenEconomyRepository.ts` (one interface, one SQLite-backed impl, one in-memory impl, singleton-state tables for economy-style data); `App.tsx`'s `stopWalk()` (closes a walk, awards treats, computes the upgrade tease, sets `celebration` state) and its passive-accrual `useEffect` (runs `applyPassiveAccrual` on app load); `DenScreen.tsx`'s existing overflow-notice banner pattern.

## Goals / Non-Goals

**Goals:**
- A solo "highscore to chase" that needs zero other players and zero calendar/streak tracking.
- Every stat and achievement derivable from data the app already produces (`Walk`, `TerritoryPolygon`, `DenEconomyState`) — no new fields on existing types.
- Zero mechanical bonus from any achievement in Phase 1 — this is prestige, not a fourth power-gap vector.
- Clean handoff to Phase 4's Trophy Hall without building any of Trophy Hall's own display/bonus logic now.

**Non-Goals:**
- Not building the parallel Den Level/XP system (parked, see Decisions).
- Not building Trophy Hall's badge-display selection or its `+0.5%`-per-badge bonus — that's Phase 4 work; this capability only guarantees the badge records will exist and be readable by id/timestamp when Phase 4 arrives.
- Not adding an `endTime` field to `Walk` — no achievement here needs walk duration, and `types.ts` is flagged load-bearing in `CLAUDE.md`; keep the touch minimal.
- Not deduplicating lifetime territory area against re-walked ground — "lifetime territory area claimed" is a flavor stat (sum of every closed walk's polygon area), not a unique-coverage calculation; that's a materially different (and much harder) computation this capability doesn't need.

## Decisions

**Standalone `personal-stats` capability, not folded into `den-economy`.** It spans two source systems (walk lifecycle and Den economy) and needs its own Phase-1-legal / Phase-4-handoff scoping requirements the way `anti-snowball` and `game-phases` each get their own file — folding it into `den-economy` would make that file cover two unrelated concerns, unlike every other spec in this repo.

**18 threshold-based achievements, table below, sourced from lifetime counters or current Den state only.** No streak-based or other-player-based triggers, so nothing here creeps into Phase 2 or Phase 3 territory.

| Name | Trigger |
|---|---|
| First Steps | 1st walk closed |
| Paws on the Pavement | 10 walks closed |
| Familiar Trails | 25 walks closed |
| Neighborhood Legend | 50 walks closed |
| 100 Walks, One Very Good Dog | 100 walks closed |
| Ground Claimed | first walk with territory ≥50 m² |
| Round the Block | 5 km lifetime distance |
| Cross-Town Trotter | 25 km lifetime distance |
| Century Trail | 100 km lifetime distance |
| Long Way Round | single walk ≥3,000 m |
| Big Backyard | biggest territory ≥1,000 m² |
| Whole City Block | biggest territory ≥5,000 m² |
| First Bakery Batch | 100 treats earned lifetime |
| Treat Jar Overflowing | 1,000 treats earned lifetime |
| Treats for Days | 10,000 treats earned lifetime |
| Moving In | first building upgrade ever |
| Handy Homebody | any building reaches level 10 |
| Cozy Den | Doghouse + Bakery + Sniff Garden all ≥ level 5 simultaneously |

Each achievement's stored copy is warm/spring/dog-themed (matching `CelebrationScreen.tsx`/`DenScreen.tsx`'s existing tone), e.g.: "First Steps 🐾 — You and your dog just closed your very first loop. Every territory starts with one walk together."

**Lifetime treats stat wires into both treat-earning paths.** The game-master review caught that a walk-close-only hook would silently undercount — `applyPassiveAccrual` (run in `App.tsx`'s load-time `useEffect`, independent of `stopWalk()`) also increases treats and must feed the same `totalTreatsEarnedLifetime` counter. Both `recordTreatsEarned(stats, amount)` call sites (post-`awardWalkTreats`, post-`applyPassiveAccrual`) use the same function.

**Reuse existing UI surfaces, add exactly one new screen.** Walk-triggered unlocks extend `CelebrationScreen`'s existing payload with an optional `unlockedAchievements` list, rendered as a small badge banner below the existing tease box — the walk stays the one "big" celebratory moment, per the visual-design spec's north star; achievements are an addition to it, not a competing screen. Den-triggered unlocks (`Moving In`, `Handy Homebody`, `Cozy Den`, a passive-accrual treat threshold) reuse `DenScreen`'s existing overflow-notice banner pattern — no new celebration component. The one new surface is `StatsScreen.tsx` (stat-card grid + achievement badge list, unlocked in color with date, locked greyed with a progress hint), opened from a header button next to the existing Den entry point.

**Trophy Hall reference, not restatement.** `personal-stats/spec.md`'s Trophy Hall Handoff requirement points at `den-economy`'s existing `+0.5%/badge` figure rather than repeating the number, so the two spec files can't drift out of sync if that figure is ever retuned.

**Parked: "Player/Den Level & XP" system.** A second design draft proposed a walking-XP-driven Den Level, reusing the existing unlock gates in `den-economy`'s building table (Den Level 5/10/15/20/25/30 for buildings 4-9). The game-master review found this reopens an already-archived decision — `docs/decisions/2026-08-16-post-walk-celebration/` explicitly deferred dog XP/level display to a later phase. It also leaked Phase 4's unlock ladder into a Phase 1 UI ("next building unlocks at Level 5") and baked in Beginner's Luck, which `game-phases`' mechanic-rollout table assigns to Phase 4 only. Separately: stripped of those two things, its Phase-1 payoff (a number-go-up plus a flat treat ding) turned out to be largely redundant with this capability's walk-count achievements. Parked pending an explicit decision from the owner to reopen the archived deferral — not built as part of this change.

## Risks / Trade-offs

- [18 achievements is a lot to hand-tune copy for in one pass] → Accepted; ship all 18 together so the badge case doesn't feel sparse on day one — thresholds are cheap to retune later if playtesting shows any land at the wrong pace.
- [Lifetime territory area is a flavor stat, not deduplicated against re-walked ground, so it will overstate "real" claimed coverage for anyone who re-walks the same loop] → Accepted for Phase 1; explicitly scoped as a Non-Goal above, and none of the 18 achievements treat it as anything more than a sum-of-walks flavor number.
- [New SQLite tables (`personal_stats`, `achievements`) need to exist alongside the existing `den_economy` and `walks` tables without migration tooling] → Mitigated the same way the existing tables already are — `CREATE TABLE IF NOT EXISTS` on first open, no retrofit needed since these are brand-new tables with no prior schema to migrate from (unlike a hypothetical column addition to an existing table).
- [No backfill from walk history that predates this change — `recordWalkClosed`/`recordTreatsEarned` only run on the going-forward `stopWalk()`/passive-accrual paths, so a player with pre-existing closed walks in `walkRepository` sees `totalWalksClosed: 0` and no retroactive achievement unlocks until they complete a new walk] → Confirmed via real-device testing (4 pre-existing walks showed 0 in Stats) and explicitly declined for now — a backfill (replay every closed walk through `recordWalkClosed`, chronologically, on app load if `personal_stats` is behind `walkRepository`'s closed-walk count) was scoped but deferred as unnecessary complexity for the current single-tester stage. Revisit before any wider rollout, since every future player who installs after this change ships is unaffected — this only bites existing pre-change data.

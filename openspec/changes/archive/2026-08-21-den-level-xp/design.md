## Context

This reopens a decision explicitly deferred by the archived `2026-08-16-post-walk-celebration` change: its `design.md` Non-Goals section states "No dog XP/level display — doesn't exist yet, deferred per `visual-design`'s Phase-Scoped Visual Delivery." That deferral is being consciously overridden here at the owner's explicit request, not routed around silently — the archived change's `design.md` gets a small forward-pointer note (a direct edit, not part of this change's own artifacts) so the historical record stays accurate without being rewritten.

This design also carries forward an earlier 3-agent design/review pass (two independent design drafts, one game-master compliance review) done for a first version of this same idea. That review found two blocking problems, both fixed in this version: Beginner's Luck baked into the Phase 1 formula (that's Phase 4-only per `game-phases`' mechanic-rollout table — dropped entirely here, not just tuned down, and the `accountCreatedAt` field it needed is gone too), and a "next building unlocks at Level 5" tease that leaked Phase 4's unlock ladder into Phase 1 UI (removed — see the "No early unlock-ladder disclosure" spec scenario).

Existing patterns this design follows: `DenEconomyState`/`sqliteDenEconomyRepository.ts`'s existing singleton-row SQLite table (this change adds columns to it via `ALTER TABLE`, the first schema migration this codebase has needed); `formulas.ts`'s existing geometric cost-curve shape (`upgradeCost`); `App.tsx`'s `stopWalk()` closing block, which already awards treats and personal-stats achievements on walk close — Level/XP awarding is one more step in that same block.

## Goals / Non-Goals

**Goals:**
- A single number that visibly advances on every closed walk, not just at milestones — the continuous-progress complement to `personal-stats`'s sparse achievement badges.
- Zero percentage-based gameplay impact in Phase 1 — this is a progress signal, not a power source.
- Comply with `visual-design`'s Success Criteria: the walk's own territory-claimed outcome stays the primary moment; Level never upstages it.
- A real, safe SQLite migration for the two new columns, since this is the first change in the project that needs to alter an existing table rather than create a new one.

**Non-Goals:**
- Not building Beginner's Luck (Phase 4, not part of this change in any form).
- Not building buildings 4-9 or their unlock gating logic (Phase 4) — Den Level exists now so it's ready for Phase 4 to gate against, but nothing in Phase 1 references what unlocks at any future level.
- Not smoothing/deduplicating the area term beyond a flat per-walk cap — that cap is a sanity bound, not a sophisticated anti-abuse system.
- Not making the XP formula or leveling curve constants user-configurable — same tunability posture as `balanceConfig.ts`'s existing numbers.

## Decisions

**`xp`/`level` are standalone fields on `DenEconomyState`, never derived from building levels.** Rejected: deriving Den Level from summed building levels. That would let a player reach high Den Level purely by spending treats — including passively-accrued ones earned without walking — reopening exactly the pay/idle-to-win path around Phase 4's unlock gates that `anti-snowball` cares about. A derived stat also can't distinguish "walked a lot" from "spent treats efficiently."

**XP formula: `xpPerWalk = 20 + 15 * distanceKm + 5 * (min(areaM2, 20000) / 1000)`.** The `min(areaM2, 20000)` cap is new versus the original design draft — added because an uncapped area term meant a single outsized or GPS-glitched polygon could produce a disproportionate XP/level jump; 20,000 m² is roughly 4x the biggest realistic Phase-1 urban-block loop, generous headroom without being unbounded. A "typical" ~1.5 km / ~8,000 m² loop still yields the same 82 XP as originally scoped.

**Leveling curve: `xpForNextLevel(level) = floor(100 * 1.13 ^ (level - 1))`, capped at level 100.** Unchanged from the original design pass. Worked progression: Level 5 at 484 cumulative XP (~5.9 walks), Level 10 at 1,541 XP (~18.7 walks), Level 20 at 7,065 XP, Level 30 at 25,826 XP (positioned as a veteran milestone — also the final Phase 4 unlock gate, Pack House), Level 100 extrapolates to ~1.4×10^8 XP, an intentionally near-unreachable "forever" number matching the building cost curve's late-level design intent.

**Phase 1 payoff is the readout itself, not the flat treat bonus.** The original design draft's payoff (a 25-treat ding plus a cosmetic flourish) undersold what actually matters: a persistent "Level 3 · 210/340 XP" number that moves after every walk. The flat treat bonus stays as a minor accompaniment (non-percentage, capped by storage) but isn't the headline — the always-visible, always-advancing bar is.

**No Beginner's Luck, in any form, in this change.** The original draft applied a `*2` XP multiplier for a player's first 30 days, requiring an `accountCreatedAt` field. `game-phases`' "Engagement Mechanic Rollout per Phase" table assigns Beginner's Luck to Phase 4 only. Dropping it entirely (not just disabling it) also removes the need for `accountCreatedAt` altogether — one less field, one less migration column, no leftover dead code path for a later phase to rediscover and puzzle over.

**No unlock-ladder disclosure anywhere in Phase 1 UI.** The original draft's "next building unlocks at Level 5" tease directly leaked Phase 4's unlock table into Phase 1. This version shows Level/XP progress with no reference to what any future level unlocks — enforced as its own spec scenario ("No early unlock-ladder disclosure") so it's testable, not just a design intention.

**Visibility: four places, escalating detail, all below the walk's own outcome in visual weight.** Main map screen's persistent stats row gets a compact "Lv. N" (new versus the original draft, which only placed this on the Den screen — added because "continuously visible" specifically implies parity with how Treats already displays there). `DenScreen` gets the fuller progress-bar view. `StatsScreen` (already shipped via `personal-stats`) gets one more stat card — no new screen. `CelebrationScreen` gets an optional level-up notice only on a walk that actually crosses a threshold, styled at or below the existing upgrade-tease box's visual weight, per `visual-design`'s Success Criteria — the "Territory claimed!" headline and treats-earned line stay the primary content of that screen.

**Real SQLite migration, not `CREATE TABLE IF NOT EXISTS` alone.** This is the first change to add columns to an already-populated table (`den_economy`) rather than create a new one — `personal-stats`'s new tables didn't need this since they had no prior rows. After the existing `CREATE TABLE IF NOT EXISTS`, run `ALTER TABLE den_economy ADD COLUMN xp REAL NOT NULL DEFAULT 0;` and `ALTER TABLE den_economy ADD COLUMN level INTEGER NOT NULL DEFAULT 1;`, each wrapped so a "duplicate column" error (a fresh install where the table was just created with these columns already present) is caught and ignored rather than thrown — SQLite has no `ADD COLUMN IF NOT EXISTS`, so a try/catch on the duplicate-column case is the standard pattern. This is required so an existing on-device row (the owner's current save, which predates this change) doesn't break `getState()`.

## Risks / Trade-offs

- [The area-term cap (20,000 m²) is a new, unvalidated number] → Accepted, same posture as `personal-stats`'s achievement thresholds — easy to find and retune in `balanceConfig.ts` after more real-walk data.
- [A player could, in principle, walk a very long single loop to front-load XP] → Bounded by the same per-walk area cap and by the fact that Level grants no percentage power — the worst case is reaching a Level number "early," which has no gameplay consequence in Phase 1.
- [Four separate UI touchpoints (main screen, Den, Stats, celebration) is more surface area than the original single-screen design] → Accepted deliberately — it's the direct answer to "goes up continuously," which specifically requires being visible outside of a sub-screen you have to remember to open.
- [SQLite `ALTER TABLE` migration is new territory for this codebase — first schema change to an existing table] → Mitigated by the duplicate-column try/catch pattern above; still worth a careful on-device check (see tasks.md) before treating this as a solved pattern for future schema changes.

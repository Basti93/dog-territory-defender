## Why

Phase 1's hypothesis is that territory-claiming plus treats creates a "want to walk again tomorrow" feeling — but right now the only progress a solo player can chase is the Den's building levels. There's no "highscore" to chase across walks themselves: no record of your biggest territory, no personal milestones, nothing that celebrates "you've walked this before, and you're getting better at it." A leaderboard (Phase 3) and daily streaks (Phase 2) both eventually answer this, but both require things Phase 1 explicitly doesn't have yet — other players, or day-over-day tracking. A purely personal, one-off milestone system needs neither, and closes this gap now without waiting on either later phase.

This design went through a 3-pass process (two independent design drafts, one compliance/game-master review) before being proposed — see design.md's Decisions section for what was rejected along the way, including a parallel "Den Level/XP" system that was deliberately parked because it reopens an already-archived decision (`2026-08-16-post-walk-celebration`) to defer dog XP/level display to a later phase.

## What Changes

- New capability `personal-stats`: lifetime stat tracking (total walks, lifetime distance, lifetime territory claimed, biggest territory, longest walk, lifetime treats earned, current Den levels) derived incrementally from existing walk/Den data.
- 18 one-off milestone achievements, purely personal/cosmetic prestige — explicitly no treats, XP, or gameplay bonus of any kind in Phase 1.
- New `StatsScreen.tsx` for browsing lifetime stats and the achievement badge case, reachable next to the existing Den entry point.
- Achievement unlocks surface in two existing places: the post-walk `CelebrationScreen` (walk-triggered achievements) and `DenScreen`'s existing notice-banner pattern (Den-triggered achievements) — no new full-screen interruption pattern.
- `docs/specs/game-phases.md`'s Phase 1 requirement text gets a small delta explicitly including "personal lifetime stats and non-social, non-bonus achievements" in Phase 1's build scope, since this wasn't one of Phase 1's original four bullets.

## Capabilities

### New Capabilities
- `personal-stats`: lifetime stat tracking and one-off personal achievements for a solo player, with an explicit non-goal of ever granting a gameplay bonus in Phase 1, and an explicit handoff point for Phase 4's Trophy Hall to later attach one.

### Modified Capabilities
- `game-phases`: Phase 1's build-scope requirement text gains "personal lifetime stats and non-social, non-bonus achievements" as an explicit Phase 1 deliverable.

## Impact

- New: `src/economy/personalStats.ts` (pure logic + achievement catalog), `src/storage/PersonalStatsRepository.ts` + `sqlitePersonalStatsRepository.ts` + `inMemoryPersonalStatsRepository.ts`, `src/components/StatsScreen.tsx`.
- New SQLite tables: `personal_stats` (singleton state row), `achievements` (unlocked badge records).
- Modified: `App.tsx` (`stopWalk()` and the passive-accrual effect both record stats/check achievements; a new header entry point opens `StatsScreen`), `src/components/CelebrationScreen.tsx` (optional achievement banner), `src/components/DenScreen.tsx` (achievement notices via the existing banner pattern; hook into the upgrade handler).
- No changes to `src/types.ts` — every stat and achievement is derivable from data `Walk`/`TerritoryPolygon`/`DenEconomyState` already carry.
- No changes to `den-economy`'s spec requirements — this capability references Trophy Hall's existing `+0.5%/badge` figure rather than restating it, and explicitly defers all display/bonus logic to Phase 4.

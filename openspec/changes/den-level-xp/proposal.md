## Why

`personal-stats` gave the solo player milestone goals (18 one-off achievements), but those are sparse — nothing visible happens between thresholds. There's still no single number that climbs on *every* walk, which is a distinct and complementary feedback pattern real cookie-clicker/RPG loops rely on alongside milestone badges. This change adds that: a standalone Den Level/XP track driven purely by walk distance and area.

This reopens a decision the project explicitly deferred: the archived `2026-08-16-post-walk-celebration` change's `design.md` states "No dog XP/level display — doesn't exist yet, deferred per `visual-design`'s Phase-Scoped Visual Delivery." That deferral is being consciously reopened now, at the owner's explicit request — see this change's `design.md` for the full record, and the archived change's `design.md` gets a forward-pointer note so the historical record stays accurate.

An earlier design/review pass (two independent design agents plus a game-master compliance review) fully scoped this once already and found real problems with the first draft — Beginner's Luck leaking into Phase 1 (that's Phase 4-only), and the Level-5+ unlock ladder leaking into Phase 1 UI. Both are fixed here. Beginner's Luck is dropped from this change entirely, not just tuned down.

## What Changes

- `DenEconomyState` gains standalone `xp`/`level` fields, computed only from each closed walk's own distance and enclosed area — never from building levels, treats spent, or Pack bonuses.
- Leveling curve mirrors the existing building-cost geometric shape, capped at level 100.
- Phase 1 payoff is intentionally non-percentage: the persistent, always-visible progress readout is the point, plus a small flat treat bonus on level-up. No percentage bonus to treats/XP/collectibles from Level — that's reserved for Phase 4's Training Yard/Watch Tower.
- Level is visible in four places: the main map screen's persistent stats row, `DenScreen`'s fuller progress bar, `StatsScreen`'s stat grid, and an optional small level-up notice on `CelebrationScreen` — kept at or below the visual weight of the existing upgrade tease, never overshadowing the "Territory claimed!" moment, per `visual-design`'s Success Criteria ("claiming territory feels like 'I made my mark on the neighborhood,' not 'I leveled up a metric'").
- No "next building unlocks at Level N" tease anywhere — Phase 4's unlock ladder stays unreferenced in Phase 1 UI.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `den-economy`: adds Walk-Derived XP, standalone Den Level, leveling curve, and non-percentage Phase 1 payoff requirements.
- `game-phases`: Phase 1's build-scope requirement text gains "Den Level/XP tracking (standalone, non-percentage)" as an explicit Phase 1 deliverable.

## Impact

- Modified: `src/economy/denEconomy.ts` (`DenEconomyState` gains `xp`/`level`, new `awardWalkXp` function), `src/economy/formulas.ts` (new `xpForNextLevel`/`cumulativeXpForLevel`/`levelForXp`/`xpAwardForWalk`), `src/economy/balanceConfig.ts` (new `xp`/`leveling` constants).
- Modified: `src/storage/sqliteDenEconomyRepository.ts` — real `ALTER TABLE` migration for the two new columns, safe against already-existing on-device rows.
- Modified: `App.tsx` (`stopWalk()` calls `awardWalkXp` alongside the existing treats award; main stats row gains a Level readout), `src/components/DenScreen.tsx` (Level/XP progress bar), `src/components/StatsScreen.tsx` (Level/XP stat card), `src/components/CelebrationScreen.tsx` (optional low-emphasis level-up notice).
- No changes to `anti-snowball` or `visual-design` — this change complies with both as written.
- Beginner's Luck and buildings 4-9's unlock gating are explicitly out of scope (Phase 4).

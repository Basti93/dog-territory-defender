# Den Level and XP (2026-08-21, implemented)
**Why:** personal-stats gave 18 sparse achievements; nothing climbed on every walk. Adds a standalone Level/XP track driven only by each closed walk's distance and area. Consciously reopens the 2026-08-16 post-walk-celebration deferral ("no dog XP/level display"), at the owner's request. An earlier 3-agent pass found two blockers, fixed here: Beginner's Luck (Phase 4 only) and a "next building unlocks at Level 5" tease leaking Phase 4's unlock ladder.
**Decisions:**
- `xp`/`level` are standalone fields on `DenEconomyState`, never derived from building levels or treats. Computed only from the walk's own distance and area, never from buildings, treats spent or Pack bonuses.
- Original formula: `xpPerWalk = 20 + 15*distanceKm + 5*(min(areaM2, 20000)/1000)`; typical 1.5 km / 8000 m2 loop = 82 XP. 20 000 m2 cap (~4x a big urban block loop) bounds glitchy polygons. Later change: area term replaced by `min(cellsPainted*400, 20000)` (see docs/decisions/2026-08-21-home-range.md); the 20 base is scaled by the daily multiplier (docs/decisions/2026-08-21-walk-reward-exploit-fix.md).
- Curve: `xpForNextLevel(level) = floor(100 * 1.13^(level-1))`, cap level 100. Level 5 at 484 cumulative XP (~5.9 walks), 10 at 1 541 (~18.7 walks), 20 at 7 065, 30 at 25 826 (veteran milestone, final Phase 4 gate), 100 ~1.4e8 (deliberately unreachable).
- Phase 1 payoff = the always-visible advancing readout ("Level 3 - 210/340 XP"); a small flat non-percentage treat bonus on level-up is secondary. No percentage power from Level (reserved for Training Yard/Watch Tower).
- Beginner's Luck dropped entirely, so no `accountCreatedAt` field or column. No unlock-ladder disclosure anywhere in Phase 1 UI (own spec scenario).
- Shown in four places, all below the walk's own outcome in weight: "Lv. N" in the main stats row, `DenScreen` progress bar, one `StatsScreen` card, optional low-emphasis level-up notice on `CelebrationScreen` (at or below the upgrade tease; "Territory claimed!" stays primary, per visual-design).
- First real SQLite migration in the project: after `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE den_economy ADD COLUMN xp REAL NOT NULL DEFAULT 0;` and `... level INTEGER NOT NULL DEFAULT 1;`, each try/caught for "duplicate column" (no `ADD COLUMN IF NOT EXISTS` in SQLite) so existing on-device rows keep working. Needs an on-device check.
- Code: `awardWalkXp` in `denEconomy.ts`, `xpForNextLevel`/`cumulativeXpForLevel`/`levelForXp`/`xpAwardForWalk` in `formulas.ts`, `xp`/`leveling` constants in `balanceConfig.ts`.
**Rejected:**
- Deriving Den Level from summed building levels, because spending (even passively accrued) treats would buy Level, reopening a pay/idle-to-win path around Phase 4 gates; a derived stat also cannot tell "walked a lot" from "spent efficiently".
- A 25-treat ding as the headline payoff, because the persistent moving number matters more.
- Beginner's Luck x2 XP for 30 days, because game-phases assigns it to Phase 4.
**Links:** docs/specs/den-economy.md; src/economy/formulas.ts; src/economy/denEconomy.ts; src/economy/balanceConfig.ts; src/storage/sqliteDenEconomyRepository.ts.

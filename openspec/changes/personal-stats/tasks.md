## 1. Core logic module

- [x] 1.1 Create `src/economy/personalStats.ts`: `PersonalStatsState` interface (`totalWalksClosed`, `lifetimeDistanceMeters`, `lifetimeTerritoryAreaM2`, `biggestTerritoryAreaM2`, `longestWalkDistanceM`, `totalTreatsEarnedLifetime`, `firstWalkAt`), `defaultPersonalStatsState()`.
- [x] 1.2 Add `AchievementId` type and the `ACHIEVEMENTS` catalog constant (18 entries: id, name, copyTitle, copyBody, per the table in design.md).
- [x] 1.3 Implement `recordWalkClosed(stats, walk): { stats, newlyUnlocked: AchievementId[] }` — updates walk/distance/area/biggest/longest stats, checks walk-count and territory-size achievements. Uses before/after crossing-detection on each monotonic counter so a threshold fires exactly once, with no extra "already unlocked" state needed.
- [x] 1.4 Implement `recordTreatsEarned(stats, amount): { stats, newlyUnlocked: AchievementId[] }` — increments `totalTreatsEarnedLifetime`, checks treat-threshold achievements. Call-site-agnostic (same function used for both walk-reward and passive-accrual treats).
- [x] 1.5 Implement `recordBuildingUpgrade(stats, before: DenEconomyState, after: DenEconomyState): { stats, newlyUnlocked: AchievementId[] }` — checks the building-level and Den-composition achievements (Moving In, Handy Homebody, Cozy Den). Signature takes both pre- and post-upgrade Den state (not just one) since crossing-detection needs both to tell "reached" from "already was at" a level.
- [x] 1.6 Unit tests for 1.3-1.5: each achievement's trigger fires exactly once at threshold, not before, not repeatedly after. 13 tests, all passing (`src/economy/__tests__/personalStats.test.ts`).

## 2. Storage

- [x] 2.1 Define `PersonalStatsRepository` interface (`getState`, `saveState`, `getUnlockedAchievements`, `unlockAchievements`) in `src/storage/PersonalStatsRepository.ts`, matching the shape of `DenEconomyRepository`.
- [x] 2.2 Implement `sqlitePersonalStatsRepository.ts`: `personal_stats` singleton-row table (one column per `PersonalStatsState` field) and `achievements` table (`id TEXT PRIMARY KEY, unlockedAt INTEGER NOT NULL`), `CREATE TABLE IF NOT EXISTS` on open, matching `sqliteDenEconomyRepository.ts`'s existing pattern. `unlockAchievements` uses `INSERT OR IGNORE` as a defensive backstop against double-unlocking the same id.
- [x] 2.3 Implement `inMemoryPersonalStatsRepository.ts` for tests, matching `inMemoryDenEconomyRepository.ts`'s pattern.
- [x] 2.4 Repository contract tests (mirroring `denEconomyRepository.contract.test.ts`): save/load round-trips for both state and achievements. 5 tests, all passing (`src/storage/__tests__/personalStatsRepository.contract.test.ts`).

## 3. Wiring into the app

- [x] 3.1 In `App.tsx`, instantiate `personalStatsRepository` alongside the existing `walkRepository`/`denEconomyRepository`.
- [x] 3.2 In `stopWalk()`, after `awardWalkTreats` succeeds: call `recordWalkClosed` then `recordTreatsEarned` (for the walk's treat reward), persist via `saveState`/`unlockAchievements`, thread the combined `newlyUnlocked` list into the `celebration` state object.
- [x] 3.3 In the passive-accrual `useEffect` (app load), after `applyPassiveAccrual`: call `recordTreatsEarned` for the accrued delta, persist, and surface any unlock via a Den-screen-style notice (see 4.2) rather than a celebration screen (no walk is in progress at app load). Threaded through a `pendingDenAchievements` App state array, passed to `DenScreen` and cleared once acknowledged.
- [x] 3.4 In `DenScreen`'s upgrade handler, after a successful `upgradeBuilding`: call `recordBuildingUpgrade`, persist, surface any unlock via the existing notice banner.
- [x] 3.5 Add a header entry point next to the existing Den button that opens the new `StatsScreen`.

## 4. UI

- [x] 4.1 Extend `CelebrationScreen`'s props with an optional `unlockedAchievements: AchievementId[]`; render a small badge banner (name + copy) below the existing tease box when non-empty.
- [x] 4.2 Extend `DenScreen` to accept and display achievement-unlock notices via its existing notice/message banner pattern (the one already used for treat storage overflow). Handles both upgrade-triggered unlocks (computed internally) and passive-accrual-triggered unlocks (passed down from App via a `pendingAchievements` prop + acknowledge callback).
- [x] 4.3 Build `StatsScreen.tsx`: a stat-card grid (total walks, lifetime distance, biggest territory, longest walk, lifetime treats earned, current Den levels) styled consistently with `DenScreen`'s card style, plus an achievement badge list (unlocked = full color + unlock date; locked = greyed with a progress hint, e.g. "10 walks — you're at 4"). Progress hints computed by a new `getAchievementProgress()` helper in `personalStats.ts`.

## 5. Wrap-up

- [x] 5.1 `npx tsc --noEmit` and `npx jest` both clean. 55 tests passing across 8 suites.
- [x] 5.2 Manual on-device check: verified with a new walk — closing it correctly recorded stats and unlocked achievements. Note: found and documented (design.md Risks) that pre-existing walks from before this change don't backfill into personal stats — declined to fix for now, revisit before wider rollout.
- [x] 5.3 Update `README.md`'s "What works" list and folder map to include the Stats screen and personal-stats module.

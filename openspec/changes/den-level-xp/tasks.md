## 1. Balance config and formulas

- [x] 1.1 Add `xp` and `leveling` blocks to `src/economy/balanceConfig.ts`: `xp: { perWalkBase: 20, perKm: 15, per1000m2: 5, areaCapM2: 20000 }`, `leveling: { xpBase: 100, xpGrowth: 1.13, maxLevel: 100, treatsPerLevelUp: 25 }`.
- [x] 1.2 Add pure functions to `src/economy/formulas.ts`: `xpAwardForWalk(distanceMeters, areaM2)` (applies the area cap), `xpForNextLevel(level)`, `cumulativeXpForLevel(level)`, `levelForXp(xp)` (clamped to `maxLevel`).
- [x] 1.3 Unit tests: `xpAwardForWalk` respects the area cap (a huge polygon yields the same XP as the cap value); `levelForXp`/`cumulativeXpForLevel` round-trip correctly at the worked levels (5, 10, 20, 30) from design.md; `levelForXp` never exceeds `maxLevel`. 15 tests passing.

## 2. Den economy state and logic

- [x] 2.1 Add `xp: number` and `level: number` to `DenEconomyState` in `src/economy/denEconomy.ts`; `defaultDenEconomyState` initializes both (`xp: 0, level: 1`).
- [x] 2.2 Implement `awardWalkXp(state, distanceMeters, areaM2): { state: DenEconomyState, leveledUp: boolean }` — computes XP via `xpAwardForWalk`, adds to `state.xp`, recomputes `level` via `levelForXp`; if `level` increased, also credits `BALANCE.leveling.treatsPerLevelUp` treats (capped by `storageCap`, same pattern as `awardWalkTreats`).
- [x] 2.3 Unit tests: XP accumulates correctly across multiple walks; a level-up correctly credits the flat treat bonus exactly once; treats bonus respects the storage cap; no XP/level change from `upgradeBuilding` or `applyPassiveAccrual`. 5 tests passing.

## 3. Storage migration

- [x] 3.1 In `sqliteDenEconomyRepository.ts`, after the existing `CREATE TABLE IF NOT EXISTS den_economy`, run `ALTER TABLE den_economy ADD COLUMN xp REAL NOT NULL DEFAULT 0;` and `ALTER TABLE den_economy ADD COLUMN level INTEGER NOT NULL DEFAULT 1;`, each wrapped to catch and ignore the "duplicate column" error (fresh installs where the table was just created with these columns already present).
- [x] 3.2 Update `rowToState`, the `INSERT`, and the `saveState` `ON CONFLICT` clause to read/write `xp`/`level`.
- [x] 3.3 Checked `inMemoryDenEconomyRepository.ts` — no change needed, it stores the full state object already.
- [ ] 3.4 ~~Repository contract test: an existing row saved without `xp`/`level` (simulate pre-migration state) still loads successfully after the migration runs, with `xp`/`level` defaulted.~~ **Infeasible in this test environment** — confirmed by probing: `expo-sqlite`'s native module isn't functionally mocked under `jest-expo` (`TypeError: _ExpoSQLite.default.NativeDatabase is not a constructor`), the same limitation hit earlier this session for `gps.ts`'s SQLite-backed debug log. No real `ALTER TABLE`/row-migration behavior can run in Jest here. Migration safety is verified manually instead, folded into task 6.2's on-device check (the app must load correctly against the existing on-device database, which predates the `xp`/`level` columns).

## 4. Wiring into the app

- [x] 4.1 In `App.tsx`'s `stopWalk()` closing block, after the existing treats-award and personal-stats recording, call `awardWalkXp` with the walk's `cumulativeDistance`/`polygon.area`, persist via `denEconomyRepository.saveState`, and thread `leveledUp` (plus the resulting level/xp) into the `celebration` state object.
- [x] 4.2 Add a compact "Lv. N" readout to the main map screen's persistent stats row (next to Distance/Points/Treats).

## 5. UI

- [x] 5.1 `DenScreen`: add a Level/XP progress bar (current level, progress toward next level) near the top of the screen, styled consistently with the existing card style. No reference to what unlocks at any future level. (No existing treats-balance readout was on this screen to anchor next to — placed as its own prominent-but-secondary section instead.)
- [x] 5.2 `StatsScreen`: add current Level/XP as one more stat card in the existing grid.
- [x] 5.3 `CelebrationScreen`: extend props with an optional `leveledUpTo: number | null`; when present, render a small level-up notice at or below the visual weight of the existing upgrade-tease box — never larger than the "Territory claimed!" headline or treats-earned line. Styled deliberately quieter than the tease box (plain muted text, no border/background) to stay clearly secondary.

## 6. Wrap-up

- [x] 6.1 `npx tsc --noEmit` and `npx jest` both clean. 67 tests passing across 8 suites.
- [ ] 6.2 Manual on-device check: confirm the app still loads correctly against the existing on-device database (migration safety); close a walk and confirm XP/Level updates in all four UI locations; force a level-up and confirm the flat treat bonus and notice both fire correctly without overshadowing the territory-claimed celebration. **Needs user — real device/emulator test, including migration safety against the existing save.**
- [x] 6.3 Annotate `openspec/changes/archive/2026-08-16-post-walk-celebration/design.md`'s Non-Goals line with a forward-pointer noting it's superseded by this change. Done before implementation started.
- [x] 6.4 Update `README.md`'s "What works" list and folder map, and the State Flow section, to include Den Level/XP.

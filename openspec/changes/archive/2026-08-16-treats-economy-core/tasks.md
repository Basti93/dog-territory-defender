## 1. Balance config and formulas

- [x] 1.1 Create `src/economy/balanceConfig.ts` with the `BALANCE` object from design.md.
- [x] 1.2 Create `src/economy/formulas.ts`: `upgradeCost`, `storageCap`, `passiveTreatsPerHour`, `softCapBonusPercent`.
- [x] 1.3 Unit test `formulas.ts`: cost increases per level and matches `costBase * costMult^(level-1)`; storage scales linearly with Doghouse level; passive rate scales linearly with Bakery level; soft cap is monotonically increasing, never exceeds `maxBonusPercent`, and is within a few percent of the cap by level 50.

## 2. Economy domain logic

- [x] 2.1 Create `src/economy/denEconomy.ts`: `DenEconomyState` type, `applyPassiveAccrual(state, now)`, `awardWalkTreats(state)`, `upgradeBuilding(state, building)`.
- [x] 2.2 Unit test `denEconomy.ts`: passive accrual adds the correct amount for a given elapsed time and caps at storage; awarding walk treats adds `treatsPerWalk` capped at storage; upgrading a building deducts the correct cost and increments its level; upgrading with insufficient treats returns an error and changes nothing; upgrading at `maxBuildingLevel` returns an error and changes nothing.

## 3. Storage

- [x] 3.1 Define `src/storage/DenEconomyRepository.ts`: the `DenEconomyRepository` interface (`getState`, `saveState`) and `DenEconomyState` re-export.
- [x] 3.2 Implement `src/storage/inMemoryDenEconomyRepository.ts` (in-memory fake, creates the default state — `startingTreats`, all buildings level 1, `lastTickAt: now` — on first `getState()`).
- [x] 3.3 Write contract tests for `DenEconomyRepository` against the in-memory fake: default state on first read; `saveState` persists across subsequent `getState` calls.
- [x] 3.4 Implement `src/storage/sqliteDenEconomyRepository.ts` on `expo-sqlite`, single row keyed `'singleton'`, schema from design.md.
- [x] 3.5 Manual on-device smoke check: earn treats, force-close/reopen the app, confirm the balance and passive accrual since close are both correct.

## 4. Wire into App.tsx

- [x] 4.1 On app load, read economy state, apply passive accrual for elapsed time, save, and display the current treats balance (simple header readout — no Den screen yet).
- [x] 4.2 In `stopWalk()`'s closing branch, award `treatsPerWalk` via the repository and fold the amount into the existing success alert.

## 5. Wrap-up

- [x] 5.1 Update `README.md`'s "What works" section.
- [x] 5.2 Log the decision in `DECISIONS.md`: config-driven balance numbers, passive-rate and soft-cap defaults being new/invented and where they live, single-row DynamoDB-shaped economy storage.

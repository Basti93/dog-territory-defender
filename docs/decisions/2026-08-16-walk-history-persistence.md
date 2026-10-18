# Walk history persistence (2026-08-16, shipped; history screen later removed)
**Why:** All walk data lived only in React state, so a reload or crash lost real GPS data. Storage also had to be a stable, independently testable module so later game features do not change the walk record's shape.
**Decisions:**
- Every walk is saved when it ends (Close Territory or End Walk); in-progress walk stays in React state; Cancel never persists.
- Engine `expo-sqlite` (first-party, atomic writes, worked in the then-current managed workflow; re-check if SDK changes).
- `WalkRepository` interface (`saveWalk`, `getWalks`, `getWalk`, `deleteWalk`) is the only access path. `saveWalk(walk: Walk)` takes the plain type; reads return `StoredWalk = Walk & { syncedAt: number | null }`, so `Walk` stays free of storage concerns while "new walks start unsynced" remains testable.
- Single DynamoDB-shaped table: `walks(id TEXT PRIMARY KEY, startTime INTEGER NOT NULL, closed INTEGER NOT NULL, syncedAt INTEGER, data TEXT NOT NULL)`. `startTime` (history order) and `closed` (badge) are real columns since they are the only queried attributes; `data` is the full Walk JSON body; `syncedAt` stays NULL until a future sync service (forward-compat only; no AWS work). JSON-string encoding is SQLite-specific, DynamoDB would store nested attributes natively.
- Layout `src/storage/`: `WalkRepository.ts`, `sqliteWalkRepository.ts`, `inMemoryWalkRepository.ts` (test fake), `__tests__/walkRepository.contract.test.ts`. Tests are contract tests against the in-memory fake (save/get/list order/cancelled not persisted); the SQLite adapter is kept a thin mechanical translation with a manual device smoke check, since native `expo-sqlite` is not unit-testable under Jest. This introduced `jest` + `jest-expo` (first test infra).
- `App.tsx` saves fire-and-forget with logged errors so storage never blocks the UI. History view was a toggled in-app screen (`showHistory` state), not a route, because there was no navigation library yet.
**Rejected:**
- Normalized relational schema (separate `locations` table), because nothing queries inside a walk's location list; adding it later is additive.
- react-navigation / tab bar here, because it was Phase 1 scope.
- Testing the real SQLite adapter, because faking the native binding would just test the fake.
**Superseded:** the history list screen was removed 2026-10-18 (postcards and the Album replaced it); the storage layer remains.
**Links:** `docs/specs/walk-storage.md`, `src/storage/`

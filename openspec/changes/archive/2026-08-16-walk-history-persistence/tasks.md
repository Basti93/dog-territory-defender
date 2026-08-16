## 1. Test infra

- [x] 1.1 Add `jest` + `jest-expo` as dev dependencies; add a `test` script to `package.json`.

## 2. Storage module

- [x] 2.1 Define `src/storage/WalkRepository.ts`: the `WalkRepository` interface (`saveWalk`, `getWalks`, `getWalk`, `deleteWalk`).
- [x] 2.2 Implement `src/storage/inMemoryWalkRepository.ts` (plain in-memory fake, same interface).
- [x] 2.3 Write `src/storage/__tests__/walkRepository.contract.test.ts` against the in-memory fake, covering: save-on-close persists; save-on-end-early persists as not-closed; cancelled walks never call save; `getWalks()` returns newest-first by `startTime`; `getWalk(id)` returns the right record or null; new walks have `syncedAt: null`.
- [x] 2.4 Implement `src/storage/sqliteWalkRepository.ts` on `expo-sqlite`: create-table-if-not-exists with the schema from design.md, implement all four methods.
- [x] 2.5 Manual on-device smoke check: save a walk, force-close/reopen the app, confirm `getWalks()` still returns it (per design.md, the SQLite adapter isn't unit-tested — this is the substitute check).

## 3. Wire into App.tsx

- [x] 3.1 Add `expo-sqlite` dependency (`npx expo install expo-sqlite`).
- [x] 3.2 Call `repository.saveWalk(walk)` at the end of `stopWalk()`'s closing branch.
- [x] 3.3 Call `repository.saveWalk(walk)` inside `endWalk()`.
- [x] 3.4 Confirm `resetWalk()` (Cancel) makes no repository call.

## 4. History view

- [x] 4.1 Create `WalkHistoryScreen` component: fetches `repository.getWalks()` on mount, renders a list (date/time, closed-vs-open indicator, point count) newest-first.
- [x] 4.2 Add the on-tone empty state for zero saved walks.
- [x] 4.3 Add a "View Past Walks" button in `App.tsx` that toggles rendering `WalkHistoryScreen` (no navigation library).

## 5. Wrap-up

- [x] 5.1 Update `README.md` (What Works, Architecture) to reflect persistence + history.
- [x] 5.2 Log the decision in `DECISIONS.md`: local `expo-sqlite`, single-table/DynamoDB-shaped schema, repository interface, deferred AWS sync via `syncedAt`.

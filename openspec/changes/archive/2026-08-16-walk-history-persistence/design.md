## Context

Today `Walk`/`AppState` live only in `App.tsx`'s `useState` — nothing survives a reload. There's no test setup in the repo at all (no `jest`, no `test` script). Phase 0 has no navigation library (tab nav is Phase 1 scope). See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Durable local storage that survives restarts, with a repository interface as the only access path.
- Local schema shaped like a future DynamoDB table (single-table, partition key + a few queryable attributes + item body), so the mental model transfers even though the storage engine underneath doesn't move 1:1.
- A history view that works without introducing a navigation library.
- The storage module testable in isolation from `App.tsx` and from any future game feature.

**Non-Goals:**
- No AWS/DynamoDB implementation or sync logic — only the forward-compat `syncedAt` field.
- No relational normalization (no separate `locations` table) — Phase 0/1 has no need to query inside a walk's location list.
- No react-navigation or tab bar — that's Phase 1 scope.

## Decisions

**Engine: `expo-sqlite`.** First-party Expo module, works inside Expo Go in this project's current managed workflow (no prebuild/dev-client needed) — consistent with how the project runs today. Gives real durability (atomic writes) instead of a KV blob.

**Schema: single table, DynamoDB-shaped.**
```sql
CREATE TABLE walks (
  id TEXT PRIMARY KEY,
  startTime INTEGER NOT NULL,
  closed INTEGER NOT NULL,
  syncedAt INTEGER,
  data TEXT NOT NULL
);
```
`id` is the partition key. `startTime` (history ordering) and `closed` (open/closed badge) are pulled out as real columns because they're the only two things ever queried on directly — mirrors how you'd choose top-level DynamoDB attributes vs. burying something in the item body. `data` holds the full `Walk` object JSON-encoded — the item body. `syncedAt` stays `NULL` until a future sync service exists. Note for later: DynamoDB stores nested attributes natively (no need to double-encode as a JSON string) — the *modeling* lesson here (PK + queryable top-level fields + a body) transfers, the string-encoding is a SQLite-specific detail that won't.

**`syncedAt` is visible on reads, not on writes.** `saveWalk(walk: Walk)` still takes the plain, storage-unaware `Walk` type used everywhere else in the app. `getWalks()`/`getWalk()` return `StoredWalk` (`Walk & { syncedAt: number | null }`) instead — keeps `Walk` itself free of storage concerns for `App.tsx`/game code, while still making "new walks start unsynced" an observable, testable fact through the repository (required by the `walk-storage` spec) instead of a column no caller can ever see.

**Module layout: `src/storage/`**, separate from `src/utils/` and `src/components/`:
- `src/storage/WalkRepository.ts` — the interface (`saveWalk`, `getWalks`, `getWalk`, `deleteWalk`), plus the `StoredWalk` type.
- `src/storage/sqliteWalkRepository.ts` — the `expo-sqlite` implementation.
- `src/storage/inMemoryWalkRepository.ts` — a plain-object fake implementing the same interface, used only in tests.
- `src/storage/__tests__/walkRepository.contract.test.ts` — one shared test suite run against the in-memory fake, asserting the interface's behavior (save/get/list-ordering/cancelled-not-persisted).

**Testing approach: contract tests against the in-memory fake, not the real SQLite adapter.** `expo-sqlite`'s native binding isn't meaningfully unit-testable under Jest/Node without extra native-module shimming. Instead: write the behavior contract once (matches the `walk-storage` spec's scenarios) and run it against `inMemoryWalkRepository`; this is what "the saved data always stays the same" is actually protecting — the interface's behavior, not SQLite internals. The real `sqliteWalkRepository` gets a manual on-device smoke check (task in tasks.md), not automated coverage, since faking that would just test the fake. This requires adding a test runner (`jest` + `jest-expo` preset) to the project — first test infra added here.

**`App.tsx` integration:** `stopWalk()` (closing branch) and `endWalk()` both call `repository.saveWalk(walk)` after updating state — fire-and-forget with a caught/logged error, so a storage hiccup never blocks the UI. `resetWalk()` (Cancel) does not call the repository — matches the "cancelled walks are not persisted" requirement, since nothing was ever saved for an in-progress, non-ended walk.

**History view: a toggled in-app screen, not a route.** A "View Past Walks" button flips local `showHistory` state in `App.tsx`, rendering a `WalkHistoryScreen` component that calls `repository.getWalks()` on mount. No navigation library — matches Phase 0/1's lack of tab nav; this can be swapped for a real route once Phase 1 adds navigation.

## Risks / Trade-offs

- [`expo-sqlite` could require a dev client in a future Expo SDK if dropped from Expo Go's bundled modules] → Not a concern at SDK 54; re-check if the project's SDK is bumped again.
- [In-memory fake and real SQLite adapter could silently drift in behavior] → Kept the SQLite adapter as a thin, mechanical translation of the interface (no extra logic beyond SQL statements), so a manual read-through is enough to catch drift; the contract tests are what actually pin behavior.
- [Single JSON-blob column loses the ability to query inside a walk's locations] → Accepted — no current requirement needs it; if one appears later, it's an additive schema change, not a rewrite.

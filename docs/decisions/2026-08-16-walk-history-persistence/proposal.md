## Why

All walk data lives only in React state today — a reload, crash, or app close loses it, including real GPS data from an actual dog walk. That's a real cost (not just a testing inconvenience) and it blocks a natural next step: letting the owner look back at past walks. It also needs to survive whatever game features land on top of it later (Phase 1's Den, Phase 2's scent layering, etc.) without the walk record itself changing shape every time — so the storage logic needs to be a stable, independently testable module, not scattered through `App.tsx`.

## What Changes

- New local persistence: every walk is saved as soon as it ends (closed via "Close Territory" or via "End Walk"), surviving app restarts.
- New `WalkRepository` interface (`saveWalk`, `getWalks`, `getWalk`, `deleteWalk`) — the only way any app code touches walk storage. Implemented locally on `expo-sqlite` now; swappable later without touching call sites.
- Local schema modeled single-table/NoSQL-style (walk id as key, a handful of queryable columns, full walk record as a JSON body) rather than a normalized relational schema, so it maps cleanly onto a future DynamoDB table instead of a relational rewrite.
- Schema includes a nullable `syncedAt` column, unused for now — forward-compat for a future AWS sync service (out of scope here; see design.md).
- New walk history view: a simple list of past walks (date, closed/open status, rough stats), reachable from the main screen. Phase 0 has no tab navigation yet (that's Phase 1 scope per `openspec/specs/game-phases/spec.md`), so this is a lightweight in-app view (e.g. a toggled screen/modal), not a new navigation library.
- `App.tsx`'s in-progress walk still lives in React state during an active walk (unchanged); on End Walk/Close Territory, it's additionally persisted via the repository.

## Capabilities

### New Capabilities
- `walk-storage`: durability and query guarantees for walk data — every ended walk is saved locally, survives restarts, is retrievable individually or as a list, and the storage schema stays forward-compatible with a future cloud sync.
- `walk-history`: the user-facing capability to view past walks — a list of previously recorded walks, ordered by recency, showing enough to identify each one.

### Modified Capabilities
(none — no existing spec'd capability's requirements change)

## Impact

- New dependency: `expo-sqlite`.
- New module (exact layout in design.md): a storage service directory holding the `WalkRepository` interface, its SQLite implementation, and its tests — kept separate from `App.tsx` and from any future game-feature code.
- `App.tsx`: calls the repository on walk end/close; adds a way to reach the new history view.
- `src/types.ts`: unchanged. `syncedAt` is exposed only on reads from the storage layer (`StoredWalk`, see design.md), not added to the core `Walk` type.
- No backend/AWS work in this change — local only, structured to make that swap easy later.

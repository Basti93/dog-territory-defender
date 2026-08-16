## Why

Mock/test walks and real walks are both persisted with no distinction (deliberate — mock walks are meant to fully emulate a real walk). There's currently no way to remove a walk once saved — `WalkRepository.deleteWalk(id)` exists but nothing calls it. This matters now specifically because test/mock territory (e.g. Berlin) sits alongside real territory on the idle map (`persistent-territory-view`), and there's no way to clean that up without wiping the whole local database.

## What Changes

- Add a delete action to `WalkHistoryScreen`: each row gets a way to remove that walk.
- Deleting a walk removes it from storage (`walkRepository.deleteWalk`) and from the list immediately; if it was closed with territory, it also stops appearing on the idle map's accumulated-territory view (which already re-fetches from storage, no extra wiring needed there).
- A confirmation step before deleting (destructive, not easily undoable) — a native confirm alert is enough, no need for a custom modal.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `walk-history`: adds a new requirement for deleting a walk from the list. Existing requirements (viewable, ordered, identified, empty-state) are unchanged.

## Impact

- `src/components/WalkHistoryScreen.tsx`: delete affordance per row, confirmation, calls `repository.deleteWalk`, updates local list state.
- No change to `WalkRepository`/storage layer — `deleteWalk` already exists and is already tested via the contract tests.

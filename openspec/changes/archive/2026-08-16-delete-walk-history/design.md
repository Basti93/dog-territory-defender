## Context

`WalkHistoryScreen` renders a flat `FlatList` of `StoredWalk`s fetched once on mount via `repository.getWalks()`, held in local `useState`. `MapView`'s idle-territory fetch (`persistent-territory-view`) only re-runs when its `[isReady, locations.length === 0, walkRepository]` effect dependencies change — returning from the history screen to the idle map doesn't change any of those (the app was already idle before opening history, and still is after closing it), so a deletion wouldn't be reflected on the map until some unrelated state change happened to trigger a re-fetch. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Delete a walk from the history list, with confirmation.
- The idle map's accumulated-territory view reflects a deletion as soon as you return to it — not stale until some unrelated action refreshes it.

**Non-Goals:**
- No swipe-to-delete gesture — a simple per-row button is enough for Phase 1's testing scale (a handful of walks).
- No bulk/multi-select delete.
- No "undo" — the confirmation step is the only safety net, matching the spec's "deletion is not undoable" framing.

## Decisions

**Per-row delete button + native `Alert.alert` confirmation.** Simplest implementation, no new dependency, matches the existing pattern of using `Alert.alert` elsewhere in the app (`App.tsx`'s error/success alerts). On confirm: `repository.deleteWalk(item.id)`, then update local `walks` state by filtering out that id (avoids a full re-fetch just to reflect one removal).

**Force the idle map to re-fetch territories when returning from history.** Add a `territoryRefreshKey` counter in `App.tsx`, incremented in `WalkHistoryScreen`'s `onClose` handler. Passed to `MapView` as a new prop, added to its territory-fetch `useEffect`'s dependency array. This guarantees a fresh fetch every time you return from the history screen, regardless of whether a deletion actually happened — simpler and more robust than trying to track "did a deletion occur" precisely, and cheap (one extra `getWalks()` call on an already-infrequent navigation action).

## Risks / Trade-offs

- [Refetching territories on every return from history, not just after an actual deletion] → Accepted — `getWalks()` against a local SQLite table with a handful of rows is cheap; not worth the complexity of precise dirty-tracking for this.

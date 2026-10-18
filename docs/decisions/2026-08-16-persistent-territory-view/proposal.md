## Why

Every closed walk's territory polygon is already persisted (`walk-storage`), but nothing ever shows the accumulated picture — the map only ever renders the walk currently in progress (or just-closed) via `appState.walk?.territory`; the moment a new walk starts or resets, the previous territory vanishes from view. This undercuts `visual-design`'s own Design North Star ("we belong here") and Success Criteria ("claiming territory feels like I made my mark on the neighborhood") — the mark disappears. Showing all previously claimed territory on the idle map (before a walk starts) is the cheapest, most spec-aligned lever for making the core loop feel rewarding: the data already exists, this is presentation only.

## What Changes

- When no walk is active (idle map screen), fetch closed walks from `walkRepository` and overlay every one's territory polygon on the map, auto-fit to show them all.
- While a walk is active, behavior is unchanged — the live trail and (once closed) that walk's own polygon still render as today; accumulated past territory is an idle-state addition, not shown mid-walk (keeps the active-walk screen uncluttered, matches "walk-in-progress state is obvious" intent).
- `visual-design`'s "Key Screen Intents" gains coverage for this idle state under the existing Map View entry (it currently only describes the active-walk state).
- **Not in this change:** scent-strength visual deepening, streaks, seasonal variation — those are Phase 2 ("Repetition Reward Loop"), explicitly out of Phase 1 scope. This change shows *what* was claimed, not layered repeat-visit rewards.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `visual-design`: "Key Screen Intents" — the Map View entry is extended to cover the idle (no active walk) state, which it currently doesn't address at all.

## Impact

- `src/components/MapView.tsx`: new prop or internal fetch for "all closed walks' territories" to render alongside (or instead of, when idle) the single active-walk territory.
- `src/web/mapHTML.ts`: needs to render multiple territory polygons, not just one — current `SHOW_TERRITORY` message/handler assumes a single polygon.
- `App.tsx`: fetch closed walks (via `walkRepository.getWalks()`) when idle, pass to `MapView`.
- No new persistence, no new dependency — `walk-storage`/`walk-history` already have everything needed.

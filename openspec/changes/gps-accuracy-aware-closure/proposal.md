## Why

Two related problems surfaced from real-walk testing: (1) every raw GPS fix gets plotted and used regardless of accuracy, so a single bad reading (observed: 205m accuracy while backgrounded, but poor-accuracy fixes happen foregrounded too — tree cover, urban canyon) produces visible trail jumps and can corrupt the closure/area calculation; (2) the closure condition's flat 20m radius doesn't account for real-world GPS accuracy (commonly ±10-25m even under decent conditions), so a walker who genuinely returned to their starting point can fail to close simply because two readings of "the same spot" landed 20-30m apart from ordinary noise. Both are about how the app *interprets* GPS fixes it receives, distinct from `background-location-tracking` (which is about whether fixes keep *arriving* at all).

## What Changes

- `Location` gains an `accuracy: number` field (meters, from `position.coords.accuracy`) — currently discarded entirely.
- `gps.ts` drops fixes below a configurable accuracy threshold before they ever reach the app (not appended to a walk's locations, not passed to the map) — bad fixes are filtered at the source, not displayed then corrected.
- `canCloseWalk`'s fixed 20m threshold becomes accuracy-aware: closure radius = the first and last points' own reported accuracy, summed, plus a small margin — tightens automatically under good conditions, loosens automatically under poor conditions, instead of one number that's wrong in both directions depending on circumstances.
- Both new numeric thresholds (accuracy-reject cutoff, closure margin) are new, not derived from any existing spec or prior number — flagged here for visibility, not silently chosen.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `walk-lifecycle`: the closure condition (embedded in "Walk can end without a closed loop") changes from a flat 20m radius to an accuracy-aware one.

## Impact

- `src/types.ts`: `Location` gains `accuracy: number`.
- `src/utils/gps.ts`: `getInitialLocation`/the location-update path drop low-accuracy fixes; populate `accuracy` on every `Location` produced.
- `src/utils/mockGps.ts`/`mockWalkFixtures.ts`: fixtures need an `accuracy` value per point (a small, good number — these are meant to simulate clean GPS) so they still satisfy the new closure formula.
- `src/utils/geometry.ts`: `canCloseWalk` takes accuracy into account for the start/end radius check.
- No change to `real-map-rendering`/`persistent-territory-view` — territory polygons don't carry accuracy, only the raw location trail does.

## Why

Phase 0's hypothesis is "GPS tracking on a real walk feels accurate and satisfying to replay" — nothing about that requires a closed loop. Right now "Cancel" is the only way to stop a walk that isn't closed, and it discards the entire trail. Real dog walks are rarely tidy loops (interruptions, out-and-back routes), so this makes the walking-skeleton feel more punishing than the hypothesis demands, and there's no way to test replay quality on an open/incomplete route. Separately, validating this on-device currently requires physically walking every time, which slows iteration.

## What Changes

- Add an **End Walk** action, distinct from **Cancel**: keeps the recorded trail and shows it as an open/unclosed walk (no polygon, no points/treats — Phase 0 has no economy yet). **Cancel** keeps its current discard-everything behavior.
- Add a **dev-only mock walk loader**: canned GPS coordinate sequences (one closed loop that satisfies `canCloseWalk`, one open/incomplete route) so the walk flow can be exercised without physically walking.
- Explicitly **out of scope**: treats, points, territory bonuses for unclosed walks, or any other Phase 1 economy — see `docs/04-engagement-mechanics.md`. That reward-split idea (any walk earns treats, closed loop additionally earns territory) is deferred, not built here.

## Capabilities

### New Capabilities
- `walk-lifecycle`: start/end/cancel semantics for a walk, including the open-vs-closed distinction and what state each terminal action preserves.
- `dev-mock-walk-data`: developer-only tooling to load canned GPS sequences in place of live `expo-location` tracking, for faster local testing.

### Modified Capabilities
(none yet — no existing `specs/` capabilities defined in this repo)

## Impact

- `App.tsx`: new `endWalk()` handler alongside existing `stopWalk()`/`resetWalk()`; UI gets an "End Walk" button next to "Cancel" when tracking and not yet closeable.
- `src/components/MapCanvas.tsx`: must render an open (unclosed) trail without a territory polygon — check it already degrades gracefully when `territory` is undefined (it does).
- `src/utils/gps.ts`: add a dev-only mock location source alternative to `startWatchingLocation`.
- New: canned coordinate fixtures (closed loop + open route) for the mock loader.
- No backend/persistence involved — still in-memory only, per current architecture.

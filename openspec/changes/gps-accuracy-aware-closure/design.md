## Context

`Location` (`src/types.ts`) currently carries only `latitude`, `longitude`, `timestamp` — `position.coords.accuracy` (available from every `expo-location` fix) is read in `src/utils/log.ts`'s `GPS_UPDATE` logging but never attached to the `Location` object itself, so nothing downstream (trail rendering, closure check, territory area) can use it. `canCloseWalk` (`src/utils/geometry.ts`) currently does `getDistance(...) < 20`. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Bad fixes (accuracy worse than a threshold) never reach the walk's location list at all — filtered at the source.
- Closure radius adapts to reported accuracy instead of one fixed number.
- `Location`'s new field is additive — nothing existing breaks from not knowing about it.

**Non-Goals:**
- Not smoothing/interpolating between fixes (Kalman filtering, sensor fusion) — accuracy-based rejection is a much simpler, adequate first step; revisit only if rejection alone proves insufficient.
- Not making the accuracy-reject threshold or closure margin user-configurable — fixed constants for now, same tunability posture as `src/economy/balanceConfig.ts`'s numbers (easy to find and change, not exposed in UI).
- Not touching territory-area calculation's precision — `calculatePolygonArea` already operates on whatever points made it into the polygon; filtering upstream is what improves its input, not the formula itself.

## Decisions

**`Location.accuracy: number`, populated everywhere a `Location` is constructed.** `src/utils/gps.ts` (`getInitialLocation`, the location-update path), `src/utils/mockGps.ts`/`mockWalkFixtures.ts` (fixtures get a small realistic accuracy value, e.g. `8`), and any other `Location` construction site.

**Accuracy-reject threshold: 30m, applied in `gps.ts` before a fix ever reaches the app.** A fix with `accuracy > 30` is logged (`log('GPS_FIX_REJECTED', { accuracy, lat, lon })`) and dropped — never appended to `walk.locations`, never shown on the map. Chosen against what's actually been observed this session: foregrounded fixes ranged ~9-25m (all should pass), the backgrounded-degradation case was ~205m (should reject). 30m gives headroom above normal noise while still catching genuinely bad fixes. New, not derived from any existing number — flagged per proposal.md.

**Closure radius: `firstAccuracy + lastAccuracy + 10` (meters).** Replaces the flat `20`. Under good conditions (e.g. both ~5-8m accuracy) this lands around 20-26m — close to the old fixed value, so today's already-working behavior doesn't regress. Under worse conditions it widens proportionally instead of just failing. The `+10` margin absorbs the fact that "accuracy" is a reported radius of uncertainty, not a hard bound — two points each accurate to their own reported radius can still legitimately be up to the sum of both radii apart even if they're "the same" real location; the margin gives a bit more slack than the theoretical minimum.

**`canCloseWalk`'s signature changes to accept `Location[]` (unchanged) but now reads `.accuracy` off the first/last elements** — no new parameter, since accuracy already travels with each point once the type change lands. Callers (`App.tsx`, `mockGps` test flows) don't need to change anything beyond ensuring their `Location`s carry real accuracy values.

## Risks / Trade-offs

- [30m reject threshold and 10m closure margin are both new, unvalidated numbers] → Isolated to easy-to-find constants (co-located with `canCloseWalk`/`gps.ts`), same posture as the economy's tunable numbers — cheap to retune after more real-walk testing.
- [Rejecting fixes at the source means a walk could end up with fewer points than expected in genuinely bad-signal conditions, potentially failing the ≥10-point closure requirement even for a real walk] → Accepted; a walk that can't get 10 usable fixes in poor GPS conditions genuinely shouldn't auto-close on bad data — `End Walk` remains available regardless.
- [Widening the closure radius under poor accuracy could, in principle, make accidental/near-miss closures slightly easier] → Bounded — the margin scales with genuinely-reported device uncertainty, not an arbitrary loosening; this is a data-quality correction, not a deliberate loosening of the game rule's intent.

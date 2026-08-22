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

**`Location.accuracy: number`, populated everywhere a `Location` is constructed.** `src/utils/gps.ts` (`getInitialLocation`, the location-update path) is the only construction site now that the dev mock-walk loader (`mockGps.ts`/`mockWalkFixtures.ts`) has been removed in favor of Android Emulator GPX playback — real `expo-location` fixes always carry `coords.accuracy`.

**Accuracy-reject threshold: 30m, applied in `gps.ts` before a fix ever reaches the app.** A fix with `accuracy > 30` is logged (`log('GPS_FIX_REJECTED', { accuracy, lat, lon })`) and dropped — never appended to `walk.locations`, never shown on the map. Chosen against what's actually been observed this session: foregrounded fixes ranged ~9-25m (all should pass), the backgrounded-degradation case was ~205m (should reject). 30m gives headroom above normal noise while still catching genuinely bad fixes. New, not derived from any existing number — flagged per proposal.md.

**Closure radius: `max(firstAccuracy + lastAccuracy + 10, 100)` (meters).** Replaces the flat `20`. Real device-in-hand testing (Android Emulator GPX playback, consistently good ~5m reported accuracy) still missed the old flat 20m threshold repeatedly — misses of 26m and even 18.7m arriving just after a reload wiped the walk — because a walker's actual return-to-start point rarely lands exactly on the first recorded fix, regardless of how good the GPS accuracy reading is; 1Hz sampling plus ordinary human path variance eats the gap. A pure accuracy-sum formula (`firstAccuracy + lastAccuracy + 10`) would land around 20-26m for typical 5-8m accuracy — barely different from the old flat value, and would not have fixed the observed near-misses. The `100` floor makes the common case (good accuracy) generously forgiving by default; the accuracy-sum term still takes over and widens further when accuracy is genuinely poor (e.g. two ~60m-accuracy fixes push the sum above 100). The `+10` margin on the accuracy-sum term absorbs the fact that "accuracy" is a reported radius of uncertainty, not a hard bound — two points each accurate to their own reported radius can still legitimately be up to the sum of both radii apart even if they're "the same" real location.

**`canCloseWalk`'s signature changes to accept `Location[]` (unchanged) but now reads `.accuracy` off the first/last elements** — no new parameter, since accuracy already travels with each point once the type change lands. `App.tsx` doesn't need to change beyond the type update.

## Risks / Trade-offs

- [30m reject threshold and 10m closure margin are both new, unvalidated numbers] → Isolated to easy-to-find constants (co-located with `canCloseWalk`/`gps.ts`), same posture as the economy's tunable numbers — cheap to retune after more real-walk testing.
- [Rejecting fixes at the source means a walk could end up with fewer points than expected in genuinely bad-signal conditions, potentially failing the ≥10-point closure requirement even for a real walk] → Accepted; a walk that can't get 10 usable fixes in poor GPS conditions genuinely shouldn't auto-close on bad data — `End Walk` remains available regardless.
- [The 100m floor is a deliberate loosening of the game rule's intent, not just a data-quality correction — a walker could now "close" a loop that's genuinely 5x looser than the original 20m design] → Accepted; real testing showed the tight 20m threshold produced repeated frustrating near-misses even under clean GPS, which hurts the core loop more than a generous closure radius does. Revisit downward if playtesting shows 100m makes territories feel too easy to claim.

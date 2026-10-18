# walk-lifecycle Specification

How a walk starts and ends (finished: trail preserved and painted into the Home Range, any shape, as long as it went anywhere; or discarded via Cancel), the no-movement rule, and the ground-covered floor that gates rewards.

## Painting
- Every live-GPS-tracked walk with movement paints the Home Range grid (see `den-economy`'s Home Range) from its recorded trail, regardless of whether start and end are near each other (a far-apart walk paints exactly like a loop).

## Finish and Cancel
- Exactly two terminal actions while a walk runs: **Finish Walk** (stops tracking, saves the trail, paints its cells regardless of shape, evaluates reward eligibility; no-movement walks excepted, see below) and **Cancel** (discards the walk: no trail, no Home Range effect).
- Cancel is reachable from a calm "Runde abbrechen" link under the Finish button on the live map and a small "abbrechen" link under the scene's gate sign.
- Cancelling a walk that has moved asks once ("Runde verwerfen? Diese Runde wird nicht gespeichert." with "Verwerfen" and "Weiterlaufen"); "Weiterlaufen" leaves the walk running untouched. A walk without movement is cancelled without the question.
- Cancel stops GPS and the foreground service, clears the stored active walk, closes the live presence (`ended: true`), and leaves rewards, stats and walk count untouched (no trail shown). Afterwards the player is on the scene and Buddy may say one friendly line ("Dann eben später!"); no wording blames the player.
- While a walk runs, the gate sign reads "Zur Runde" and opens the live map (tapping sign or gate starts no second walk). Only the gate and its sign start a walk; tapping Buddy never does (it only barks).

## A walk that went nowhere leaves no record
- A tracked walk has no movement when (a) every fix lies within 40 m of the first fix (largest haversine distance from the start under 40 m, however far the fixes sum up: GPS jitter around a standing phone; e.g. 20 minutes of +-15 m noise summing to hundreds of metres is still no walk), or (b) its walked distance (`walkDistanceMeters`) is under 50 m AND it paints fewer than 13 Home Range cells.
- Rule: `walkHasMovement` in `src/utils/geometry.ts`; constants `NO_MOVEMENT_RADIUS_M`, `NO_MOVEMENT_MAX_DISTANCE_M`, `NO_MOVEMENT_CELLS_BELOW` in `src/utils/grid.ts`.
- Such a walk is not saved: no walk record, route, Home Range cells, stats, reward, `walk.upload` or homecoming.
- Finish Walk: closed like a cancel, player lands on the scene, Buddy says "Noch keine Strecke, nichts zu speichern." Auto-finish (still for 20 minutes, or back home) and cold-start restore: discarded quietly.
- Tracked walks only; a manually logged walk has no fixes by design and is never judged by it (saved and rewarded as before).
- Why: a mistaken start or standing phone used to leave an empty record that counted as a walk. The cell half is calibrated to the paint footprint: a walk that never leaves one spot paints about 5 cells (25 m paint radius on 20 m cells), 50 m of walking about 12, so a floor of 2 could never hold; 13 means "less ground than 50 m of walking paints" and only backs up the distance test.

## Reward eligibility is ground covered
- Treats, XP and any territory-derived bonus for a live-tracked walk only when it paints at least 25 Home Range cells (~200m of real ground), whatever its shape or start/end proximity. This replaces the old loop-closure gate (>=10 points AND start-end distance under a closure radius).
- A walk with movement but fewer than 25 cells is still saved and paints its cells, but gets no reward (none granted or displayed).

## Walked distance counts only plausible steps
- A step between consecutive fixes counts only if (normal) at most 60 m AND at most 4.5 m/s (same limits as the Home Range paint filter), or (dropout bridge) more than 60 m and at most 250 m, within 180 s, at an average of at most 2.0 m/s. A step with missing, zero or negative time difference counts only if at most 60 m.
- Examples: a 3 km step in 60 s (tram) adds nothing; a fix 150 m away and 100 s later (1.5 m/s) counts and the trail stays connected.
- Constants in `src/utils/grid.ts`: `MAX_SEGMENT_M`, `MAX_SEGMENT_SPEED_MS`, `DROPOUT_BRIDGE_MAX_M`, `DROPOUT_BRIDGE_MAX_S`, `DROPOUT_BRIDGE_MAX_SPEED_MS`; rule `stepCountsAsDistance` in `src/utils/geometry.ts`.
- Live distance, finished distance (rewards, personal stats, Walk Portrait) and the server all use the one function `walkDistanceMeters`, so they never disagree.
- Silent: the app never shows that part of a walk was not counted. The trail line is cut wherever a step fails the rule, so no straight line crosses a jump, ride or long signal loss (`splitAtGaps`; tested web copy in `src/web/gapSplitScript.ts`).
- Why: GPS jumps, tram/car rides and the gap after an iOS force-quit used to inflate distance, XP and lifetime/weekly kilometres. The bridge keeps honest signal losses (tunnel, underpass, sleeping phone) from costing a fair walk its distance: such a gap is short and crossed at a stroll, a ride is fast or far.
- Not retroactive: a walk that started before 2026-10-18 19:35 UTC (`DISTANCE_RULE_SINCE_MS`) keeps the old unfiltered distance (`cumulativeDistanceLegacy`) wherever distance is recomputed from points (Walk Portrait, prior-walk XP average, server weekly kilometres). Stored lifetime stats are incremental and never recomputed. No stat, record or badge may ever go down because of this rule.

## Manual logging
- A walk that was not live-tracked can be logged if it started within the current or previous calendar day (earlier: rejected). It creates a Walk record with no location trail, tagged as manually logged, and grants the identical reward (treats, XP, personal stats, achievements) as a finished tracked walk, with no reduced or "unverified" treatment.
- A manual log may optionally refresh the Home Range freshness of one route previously walked with real GPS tracking. Hard cap: at most 2 manual logs per local calendar day, at most 1 of them with a route refresh. A third is rejected; a second is accepted and rewarded but offers/applies no route refresh.

## Start source
- Every Walk record stores how it came to exist (live-tracked via Start Walk, or manually logged), so the two can be told apart in storage.

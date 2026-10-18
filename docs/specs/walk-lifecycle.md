# walk-lifecycle Specification

## Purpose

Defines how a walk starts and how it can end — finished (preserving and painting the trail into the Home Range, regardless of shape, as long as the walk went anywhere) or discarded via Cancel — the no-movement rule (a walk that went nowhere leaves no record), and the ground-covered floor that gates whether a finished walk earns a reward.

## Requirements

### Requirement: Every Tracked Walk Extends the Home Range
The system SHALL paint the Home Range grid (see `den-economy`'s Home Range requirements) from every live-GPS-tracked walk's recorded trail that has movement (see `A Walk That Went Nowhere Leaves No Record`), regardless of whether the walk's start and end points are near each other.

#### Scenario: A walk that never returns near its start still paints the Range
- **WHEN** a live-tracked walk is finished and its start and end points are far apart
- **THEN** the cells along its recorded trail SHALL be painted into the Home Range exactly as they would be for a walk that returns to its start

### Requirement: Finish Walk Replaces Close Territory and End Walk
The system SHALL offer exactly two terminal actions while a walk is in progress: Finish Walk, which preserves the recorded trail, paints it into the Home Range and evaluates reward eligibility (see `Reward Eligibility Is Ground Covered, Not Loop Closure`) — unless the walk has no movement (see `A Walk That Went Nowhere Leaves No Record`); and Cancel, which discards the walk entirely with no retained trail and no Home Range effect.

Cancel SHALL be reachable from both places a walk is visible: a calm "Runde abbrechen" link under the Finish button on the live map, and a small "abbrechen" link under the scene's gate sign. Cancelling a walk that has moved asks once ("Runde verwerfen? Diese Runde wird nicht gespeichert." with "Verwerfen" and "Weiterlaufen"); a walk without movement is cancelled without the question. Cancel stops GPS and the foreground service, clears the stored active walk, closes the live presence (`ended: true`), and leaves rewards, stats and the walk count untouched. Afterwards the player is back on the scene and Buddy may say one friendly line ("Dann eben später!"); no wording blames the player.

While a walk runs, the scene's gate sign reads "Zur Runde" and opens the live map; it SHALL NOT start a second walk. Only the gate and its sign start a walk; tapping Buddy never does (it only barks).

#### Scenario: Finishing a walk preserves and paints the trail
- **WHEN** the user finishes an in-progress walk that has movement
- **THEN** tracking stops, the recorded trail is retained and saved, and its cells are painted into the Home Range, regardless of the walk's shape

#### Scenario: Cancel discards everything
- **WHEN** the user cancels the walk while tracking (after confirming "Verwerfen" if the walk has moved)
- **THEN** the walk record is cleared, no trail is shown, the stored active walk is removed, and the Home Range, rewards, stats and walk count are unaffected

#### Scenario: Cancel asks once, and "Weiterlaufen" changes nothing
- **WHEN** the user taps a cancel link on a walk that has moved, then "Weiterlaufen"
- **THEN** the walk keeps running untouched

#### Scenario: The gate sign during a walk goes back to the walk
- **WHEN** a walk is running and the user taps the gate sign (or the gate)
- **THEN** the live map opens and no new walk is started

### Requirement: A Walk That Went Nowhere Leaves No Record
The system SHALL treat a tracked walk as having no movement when either (a) every fix lies within 40 m of the walk's first fix (the largest haversine distance from the start is under 40 m, however far the fixes sum up: GPS jitter around a phone left standing), or (b) its walked distance (`walkDistanceMeters`) is under 50 m AND it paints fewer than 13 Home Range cells; the pure rule is `walkHasMovement` in `src/utils/geometry.ts` and the thresholds are the named constants `NO_MOVEMENT_RADIUS_M`, `NO_MOVEMENT_MAX_DISTANCE_M` and `NO_MOVEMENT_CELLS_BELOW` next to the other walk constants in `src/utils/grid.ts`. A tracked walk without movement SHALL NOT be saved: no walk record, no route, no Home Range cells, no stats, no reward, no `walk.upload`, no homecoming. This holds for every way a tracked walk ends: Finish Walk (the walk is closed like a cancel, the player lands on the scene and Buddy says "Noch keine Strecke, nichts zu speichern."), auto-finish (still for 20 minutes or back home: discarded quietly) and the cold-start restore (discarded quietly). The rule applies to tracked walks only; a manually logged walk has no fixes by design and is never judged by it.

Why: a walk started by mistake (or a phone left standing) used to leave an empty record that counted as a walk and cluttered the history. The cell half is calibrated to the paint footprint: a walk that never leaves one spot already paints about 5 cells (25 m paint radius on 20 m cells) and 50 m of walking about 12, so a floor of 2 could never hold; 13 means "less ground than 50 m of walking paints" and only backs up the distance test.

#### Scenario: Finish on a walk that never moved
- **WHEN** the user taps Finish on a walk with under 50 m walked and fewer than 13 painted cells, or whose fixes all stay within 40 m of the start
- **THEN** nothing is saved or uploaded, no homecoming plays, the walk is closed like a cancel, and Buddy says there is no route to save yet

#### Scenario: Standing still with GPS jitter is no walk
- **WHEN** 20 minutes of +-15 m GPS noise around one spot sum to hundreds of metres of walked distance
- **THEN** the walk still has no movement (every fix is within 40 m of the first) and is discarded

#### Scenario: Auto-finish and restore discard such a walk
- **WHEN** auto-finish (20 minutes still, or home) or the cold-start restore would end a walk that has no movement
- **THEN** the walk is discarded without a note and nothing is saved

#### Scenario: A manual log is unaffected
- **WHEN** the player logs a missed walk
- **THEN** it is saved and rewarded as before, with no fixes

### Requirement: Reward Eligibility Is Ground Covered, Not Loop Closure
The system SHALL grant treats, XP, and any territory-derived bonus for a live-tracked walk only when that walk paints at least 25 Home Range cells (~200m of real ground covered), replacing the previous loop-closure gate (≥10 points AND start↔end distance under a closure radius). A walk that has movement but paints fewer than 25 cells SHALL still be saved and SHALL still paint whatever cells it touched, but SHALL receive no reward.

#### Scenario: A short walk paints but earns nothing
- **WHEN** a finished walk paints fewer than 25 Home Range cells
- **THEN** the walk is saved and its cells are painted, but no treats, XP, or bonus is granted or displayed

#### Scenario: A qualifying walk earns its reward regardless of shape
- **WHEN** a finished walk paints 25 or more Home Range cells
- **THEN** the system SHALL grant the full treats/XP reward, whether or not the walk's start and end points are near each other

### Requirement: Walked Distance Counts Only Plausible Steps
The system SHALL count a step between two consecutive GPS fixes toward a walk's distance only if it is plausibly walked: either (normal) at most 60 m AND at most 4.5 m/s, the same limits the Home Range paint filter uses; or (dropout bridge) more than 60 m and at most 250 m, within 180 s, at an average of at most 2.0 m/s. A step with a missing, zero or negative time difference counts only if it is at most 60 m. The thresholds are named constants next to the paint filter in `src/utils/grid.ts` (`MAX_SEGMENT_M`, `MAX_SEGMENT_SPEED_MS`, `DROPOUT_BRIDGE_MAX_M`, `DROPOUT_BRIDGE_MAX_S`, `DROPOUT_BRIDGE_MAX_SPEED_MS`); the rule itself is `stepCountsAsDistance` in `src/utils/geometry.ts`. The live map's distance, the finished walk's distance (rewards, personal stats, Walk Portrait) and the server SHALL all use the one function `walkDistanceMeters`, so they never disagree. The rule SHALL be silent: the app never shows that part of a walk was not counted. A walk's trail line SHALL be cut wherever a step fails the rule, so no straight line is drawn across a jump, a ride or a long signal loss (`splitAtGaps`; the web pages carry a tested copy in `src/web/gapSplitScript.ts`).

Why: before this, every step counted, so a GPS jump, a tram or car ride during a running walk, or the gap after an iOS force-quit inflated distance, XP and the lifetime and weekly kilometres. The dropout bridge keeps honest signal losses (a tunnel, an underpass, a phone that slept) from costing a fair walk its distance: such a gap is short and was crossed at a stroll, while a ride is fast or far.

Not retroactive: a walk that started before 2026-10-18 19:35 UTC (`DISTANCE_RULE_SINCE_MS`) keeps the old unfiltered distance (`cumulativeDistanceLegacy`) wherever a distance is recomputed from its points (Walk Portrait, prior-walk XP average, server weekly kilometres). Stored lifetime stats are incremental and are never recomputed. No stat, record or badge may ever go down because of this rule.

#### Scenario: A tram ride during a walk adds no distance
- **WHEN** a walk started after the rule shipped contains a step of 3 km covered in 60 s
- **THEN** that step adds nothing to the walk's distance, the live distance, rewards or personal stats, and nothing tells the player so

#### Scenario: A short signal loss at walking pace still counts
- **WHEN** a walk's next fix is 150 m away and 100 s later (1.5 m/s)
- **THEN** the step counts as distance and the trail line stays connected across it

#### Scenario: An old walk keeps its distance
- **WHEN** a walk that started before the rule shipped is opened or recomputed
- **THEN** its distance is the unfiltered sum of all its steps, exactly as before

### Requirement: Walk can be logged manually without live GPS tracking
The system SHALL allow the player to record a walk that was not live-tracked, provided it started within the current or previous calendar day, and SHALL grant the identical reward (treats, XP, personal stats, achievements) a normally-finished tracked walk receives, with no reduced or "unverified" treatment. A manual log MAY optionally refresh the Home Range freshness of one route the player has previously walked with real GPS tracking, subject to a hard cap of at most 2 manual logs per calendar day, of which at most 1 may carry a route refresh.

#### Scenario: Logging a walk from earlier today or yesterday
- **WHEN** the player logs a missed walk that started within the current or previous calendar day
- **THEN** a Walk record is created with no location trail, tagged as manually logged, and the full treats/XP/personal-stats rewards are granted exactly as for a normally finished tracked walk

#### Scenario: Logging window exceeded
- **WHEN** the player attempts to log a missed walk that started before the previous calendar day
- **THEN** the system SHALL reject the entry

#### Scenario: A third manual log in one calendar day is rejected
- **WHEN** the player attempts a third manual log on the same local calendar day
- **THEN** the system SHALL reject the entry

#### Scenario: A second manual log in one calendar day cannot carry a route refresh
- **WHEN** the player has already used their one route refresh for the current calendar day and attempts a second manual log
- **THEN** the second manual log SHALL still be accepted and rewarded, but SHALL NOT offer or apply a route refresh

### Requirement: Walk records distinguish how they were started
The system SHALL tag every Walk record with how it came to exist — live-tracked via the Start Walk button, or manually logged — so tracked and manually-logged walks can be told apart in storage.

#### Scenario: Start source recorded
- **WHEN** a Walk record is created, whether via live tracking or manual logging
- **THEN** the record SHALL store which of the two methods created it

Note for whoever applies this delta: this retires the loop-closure concept (`canCloseWalk`, the polygon) entirely, per `design.md`'s "Technical Split Addendum". The three-button model (Close Territory / End Walk / Cancel) becomes two (Finish Walk / Cancel). Reward eligibility moves from "≥10 points AND start↔end within ~100m" to "≥25 painted grid cells (~200m walked, any shape)" — a deliberate loosening, logged per `CLAUDE.md` rule 6, since the return-to-start requirement was only ever an artifact of the shoelace-polygon math, not a design intent.

## REMOVED Requirements

### Requirement: Walk can end without a closed loop
**Reason**: There is no longer a "closed loop" concept to end without reaching — every GPS-tracked walk paints the Home Range grid regardless of its shape (see `Every Tracked Walk Extends the Home Range` below), so the distinction this requirement drew (open vs. closed) no longer describes anything.
**Migration**: See `Every Tracked Walk Extends the Home Range` and `Reward Eligibility Is Ground Covered, Not Loop Closure` below.

### Requirement: End Walk is distinct from Cancel
**Reason**: The two-way split this requirement described (End Walk vs. the closure-gated Close Territory action) collapses to one terminal action (Finish Walk) now that closure computes nothing. Cancel remains distinct from it.
**Migration**: See `Finish Walk Replaces Close Territory and End Walk` below.

### Requirement: No rewards for open walks in Phase 0
**Reason**: Superseded by `Reward Eligibility Is Ground Covered, Not Loop Closure` below, which replaces the Phase-0-era "closed loop" gate with a ground-covered gate. Phase 0 itself is long past; this requirement's "no economy yet" framing no longer applies (Phase 1's economy has shipped).
**Migration**: See `Reward Eligibility Is Ground Covered, Not Loop Closure` below.

### Requirement: Closed walks unaffected
**Reason**: Describes preserving polygon-closure behavior that this change deletes; nothing to preserve.
**Migration**: N/A.

## ADDED Requirements

### Requirement: Every Tracked Walk Extends the Home Range
The system SHALL paint the Home Range grid (see `den-economy`'s Home Range requirements) from every live-GPS-tracked walk's recorded trail, regardless of whether the walk's start and end points are near each other.

#### Scenario: A walk that never returns near its start still paints the Range
- **WHEN** a live-tracked walk is finished and its start and end points are far apart
- **THEN** the cells along its recorded trail SHALL be painted into the Home Range exactly as they would be for a walk that returns to its start

### Requirement: Finish Walk Replaces Close Territory and End Walk
The system SHALL offer exactly two terminal actions while a walk is in progress: Finish Walk, which always preserves the recorded trail, always paints it into the Home Range, and evaluates reward eligibility (see `Reward Eligibility Is Ground Covered, Not Loop Closure`); and Cancel, which discards the walk entirely with no retained trail and no Home Range effect.

#### Scenario: Finishing a walk always preserves and paints the trail
- **WHEN** the user finishes an in-progress walk
- **THEN** tracking stops, the recorded trail is retained and saved, and its cells are painted into the Home Range, regardless of the walk's shape

#### Scenario: Cancel discards everything
- **WHEN** the user cancels the walk while tracking
- **THEN** the walk record is cleared, no trail is shown, and the Home Range is unaffected

### Requirement: Reward Eligibility Is Ground Covered, Not Loop Closure
The system SHALL grant treats, XP, and any territory-derived bonus for a live-tracked walk only when that walk paints at least 25 Home Range cells (~200m of real ground covered), replacing the previous loop-closure gate (≥10 points AND start↔end distance under a closure radius). A walk that paints fewer than 25 cells SHALL still be saved and SHALL still paint whatever cells it touched, but SHALL receive no reward.

#### Scenario: A short walk paints but earns nothing
- **WHEN** a finished walk paints fewer than 25 Home Range cells
- **THEN** the walk is saved and its cells are painted, but no treats, XP, or bonus is granted or displayed

#### Scenario: A qualifying walk earns its reward regardless of shape
- **WHEN** a finished walk paints 25 or more Home Range cells
- **THEN** the system SHALL grant the full treats/XP reward, whether or not the walk's start and end points are near each other

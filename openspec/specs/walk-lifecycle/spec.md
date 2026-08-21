# walk-lifecycle Specification

## Purpose

Defines how a walk starts and how it can end — closed into territory, ended early as an open trail, or discarded — so Phase 0's GPS/replay hypothesis can be tested even when a walk isn't a closed loop.

## Requirements

### Requirement: Walk can end without a closed loop
The system SHALL allow the user to end an in-progress walk before it satisfies the closure condition (at least 10 recorded points AND straight-line distance between the first and last point under 20m), preserving the recorded trail as an open, unclosed walk.

#### Scenario: Ending a walk that hasn't closed
- **WHEN** the user ends the walk while tracking and the walk has not yet met the closure condition
- **THEN** tracking stops, the recorded locations are retained, the walk is marked as not closed with no territory polygon, and the trail remains visible on the map

### Requirement: End Walk is distinct from Cancel
The system SHALL offer two separate terminal actions while a walk is not yet closeable: one that discards the walk entirely (no retained trail), and one that always preserves the recorded trail regardless of closure state.

#### Scenario: Cancel discards everything
- **WHEN** the user cancels the walk while tracking
- **THEN** the walk record is cleared and no trail is shown

#### Scenario: Ending preserves the trail
- **WHEN** the user ends the walk while tracking, whether or not it has closed
- **THEN** the recorded trail remains visible after tracking stops

### Requirement: No rewards for open walks in Phase 0
The system SHALL NOT grant treats, points, or any territory bonus for an open, unclosed walk, since Phase 0 has no economy.

#### Scenario: Ending early awards nothing
- **WHEN** a walk is ended without meeting the closure condition
- **THEN** no reward, points, or treats are granted or displayed

### Requirement: Closed walks unaffected
The system SHALL preserve existing behavior for walks that do satisfy the closure condition.

#### Scenario: Closing works as before
- **WHEN** the user closes the walk and it satisfies the closure condition
- **THEN** the walk is marked closed with a computed territory polygon, matching current behavior

### Requirement: Walk can be logged manually without live GPS tracking
The system SHALL allow the player to record a walk that was not live-tracked, provided it started within the current or previous calendar day, and SHALL grant the identical reward (treats, XP, personal stats, achievements) a normally-closed tracked walk receives, with no reduced or "unverified" treatment.

#### Scenario: Logging a walk from earlier today or yesterday
- **WHEN** the player logs a missed walk that started within the current or previous calendar day
- **THEN** a Walk record is created with no location trail or territory polygon, tagged as manually logged, and the full treats/XP/personal-stats rewards are granted exactly as for a closed tracked walk

#### Scenario: Logging window exceeded
- **WHEN** the player attempts to log a missed walk that started before the previous calendar day
- **THEN** the system SHALL reject the entry

### Requirement: Walk records distinguish how they were started
The system SHALL tag every Walk record with how it came to exist — live-tracked via the Start Walk button, or manually logged — so tracked and manually-logged walks can be told apart in storage.

#### Scenario: Start source recorded
- **WHEN** a Walk record is created, whether via live tracking or manual logging
- **THEN** the record SHALL store which of the two methods created it

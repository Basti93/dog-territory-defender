## ADDED Requirements

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

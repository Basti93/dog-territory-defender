## MODIFIED Requirements

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

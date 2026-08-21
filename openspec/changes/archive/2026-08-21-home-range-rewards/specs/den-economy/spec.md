## ADDED Requirements

### Requirement: Fresh Ground Payout Rewards Returning to Wilder Ground
The system SHALL apply a treats-only multiplier to a walk's payout, scaled by the mean freshness of the Home Range cells it painted, so that returning to ground that hasn't been walked recently pays more than repeating a route walked yesterday. This multiplier SHALL NOT apply to XP. It SHALL be suppressed (no bonus, no display) for any walk that paints fewer than the Home Range's qualifying-walk cell floor.

#### Scenario: A wilder walk pays more treats
- **WHEN** a qualifying walk covers ground that has not been walked recently
- **THEN** its treats payout SHALL be higher than an otherwise-identical walk over ground walked the day before

#### Scenario: The multiplier never applies to XP
- **WHEN** a walk's Fresh Ground multiplier is computed
- **THEN** it SHALL be applied only to the walk's treats payout, never to its XP award

#### Scenario: A short walk gets no multiplier
- **WHEN** a walk paints fewer cells than the Home Range's qualifying-walk floor
- **THEN** no Fresh Ground multiplier SHALL be applied or displayed

### Requirement: Manual-Log Route Refresh Cannot Discover Ground or Choose Its Own Payout
The system SHALL allow a manually logged walk to optionally refresh the freshness of a route the player has previously walked with live GPS tracking, subject to a fixed cap of one route refresh per calendar day. A manual-log refresh SHALL always pay the same fixed Fresh Ground multiplier regardless of which route is selected or how wild that route actually is, and SHALL NOT extend the Home Range's Range (only cells already in the Range, by construction, are eligible to be refreshed).

#### Scenario: Refresh payout does not depend on the route picked
- **WHEN** a manual log refreshes a previously tracked route
- **THEN** the Fresh Ground multiplier it earns SHALL be the same fixed value regardless of which eligible route was selected

#### Scenario: A manual log cannot extend the Range
- **WHEN** a manual log refreshes a route
- **THEN** no cell outside the player's existing Range SHALL be added as a result

#### Scenario: Refresh is capped
- **WHEN** the player has already refreshed a route once on the current calendar day
- **THEN** no further route refresh SHALL be available until the next calendar day

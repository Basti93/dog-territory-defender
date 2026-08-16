## Purpose

Gives developers a way to exercise the walk-tracking flow using canned GPS coordinate sequences instead of live device location, so the walk lifecycle can be tested repeatedly without physically walking.

## ADDED Requirements

### Requirement: Mock closed-loop walk fixture
The system SHALL provide a canned sequence of at least 10 locations, replayed in place of live location tracking, whose first and last points are within 20m of each other, so the closure path can be exercised on demand.

#### Scenario: Loading the mock closed-loop walk
- **WHEN** a developer triggers the mock closed-loop walk
- **THEN** the app receives the canned sequence and reaches a state where the walk satisfies the closure condition

### Requirement: Mock open walk fixture
The system SHALL provide a second canned sequence representing an open, incomplete walk that does not satisfy the closure condition, so the End Walk path can be exercised on demand.

#### Scenario: Loading the mock open walk
- **WHEN** a developer triggers the mock open walk
- **THEN** the app receives the canned sequence and the walk does not satisfy the closure condition

### Requirement: Mock data unreachable in production
The system SHALL ensure the mock walk loader and any UI trigger for it are gated behind a development-only condition and are not reachable in a production build.

#### Scenario: Production build has no mock trigger
- **WHEN** the app runs as a production build
- **THEN** no UI element or code path can invoke the mock walk loader

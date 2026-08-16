## Purpose

Lets the user look back at walks they've previously recorded, so a walk isn't only visible in the moment it happens.

## ADDED Requirements

### Requirement: Past walks are viewable
The system SHALL provide a way for the user to view a list of their previously saved walks from the main screen.

#### Scenario: Opening the history view
- **WHEN** the user navigates to the walk history view
- **THEN** every saved walk is listed

### Requirement: History is ordered by recency
The system SHALL order the walk history list with the most recently started walk first.

#### Scenario: Newest walk appears first
- **WHEN** the user has multiple saved walks
- **THEN** the most recently started walk appears at the top of the list

### Requirement: Each entry identifies the walk
The system SHALL show, for each walk in the history list, enough information to distinguish it from others: at minimum its date/time and whether it was closed into territory or ended early.

#### Scenario: Distinguishing closed from open walks
- **WHEN** the history list is displayed
- **THEN** each entry indicates whether that walk was closed into territory or was an open/unclosed walk

### Requirement: Empty history is handled gracefully
The system SHALL show a clear, on-tone empty state when no walks have been saved yet, rather than a blank or broken screen.

#### Scenario: No walks saved yet
- **WHEN** the user opens the history view before ever completing or ending a walk
- **THEN** a friendly empty-state message is shown instead of an empty list

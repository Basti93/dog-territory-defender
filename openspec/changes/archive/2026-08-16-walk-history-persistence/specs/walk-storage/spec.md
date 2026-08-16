## Purpose

Guarantees that a walk's data survives beyond the current app session — every walk the user ends is durably saved locally, retrievable individually or as a full history, and stored in a way that stays forward-compatible with a future cloud sync.

## ADDED Requirements

### Requirement: Walks are saved on end
The system SHALL durably persist a walk's full record (locations, start time, closed/open status, territory polygon if any) as soon as the walk ends, whether by closing a territory or by ending it early.

#### Scenario: Closing a walk persists it
- **WHEN** a walk is closed into territory
- **THEN** the walk is retrievable from storage after the app restarts

#### Scenario: Ending a walk early persists it
- **WHEN** a walk is ended without closing (open/unclosed)
- **THEN** the walk is retrievable from storage after the app restarts, marked as not closed

### Requirement: Cancelled walks are not persisted
The system SHALL NOT persist a walk that was discarded via Cancel.

#### Scenario: Cancel leaves no trace in storage
- **WHEN** a walk is cancelled
- **THEN** it is not retrievable from storage afterward

### Requirement: Walks are individually and collectively retrievable
The system SHALL allow retrieving a single previously saved walk by its identifier, and retrieving the full set of saved walks.

#### Scenario: Fetching one walk
- **WHEN** a saved walk's identifier is looked up
- **THEN** its full record is returned

#### Scenario: Fetching all walks
- **WHEN** all saved walks are requested
- **THEN** every previously saved walk is returned

### Requirement: Storage survives app data being cleared only intentionally
The system SHALL persist walk data independent of React/JavaScript app state — an app restart, crash, or backgrounding SHALL NOT lose a saved walk.

#### Scenario: Data survives a restart
- **WHEN** the app is closed and reopened
- **THEN** all previously saved walks are still present

### Requirement: Storage schema is forward-compatible with future sync
The system SHALL record, per walk, whether it has been synced to a remote store, defaulting to not-synced, without requiring any remote connectivity or sync behavior to exist yet.

#### Scenario: New walks start unsynced
- **WHEN** a walk is saved
- **THEN** it is recorded as not yet synced to any remote store

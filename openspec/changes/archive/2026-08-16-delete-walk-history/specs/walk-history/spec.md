## ADDED Requirements

### Requirement: A walk can be deleted from the history list
The system SHALL allow the user to permanently delete a saved walk from the history list, after confirming the action, since deletion is not undoable.

#### Scenario: Deleting a walk
- **WHEN** the user chooses to delete a walk and confirms
- **THEN** the walk is removed from storage and no longer appears in the history list

#### Scenario: Deleting a closed walk removes its territory from the map
- **WHEN** the user deletes a walk that was closed into territory
- **THEN** that territory no longer appears in the idle map's accumulated-territory view

#### Scenario: Deletion requires confirmation
- **WHEN** the user chooses to delete a walk
- **THEN** the system SHALL ask for confirmation before removing it

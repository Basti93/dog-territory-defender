## MODIFIED Requirements

### Requirement: Each entry identifies the walk
The system SHALL show, for each walk in the history list, enough information to distinguish it from others: at minimum its date/time and whether it covered enough ground to qualify for a reward.

#### Scenario: Distinguishing closed from open walks
- **WHEN** the history list is displayed
- **THEN** each entry indicates whether that walk covered enough ground to qualify for a reward, or was too short

### Requirement: Deleting a walk never shrinks the Home Range
The system SHALL allow the user to permanently delete a saved walk from the history list, after confirming the action, since deletion is not undoable. Deleting a walk SHALL remove only that walk's own record; it SHALL NOT remove any cells that walk painted from the Home Range (see `home-range`'s "The Range Is Monotonic and Never Shrinks"), and the deletion confirmation copy SHALL NOT imply that deleting a walk undoes its effect on the map.

#### Scenario: Deleting a walk
- **WHEN** the user chooses to delete a walk and confirms
- **THEN** the walk is removed from storage and no longer appears in the history list

#### Scenario: Deleting a walk does not remove its ground from the map
- **WHEN** the user deletes a walk that painted cells into the Home Range
- **THEN** those cells SHALL remain visible in the Range/Bloom exactly as before the deletion

#### Scenario: Deletion requires confirmation
- **WHEN** the user chooses to delete a walk
- **THEN** the system SHALL ask for confirmation before removing it, using copy that does not claim the deletion removes claimed ground from the map

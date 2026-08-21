## MODIFIED Requirements

### Requirement: Walks are saved on end
The system SHALL durably persist a walk's full record (locations, start time, finished status) as soon as the walk ends, whether by finishing it with a qualifying amount of ground covered or finishing it short of that floor. The walk record no longer carries a territory polygon; the ground it covered is instead reflected in the separately persisted Home Range grid (see `home-range`).

#### Scenario: Closing a walk persists it
- **WHEN** a walk is finished with enough ground covered to qualify for a reward
- **THEN** the walk is retrievable from storage after the app restarts

#### Scenario: Ending a walk early persists it
- **WHEN** a walk is finished without covering enough ground to qualify for a reward
- **THEN** the walk is retrievable from storage after the app restarts, and it is distinguishable from a reward-qualifying walk

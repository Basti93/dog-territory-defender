## MODIFIED Requirements

### Requirement: Walks are saved on end
The system SHALL durably persist a walk's full record (locations, start time, finished status) as soon as the walk ends, whether by finishing it with a qualifying amount of ground covered or finishing it short of that floor. The walk record no longer carries a territory polygon; the ground it covered is instead reflected in the separately persisted Home Range grid (see `home-range`). A reward-qualifying walk's record SHALL additionally carry, once its reward has been computed: the treats it earned; which of its own painted cells (if any) were New Ground discoveries at the time; and, for a manually-logged walk only, which previously-tracked route (if any) it refreshed. These three fields are additive and optional — a walk record from before this capability existed, or a walk that never qualified for a reward, SHALL be treated as having none of them, not as malformed.

#### Scenario: Closing a walk persists it
- **WHEN** a walk is finished with enough ground covered to qualify for a reward
- **THEN** the walk is retrievable from storage after the app restarts

#### Scenario: Ending a walk early persists it
- **WHEN** a walk is finished without covering enough ground to qualify for a reward
- **THEN** the walk is retrievable from storage after the app restarts, and it is distinguishable from a reward-qualifying walk

#### Scenario: Reward metadata is recorded once available
- **WHEN** a qualifying walk's reward has finished being computed
- **THEN** the treats it earned SHALL be recorded on that walk's own stored record

#### Scenario: New Ground cells are recorded once available
- **WHEN** a qualifying walk paints one or more New Ground cells
- **THEN** that walk's own stored record SHALL carry which of its cells were New Ground, distinct from the separate, single-most-recent New Ground event used elsewhere

#### Scenario: A manual log's route refresh is recorded
- **WHEN** a manually-logged walk refreshes a previously-tracked route
- **THEN** that manual log's own stored record SHALL carry which route it refreshed

#### Scenario: Older or non-qualifying walks have no reward metadata
- **WHEN** a walk was saved before this capability existed, or never qualified for a reward
- **THEN** it SHALL be read back with none of the three fields above present, rather than as an error or a malformed record

#### Scenario: A linked route can later be deleted
- **WHEN** a manual log's linked route walk is deleted from history after the fact
- **THEN** looking up that manual log's linked route SHALL resolve to "no linked route" rather than an error, and nothing about the manual log's own stored record SHALL be changed by the deletion

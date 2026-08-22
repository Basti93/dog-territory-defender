Note for whoever applies this delta: `openspec/specs/home-range/spec.md` must already exist (created when `home-range` archived) before this delta can be applied — the first requirement below is an `ADDED Requirement` on top of that file. **The second requirement below (Somewhere Wild copy) must be applied AFTER `somewhere-wild`'s own pending delta (`openspec/changes/somewhere-wild/specs/home-range/spec.md`) has already landed** — it modifies a requirement ("The 'Somewhere Wild' Card...") that only exists once that delta has been applied. If this change is applied before `somewhere-wild`, apply only the first requirement now and hold the second until `somewhere-wild` lands.

## ADDED Requirements

### Requirement: Every Range Cell Carries Territory Membership
Every cell in the Home Range grid SHALL carry a reference to exactly one Territory (see the `territories` capability) once the one-time migration backfill for this feature has completed. This membership SHALL be assigned once, at the time a cell is first painted, and SHALL only ever change afterward as a result of a Territory merge (see `territories`), never for any other reason.

#### Scenario: A cell's territory membership persists across repaints
- **WHEN** a cell already assigned to a Territory is repainted by a later walk
- **THEN** its territory membership SHALL remain unchanged, only its freshness/visits state SHALL update

#### Scenario: Territory membership changes only via merge
- **WHEN** a cell's territory membership changes after its initial assignment
- **THEN** that change SHALL only have occurred as part of a Territory merge, never as a side effect of any other action

## MODIFIED Requirements

### Requirement: The "Somewhere Wild" Card Surfaces the Same Fact in Words, on the Map Screen Only
The system SHALL show at most one small card on the map screen, never the Den screen and never as a push notification, stating either a recent New Ground discovery (within 48 hours of the walk that made it) or the existence of a qualifying wild cluster, in that priority order. When the wild-cluster state is shown and the cluster's anchor cell belongs to a named Territory, the card's copy SHALL prefer that Territory's name over a raw reverse-geocoded street name. When neither condition holds, the system SHALL render no card and no placeholder in its place. This SHALL remain exactly one card app-wide, never one per Territory.

#### Scenario: A recent New Ground discovery takes priority
- **WHEN** a New Ground event occurred within the last 48 hours AND a qualifying wild cluster also exists
- **THEN** the card SHALL show the New Ground state, not the wild-cluster state

#### Scenario: Neither condition holds
- **WHEN** there has been no New Ground event within 48 hours and no cluster clears the wild-ground threshold and minimum size
- **THEN** no card SHALL be rendered

#### Scenario: The wild cluster's copy names its territory
- **WHEN** the wild-cluster state is shown and the winning cluster's anchor cell belongs to a named Territory
- **THEN** the card's copy SHALL reference that Territory's name in place of a raw street name

#### Scenario: Still exactly one card
- **WHEN** the player has more than one Territory and more than one of them currently qualifies as a wild cluster
- **THEN** the system SHALL still show at most one "Somewhere Wild" card, for the single highest-ranked qualifying cluster across all Territories combined

#### Scenario: The card never appears on the Den screen
- **WHEN** the Den screen is displayed
- **THEN** the "Somewhere Wild" card SHALL NOT be shown on it

#### Scenario: The card is never delivered as a push notification
- **WHEN** either card condition becomes true while the app is backgrounded
- **THEN** the system SHALL NOT send a push notification for it — the card is only ever discovered by opening the app

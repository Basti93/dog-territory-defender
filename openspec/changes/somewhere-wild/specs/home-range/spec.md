Note for whoever applies this delta: `openspec/specs/home-range/spec.md` must already exist (created when `home-range` archived) before this delta can be applied — these are ADDED requirements on top of that file, not a new capability.

## ADDED Requirements

### Requirement: Wild Ground Is Rendered as a Shape, Not Only a Colour
The system SHALL render a second, visually distinct contour line around Home Range ground whose wildness is at or above the threshold that guarantees a visible Fresh Ground payout bonus, in addition to the Bloom's colour fill. This threshold SHALL be derived from the same balance constants that gate the Fresh Ground bonus's own display, not maintained as an independently hardcoded value.

#### Scenario: A wild-ground contour appears only where a bonus would actually apply
- **WHEN** the wild-ground contour is rendered
- **THEN** every patch it encloses SHALL be ground that would earn a Fresh Ground bonus at or above the display-suppression threshold if walked

#### Scenario: The contour threshold tracks the payout constant it depends on
- **WHEN** the Fresh Ground payout's underlying multiplier constant is changed
- **THEN** the wild-ground contour's threshold SHALL be recomputed from that constant, not left at a stale hardcoded value

### Requirement: One Marker Highlights the Single Most-Worth-Visiting Wild Cluster
The system SHALL identify at most one wild cluster on the player's map at a time — a connected group of Range cells at or above the wild-ground threshold, ranked by accumulated `visits` among qualifying clusters — and mark it with a single map marker, never one marker per qualifying patch.

#### Scenario: Multiple qualifying wild patches exist
- **WHEN** more than one connected cluster of cells clears the wild-ground threshold and the minimum cluster size
- **THEN** only the cluster with the highest summed `visits` SHALL be marked

#### Scenario: No qualifying cluster exists
- **WHEN** no connected cluster clears both the wild-ground threshold and the minimum cluster size
- **THEN** no marker SHALL be shown

### Requirement: The "Somewhere Wild" Card Surfaces the Same Fact in Words, on the Map Screen Only
The system SHALL show at most one small card on the map screen, never the Den screen and never as a push notification, stating either a recent New Ground discovery (within 48 hours of the walk that made it) or the existence of a qualifying wild cluster, in that priority order. When neither condition holds, the system SHALL render no card and no placeholder in its place.

#### Scenario: A recent New Ground discovery takes priority
- **WHEN** a New Ground event occurred within the last 48 hours AND a qualifying wild cluster also exists
- **THEN** the card SHALL show the New Ground state, not the wild-cluster state

#### Scenario: Neither condition holds
- **WHEN** there has been no New Ground event within 48 hours and no cluster clears the wild-ground threshold and minimum size
- **THEN** no card SHALL be rendered

#### Scenario: The card never appears on the Den screen
- **WHEN** the Den screen is displayed
- **THEN** the "Somewhere Wild" card SHALL NOT be shown on it

#### Scenario: The card is never delivered as a push notification
- **WHEN** either card condition becomes true while the app is backgrounded
- **THEN** the system SHALL NOT send a push notification for it — the card is only ever discovered by opening the app

### Requirement: A Wild Cluster Without a Resolvable Place Name Renders Nothing
The system SHALL attempt to resolve a place name for the winning wild cluster's anchor cell, falling back to a place name drawn from a real GPS fix of a walk known to have passed through that cluster if the anchor cell's own centre point does not resolve. If neither resolves, the system SHALL show neither the marker nor the card for that cluster.

#### Scenario: The anchor cell resolves directly
- **WHEN** reverse-geocoding the winning cluster's anchor cell centre returns a usable place name
- **THEN** that name SHALL be used and no fallback lookup SHALL run

#### Scenario: The anchor cell fails to resolve but a walk through the cluster does
- **WHEN** reverse-geocoding the anchor cell centre returns nothing usable, but a recent walk's own recorded location within the cluster does resolve
- **THEN** that walk's resolved name SHALL be used instead

#### Scenario: Neither resolves
- **WHEN** both the anchor cell centre and every checked recent walk location fail to resolve a place name
- **THEN** neither the marker nor the card SHALL be shown for that cluster in that evaluation cycle

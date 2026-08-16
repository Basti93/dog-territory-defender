## ADDED Requirements

### Requirement: Walk-Derived XP
The system SHALL award Den XP for every closed walk, computed only from that walk's own distance and enclosed territory area, with no dependency on Den building levels, treats spent, or Pack bonuses. The contribution of enclosed area to the XP award SHALL be capped per walk, so a single outsized or GPS-anomalous polygon cannot produce a disproportionate XP or level jump.

#### Scenario: XP awarded on walk close
- **WHEN** a walk is closed into a territory polygon
- **THEN** the system SHALL award XP equal to a flat base plus an amount scaled by the walk's total distance plus a capped amount scaled by the polygon's enclosed area, with no building-derived or treats-derived multiplier applied

### Requirement: Den Level Is Standalone and XP-Derived
Den Level SHALL be derived only from a player's own lifetime accumulated XP (per Walk-Derived XP above), and SHALL NOT be derived from the sum, average, or presence of any Den building's level, so that Den Level never depends on the buildings it gates in later phases.

#### Scenario: Den Level independent of building levels
- **WHEN** a player's Doghouse, Treat Bakery, and Sniff Garden levels change through upgrades
- **THEN** the player's Den Level SHALL NOT change as a result

### Requirement: Leveling Curve
XP required to advance from Den Level N to N+1 SHALL grow geometrically, consistent with the exponential shape already used for building upgrade costs, and SHALL be capped at level 100, consistent with the existing max building level.

#### Scenario: XP requirement grows each level
- **WHEN** a player advances from Den Level N to N+1
- **THEN** the XP required for the following level-up SHALL be greater than the XP required for the level-up just completed

#### Scenario: Den Level cannot exceed the cap
- **WHEN** a player's lifetime XP exceeds the cumulative XP required for Den Level 100
- **THEN** the player's Den Level SHALL remain 100 and SHALL NOT increase further

### Requirement: Phase 1 Level Payoff Is Non-Percentage and Visually Secondary
In Phase 1, leveling up SHALL grant only a flat one-time treats bonus and a visible level-up notice; it SHALL NOT grant any percentage bonus to treats, XP, collectibles, or any other rate, reserving percentage-based Den Level bonuses for the Phase 4 buildings gated by it. The Den Level readout and any level-up notice SHALL be visually secondary to the walk's own territory-claimed outcome wherever both appear together, consistent with the `visual-design` capability's Success Criteria that claiming territory SHALL feel like making a mark on the neighborhood, not leveling up a metric.

#### Scenario: Level-up reward in Phase 1
- **WHEN** a player's Den Level increases during Phase 1
- **THEN** the system SHALL award a flat, fixed amount of treats (capped by Doghouse storage), and SHALL NOT apply any percentage modifier to future treats, XP, or collectible rates as a result

#### Scenario: Level-up notice does not overshadow territory claimed
- **WHEN** a walk that closes into a territory also crosses a Den Level threshold
- **THEN** the post-walk celebration SHALL present the territory-claimed outcome as the primary moment, and any level-up notice SHALL be shown at or below the visual weight of the existing upgrade tease

#### Scenario: No early unlock-ladder disclosure
- **WHEN** a player views their Den Level in Phase 1
- **THEN** the system SHALL NOT display which building or feature unlocks at any future Den Level

# Den Economy Specification

## Purpose

Defines The Den — the dog's home-base cookie-clicker progression system (treats currency and buildings) that gives Dog Territory Defender a rich background loop between walks: treats earned from walking and passively from buildings, spent on building upgrades, with a visually evolving home base and an always-visible "next upgrade" to chase.

## Requirements

### Requirement: Treats Currency and Passive Generation
Treats SHALL be earned from walks (a one-time reward per walk) and generated passively per hour by buildings (primarily the Treat Bakery). Treats are the currency spent on building upgrades, up to the Doghouse's storage capacity.

#### Scenario: Passive treat accumulation while not walking
- **WHEN** the player is not actively on a walk
- **THEN** treats SHALL continue to accumulate passively at the rate determined by owned buildings, capped by the Doghouse's storage capacity

### Requirement: The 10 Den Buildings
The Den SHALL support exactly these 10 buildings, unlocking progressively:

| # | Building | Effect | Unlocks at |
|---|---|---|---|
| 1 | Doghouse (HQ) | Treat storage capacity + base | Start |
| 2 | Treat Bakery | Passive treats per hour (idle generator) | Start |
| 3 | Sniff Garden | +X% collectibles found on walks | Start |
| 4 | Training Yard | +X% XP per walk | Den Level 5 |
| 5 | Watch Tower | +X% territory defense | Den Level 10 |
| 6 | Friend Lounge | Chance for visiting dogs to leave gifts | Den Level 15 |
| 7 | Spring Garden | Seasonal +X% during spring (cycles per season) | Den Level 20 |
| 8 | Trophy Hall | Display badges, +0.5% per badge displayed | Den Level 25 |
| 9 | Pack House | Recruit AI dog companions (passive bonuses) | Den Level 30 |
| 10 | Memorial Bench | Logs walks, sentimental, no bonus | Anytime (free) |

#### Scenario: Building unlock gating
- **WHEN** the Den reaches a new level
- **THEN** only buildings whose unlock level is at or below the Den's current level SHALL become available to build

### Requirement: Building Level Progression and Soft Cap
Each building SHALL support up to 100 levels. Each level SHALL cost exponentially more treats than the previous level. Bonuses above level 50 SHALL give diminishing returns (soft cap), consistent with the `anti-snowball` capability's +50%-above-L50 cap.

#### Scenario: Upgrading past level 50
- **WHEN** a building is upgraded from level 50 to a higher level
- **THEN** the marginal bonus granted per level SHALL be smaller than the marginal bonus granted per level below level 50

### Requirement: Specialization and Visible Progression
The Den SHALL always display one clearly visible "next upgrade" to chase, and SHALL support at least three specialization paths — e.g. Sniff Garden focus for collecting, Watch Tower focus for defense, Treat Bakery focus for idle farming — without forcing a single optimal build.

#### Scenario: Next upgrade tease
- **WHEN** the player has enough treats to afford at least one upgrade
- **THEN** the Den screen SHALL visibly indicate which upgrade is next and how many treats it costs

### Requirement: Spring-Themed Presentation
The Den SHALL visually reflect the season and show idle life: the grass SHALL grow visibly greener in spring; the Spring Garden SHALL bloom with daffodils when the season changes; idle animations (e.g. the dog sleeping in the Doghouse, butterflies near the Sniff Garden) SHALL play; and the system SHALL notify the player when passive treat storage overflows (e.g. "Your Treat Bakery overflowed! 124 treats waiting").

#### Scenario: Treat storage overflow while away
- **WHEN** passive treat generation fills the Doghouse's storage capacity while the player is away
- **THEN** the system SHALL notify the player that treats are waiting when they return

### Requirement: Phase 1 Minimum Den
In Phase 1 of the phased build plan (`game-phases`), the Den SHALL expose only 3 buildings — Doghouse, Treat Bakery, Sniff Garden — with the remaining 7 buildings introduced no earlier than Phase 4.

#### Scenario: Phase 1 Den scope
- **WHEN** the Den screen is built for Phase 1
- **THEN** it SHALL show exactly the Doghouse, Treat Bakery, and Sniff Garden buildings and no others

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

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
| 3 | Sniff Garden | +X% treats found on a walk | Start |
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
The system SHALL award Den XP for every reward-eligible closed walk (see `walk-lifecycle`'s `Reward Eligibility Is Ground Covered, Not Loop Closure`), computed only from that walk's own distance and the real ground it painted into the Home Range (see `home-range`), with no dependency on Den building levels, treats spent, or Pack bonuses. The contribution of painted ground to the XP award SHALL be capped per walk, so a single outsized or GPS-anomalous walk cannot produce a disproportionate XP or level jump.

#### Scenario: XP awarded on walk close
- **WHEN** a walk is finished and meets the reward-eligibility floor
- **THEN** the system SHALL award XP equal to a flat base plus an amount scaled by the walk's total distance plus a capped amount scaled by the walk's painted Home Range footprint, with no building-derived or treats-derived multiplier applied

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

### Requirement: Phase 1 Level Payoff Is Buddy's Per-Walk Income Rate, Never a Capped Power Bonus
In Phase 1, Buddy's Level (the player-facing name for Den Level) SHALL determine the flat treats payout awarded per walk, via a per-level curve that increases by a constant relative percentage at every level with no upper limit, displayed to the player as a concrete per-walk figure (e.g. "Buddy brings home N treats a walk"). This is an income effect, not a capped power bonus: it SHALL NOT be summed into the `anti-snowball` capability's `Hard Power Gap Soft-Cap` budget, and no capped percentage bonus anywhere in the game (building, Pack, or badge) SHALL ever be a function of Buddy's Level or of a player's treat balance. The Den Level readout and any level-up notice SHALL remain visually secondary to the walk's own territory-claimed outcome wherever both appear together, consistent with `visual-design`'s Success Criteria.

#### Scenario: Level-up changes the walk's treat payout
- **WHEN** Buddy's Level increases
- **THEN** the per-walk treats payout SHALL increase by a visible whole number of treats, and the post-walk celebration SHALL show the old and new per-walk rate together

#### Scenario: Level income never counts toward the power cap
- **WHEN** the `anti-snowball` `Hard Power Gap Soft-Cap` is evaluated for a level-100 player versus a level-1 player
- **THEN** Buddy's Level's contribution to that capped total SHALL be 0%

#### Scenario: Level-up notice does not overshadow territory claimed
- **WHEN** a walk that closes into a territory also crosses a Den Level threshold
- **THEN** the post-walk celebration SHALL present the territory-claimed outcome as the primary moment, and the level-up notice SHALL be shown at or below the visual weight of the existing upgrade tease

#### Scenario: No early unlock-ladder disclosure
- **WHEN** a player views their Den Level in Phase 1
- **THEN** the system SHALL NOT display which building or feature unlocks at any future Den Level

### Requirement: Doghouse Storage Never Permanently Softlocks
The Doghouse's storage capacity SHALL scale so that it never falls below a fixed multiple of the cheapest currently-available upgrade cost across all owned buildings, so a player can never be permanently unable to save enough treats to afford any further upgrade.

#### Scenario: Storage capacity tracks upgrade cost growth
- **WHEN** the cheapest available building upgrade's cost grows as buildings are upgraded
- **THEN** the Doghouse's storage capacity SHALL grow at least proportionally, so the cheapest available upgrade always remains within reach of a full storage bank

### Requirement: Milestone Titles Are Front-Loaded and Never Final
At a front-loaded, ever-widening sequence of levels, Buddy SHALL earn a text-only title with no fixed final title, no numeric maximum shown (no "/100", no percentage), and no state that forecloses future growth.

#### Scenario: Title sequence has no final entry
- **WHEN** a player reaches the highest currently-authored milestone title
- **THEN** the system SHALL NOT present this as a final or maximum achievement, and the milestone sequence SHALL continue to be computable (even if uncopy-written) beyond that level

### Requirement: Fresh Ground Payout Rewards Returning to Wilder Ground
The system SHALL apply a treats-only multiplier to a walk's payout, scaled by the mean freshness of the Home Range cells it painted, so that returning to ground that hasn't been walked recently pays more than repeating a route walked yesterday. This multiplier SHALL NOT apply to XP. It SHALL be suppressed (no bonus, no display) for any walk that paints fewer than the Home Range's qualifying-walk cell floor.

#### Scenario: A wilder walk pays more treats
- **WHEN** a qualifying walk covers ground that has not been walked recently
- **THEN** its treats payout SHALL be higher than an otherwise-identical walk over ground walked the day before

#### Scenario: The multiplier never applies to XP
- **WHEN** a walk's Fresh Ground multiplier is computed
- **THEN** it SHALL be applied only to the walk's treats payout, never to its XP award

#### Scenario: A short walk gets no multiplier
- **WHEN** a walk paints fewer cells than the Home Range's qualifying-walk floor
- **THEN** no Fresh Ground multiplier SHALL be applied or displayed

### Requirement: Manual-Log Route Refresh Cannot Discover Ground or Choose Its Own Payout
The system SHALL allow a manually logged walk to optionally refresh the freshness of a route the player has previously walked with live GPS tracking, subject to a fixed cap of one route refresh per calendar day. A manual-log refresh SHALL always pay the same fixed Fresh Ground multiplier regardless of which route is selected or how wild that route actually is, and SHALL NOT extend the Home Range's Range (only cells already in the Range, by construction, are eligible to be refreshed).

#### Scenario: Refresh payout does not depend on the route picked
- **WHEN** a manual log refreshes a previously tracked route
- **THEN** the Fresh Ground multiplier it earns SHALL be the same fixed value regardless of which eligible route was selected

#### Scenario: A manual log cannot extend the Range
- **WHEN** a manual log refreshes a route
- **THEN** no cell outside the player's existing Range SHALL be added as a result

#### Scenario: Refresh is capped
- **WHEN** the player has already refreshed a route once on the current calendar day
- **THEN** no further route refresh SHALL be available until the next calendar day

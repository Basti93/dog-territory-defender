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

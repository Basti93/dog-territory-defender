## ADDED Requirements

<!-- Own spec file (not part of multiplayer-sync): these are game-master-owned player-facing rules with their own lifecycle (second milestone, switchable by NEIGHBOURS_ENABLED, reviewable without reading sync plumbing). Engineering: design.md Decisions 17-24. Numeric values live in src/economy/neighbourConfig.ts and are load-bearing. -->

### Requirement: Neighbour dogs are openly simulated
The system SHALL present neighbour dogs ("Nachbarhunde") as simulated dogs. Every neighbour profile card SHALL show a paw-robot badge and wording that says the dog is simulated, and every API item for a neighbour SHALL be flagged as a bot. The system SHALL NOT present a neighbour dog as a real person or real household, SHALL NOT place a neighbour dog on any human leaderboard or ranking, and SHALL NOT label neighbour dogs on the map (the badge lives on the card).

#### Scenario: Opening a profile card
- **WHEN** a player opens a neighbour dog's card
- **THEN** the card SHALL show the paw-robot badge and the simulated wording

#### Scenario: Nothing ranks a bot
- **WHEN** any ranking, leaderboard or comparison is computed or shown
- **THEN** neighbour dogs SHALL NOT be included

### Requirement: Six deterministic neighbours per household, generated on the server
When a household's first tracked walk is accepted, the server SHALL create six neighbour dogs (Momo, Pfote, Bruno, Keks, Lotte, Nebel) for that household as flagged simulated households with appearances drawn only from the game's appearance enums. Generation SHALL be idempotent and deterministic from a per-household seed, so every device of the household sees the same neighbours. Simulated households SHALL have no players or devices, SHALL never be returned except through the nearby endpoint, and their walks and cells SHALL carry a generated flag.

#### Scenario: Two phones, same neighbours
- **WHEN** two devices of one household sync after the neighbours were created
- **THEN** both SHALL see the same six dogs with the same appearances and the same Ranges

#### Scenario: Generation is repeatable
- **WHEN** generation is run twice for one household
- **THEN** exactly six neighbour dogs SHALL exist

#### Scenario: Feature switched off
- **WHEN** the neighbour feature is disabled by configuration
- **THEN** the nearby endpoint SHALL return an empty list, no walks or events SHALL be generated, and the app SHALL render nothing for neighbours

### Requirement: Neighbour walks are plausible, synthetic and keep away from home
The server SHALL generate neighbour walks as loops on real walkable paths between 0.5 and 3 km from the household's Home Range edge, with start times jittered by about 20 minutes and later on weekends. A generated route SHALL NOT pass through the household's home block. When street data is unavailable the server SHALL fall back to offset copies of the household's own routes and SHALL record which generator produced each walk. Generated walks SHALL be stored as ordinary walks and cells with the generated flag, SHALL appear no earlier than their end time, and SHALL NOT award treats, XP or Territories to anyone.

#### Scenario: Route avoids the home block
- **WHEN** a neighbour walk is generated for a household
- **THEN** no point of the route SHALL lie within the home-block radius of the household's home anchor

#### Scenario: Street data unavailable
- **WHEN** the street-data source cannot be reached
- **THEN** the server SHALL still produce fallback walks, mark them as such, and show nothing wrong to the player

#### Scenario: Walk not yet finished
- **WHEN** a neighbour walk is planned for later today
- **THEN** its cells SHALL NOT appear in the household's view until its end time has passed

### Requirement: Neighbour Ranges never reduce the player's Range
Neighbour Ranges SHALL be shown on the map as dotted pastel overlays drawn beneath the player's own Range. Overlap SHALL be soft: generating or drawing neighbour Ranges SHALL NOT change, shrink, recolour or remove any cell of the player's Home Range or Territories.

#### Scenario: Overlapping Ranges
- **WHEN** a neighbour's cells overlap the player's cells
- **THEN** the player's cells SHALL be drawn unchanged on top and the player's stored cells SHALL be identical before and after

### Requirement: Doorstep events are few, passive and capped
Neighbour events SHALL appear only as passive Doorstep lines and SHALL be capped per household at 2 events per local day, 1 gift per day, 1 invitation per week and 3 reactions per week. A line SHALL NOT repeat within 10 days. The Doorstep SHALL show at most one neighbour line per launch and SHALL rank it below partner and personal lines inside the existing line cap. Neighbour dogs SHALL appear in four weekly stages: week 1 Momo and Pfote; week 2 Bruno and the first invitation; week 3 Keks, Lotte and the first Viertel-Runde; week 4 Nebel and the first weird event; afterwards the pool SHALL rotate.

#### Scenario: Caps hold over a busy week
- **WHEN** a week is planned for a household with many new-ground walks
- **THEN** no local day SHALL hold more than 2 events, and the week SHALL hold at most 3 reactions and 1 invitation

#### Scenario: No repetition
- **WHEN** a line was shown to a household
- **THEN** the same line SHALL NOT be planned for that household within the next 10 days

#### Scenario: Week one cast
- **WHEN** the household is in its first neighbour week
- **THEN** only Momo and Pfote SHALL walk or produce events

### Requirement: Reactions follow new ground
When a household's walk reaches new ground, a neighbour dog MAY visit that ground within 24 hours and leave paw prints, for at most 1 in 3 such walks and at most 3 per week. A reaction SHALL NOT route through the home block.

#### Scenario: New ground, reaction budget left
- **WHEN** a walk reaches new ground and the weekly reaction budget is not used up
- **THEN** a reaction MAY be planned within 24 hours and, if shown, SHALL read like "Momo followed your new path"

### Requirement: Invitations are optional and free
A neighbour dog MAY invite the household to a walk at a named time at most once per week as a Doorstep line. The system SHALL NOT send a push, a reminder or any follow-up, and SHALL NOT penalise not going. Accepting SHALL grant only a cosmetic photo moment if the household walks within -30 and +60 minutes of the named time.

#### Scenario: Invitation ignored
- **WHEN** the household does not accept or does not walk at the time
- **THEN** nothing SHALL change and no further message about it SHALL appear

### Requirement: Gifts sit inside the anti-snowball rules
A neighbour gift SHALL consist of a cosmetic from a finite catalog and/or a treat sprinkle, SHALL be limited to 1 per day per household, SHALL be opened by tap and SHALL NOT expire. The treat sprinkle SHALL equal 5 percent of the household's average treats per walk over its last 14 walks, SHALL be credited directly when opened and SHALL NOT be multiplied by Beginner's Luck or any Den, Pack or badge bonus. Opening a gift SHALL be idempotent and the first member to open it SHALL receive it for the household. An exclusive cosmetic SHALL be queued for a neighbour after it has been met on three distinct days.

#### Scenario: Sprinkle during Beginner's Luck
- **WHEN** a household inside its Beginner's Luck window opens a sprinkle
- **THEN** the amount SHALL be the same 5 percent without doubling

#### Scenario: Two members open the same gift
- **WHEN** both members open one gift
- **THEN** the household SHALL receive the sprinkle once

#### Scenario: Everything already owned
- **WHEN** the household owns every cosmetic in the catalog
- **THEN** gifts SHALL contain no cosmetic and SHALL NOT repeat one

### Requirement: Viertel-Runde is a cooperative weekly goal
From week 3 the system SHALL run a weekly cooperative goal per household in the household's timezone. Its progress SHALL be computed by the server from the household's tracked walks plus neighbour walks, shown as a single combined progress without a split between players and neighbours. The goal SHALL be reachable by the household alone at low effort, neighbour contribution SHALL be visible but SHALL NOT exceed 60 percent of the goal, and the household's own walking SHALL decide completion. There SHALL be no loss state; unmet household progress SHALL carry into the next week up to half of the next week's household share. Completion SHALL grant the household a yard decoration.

#### Scenario: Neighbours alone cannot finish it
- **WHEN** the household walks nothing in a week
- **THEN** the goal SHALL remain incomplete and nothing SHALL be taken away or announced as missed

#### Scenario: Week ends short
- **WHEN** the week ends below the goal
- **THEN** no penalty SHALL apply and the household's progress SHALL carry over within the stated limit

#### Scenario: Completion
- **WHEN** combined progress reaches the goal
- **THEN** the household SHALL receive a yard decoration and the combined-distance line SHALL be queued

### Requirement: Things neighbour dogs never do
Neighbour dogs SHALL NOT take, shrink or recolour any territory, SHALL NOT earn more than the player (they earn nothing), SHALL NOT ask for or imply comparison numbers between a player and a neighbour, SHALL NOT repeat pings, nag, or say a player is behind or has not walked, SHALL NOT use battle language ("conquer", "destroy", "kill", "battle"), and SHALL NOT claim to be real. No line SHALL be negative or guilt-inducing, and Buddy's anti-guilt rules SHALL apply to every line.

#### Scenario: Quiet days
- **WHEN** the household has not walked for several days
- **THEN** neighbour lines SHALL NOT mention it and the number of events SHALL NOT increase to win the player back

### Requirement: Neighbour generation is privacy-preserving and operable
No data about a real household SHALL be shown to any other household, and neighbour routes SHALL be synthetic. Street-data requests to a third party SHALL be coarse and grid-aligned rather than centred on a household's exact position, and SHALL be named in the privacy note. The scheduler SHALL run inside the api process, be idempotent, catch up after downtime, never run two jobs at once, and run heavy fetches only outside 02:00-06:00 server time.

#### Scenario: Server was down for a day
- **WHEN** the server restarts after a day of downtime
- **THEN** it SHALL plan the missing days once, without duplicating walks, events or gifts, and without a burst of events exceeding the caps

#### Scenario: Street-data request privacy
- **WHEN** street data is fetched for a household
- **THEN** the request SHALL cover whole grid tiles, not the household's exact coordinates

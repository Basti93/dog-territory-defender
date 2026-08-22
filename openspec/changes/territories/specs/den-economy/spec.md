## ADDED Requirements

### Requirement: Territory Passive Income Is Additive, Level-Scaled, and Split-Invariant
The system SHALL add a second passive treats-per-hour term, on top of the existing Treat Bakery passive rate, computed from the player's total claimed Home Range ground across all of that player's Territories combined: `mass = cells + 2·visits` summed globally across every cell regardless of which Territory it belongs to, `territoryRate = R_max · (1 − exp(−worldMass / 300000))`, where `R_max = buddyPayout(level) / 48`. This computation SHALL be invariant to how the player's cells happen to be partitioned into Territories — the same total cells and visits SHALL always produce the same `territoryRate` regardless of whether they are held as one Territory or split across many.

#### Scenario: Territory income adds to existing passive income
- **WHEN** passive treats accrue over elapsed time
- **THEN** the total passive rate SHALL equal the existing Treat Bakery rate plus `territoryRate`

#### Scenario: Splitting territories does not change the total rate
- **WHEN** an identical total cell and visit count is held as one Territory versus split across several Territories
- **THEN** `territoryRate` SHALL be identical in both cases

#### Scenario: Territory income scales with Buddy's Level
- **WHEN** Buddy's Level increases with `worldMass` held constant
- **THEN** `territoryRate` SHALL increase, since `R_max` is derived from `buddyPayout(level)`

### Requirement: A Cell's Visit Count Toward Territory Income Is Capped Once Per Calendar Day, Silently
The system SHALL credit at most one `visits` increment per cell per local calendar day toward the mass calculation feeding `territoryRate`, regardless of how many times that cell is repainted on the same day. This cap SHALL be entirely invisible in the UI: no indicator, message, or dimmed state SHALL communicate that a repaint did not increment `visits`, and no other stat (walk count, treats earned, streets known) SHALL be affected by this cap.

#### Scenario: A second same-day walk over the same ground does not double-credit visits
- **WHEN** a cell already repainted once on the current local calendar day is repainted again the same day
- **THEN** its `visits` count SHALL NOT increment a second time that day, and no other stat for that walk SHALL be affected

#### Scenario: The cap is never shown
- **WHEN** a repaint on the same calendar day does not increment `visits`
- **THEN** the system SHALL NOT display any indication that a cap was applied

### Requirement: Territory Income Is Hidden Until It Crosses a Display Floor, Then Shown Permanently
The system SHALL show no territory-income figure anywhere — no global line, no per-Territory line, no placeholder — while `territoryRate` is below 1 treat per hour. The first time `territoryRate` crosses 1 treat per hour, the system SHALL show a one-time discovery beat, after which a permanent line showing the current global rate SHALL remain visible on the Doorstep and Den screens. Each Territory's own card MAY additionally show that Territory's own absolute share of the global rate, gated on the same reveal having already occurred, shown as an absolute number and never as a percentage or ranked figure.

#### Scenario: Nothing renders before the threshold
- **WHEN** `territoryRate` is below 1 treat per hour
- **THEN** no territory-income figure SHALL be shown anywhere, with no placeholder or locked state in its place

#### Scenario: A one-time reveal fires on first crossing
- **WHEN** `territoryRate` crosses 1 treat per hour for the first time
- **THEN** the system SHALL show a one-time discovery beat, and SHALL NOT show it again on any later app open

#### Scenario: The line persists after reveal
- **WHEN** the reveal has already occurred
- **THEN** the current global territory-income rate SHALL remain visible on the Doorstep and Den screens on every subsequent app open

#### Scenario: Per-territory income is never a percentage or ranking
- **WHEN** a Territory's own card shows its share of the global territory-income rate
- **THEN** it SHALL be shown as an absolute treats-per-hour number, never as a percentage of the total and never alongside a ranked comparison to another Territory

Note for whoever applies this delta: this is a brand-new capability — there is no existing `openspec/specs/home-dashboard/spec.md` to diff against. On apply, this becomes a new spec file; its `## Purpose` should read: "Defines The Doorstep — the landing screen shown once per app cold start, between the first-launch dog-naming gate and the map, that surfaces Buddy's current standing and what changed while the player was away, without ever introducing a guilt, streak, or freshness-decay signal. This capability aggregates and presents facts already computed by `den-economy`, `home-range`, `personal-stats`, and the earned-trigger notification system — it introduces no new economy, XP, or reward logic of its own."

## ADDED Requirements

### Requirement: The Doorstep Precedes the Map, Once Per Cold Start
The system SHALL show The Doorstep as the first screen after the first-launch dog-naming gate, before the map, exactly once per app process launch. Once the player dismisses it (by starting a walk, tapping the territory portrait, or opening the Den from its footer), it SHALL NOT reappear again until the app is relaunched.

#### Scenario: Cold start shows the Doorstep first
- **WHEN** the app launches and the dog has already been named
- **THEN** The Doorstep SHALL be the first screen shown, before the map

#### Scenario: The Doorstep does not reappear mid-session
- **WHEN** the player dismisses The Doorstep and later returns from the map, the Den, Stats, or Walk History during the same app session
- **THEN** The Doorstep SHALL NOT be shown again until the app is relaunched

### Requirement: The Dog Row Shows a Number and a Title, Never a Progress Bar
The Doorstep SHALL show Buddy's name, current Level, and current milestone title (the most recently attained title, if any has been attained) as plain text, and SHALL NOT show any progress-toward-next-level bar or percentage.

#### Scenario: A title has been attained
- **WHEN** Buddy's Level is at or above the first milestone level
- **THEN** the dog row SHALL show his current title alongside his Level number

#### Scenario: No title attained yet
- **WHEN** Buddy's Level is below the first milestone level
- **THEN** the dog row SHALL show only his Level number, with no title segment and no placeholder text in its place

#### Scenario: No progress chrome
- **WHEN** the dog row is rendered
- **THEN** it SHALL NOT include a progress-toward-next-level bar, fill, or percentage

### Requirement: The Territory Portrait Is Still, Unlabeled, and Tappable to the Map
The system SHALL render a still, non-interactive image of the player's current Home Range (its Range outline and Bloom fill only) as the Doorstep's largest element, framed to fit whatever ground has been claimed, with no numbers, pins, or markers on it. Tapping it SHALL navigate to the map screen. When the player has no Home Range yet, the system SHALL show no portrait and SHALL instead show an invitation to start walking.

#### Scenario: A Range exists
- **WHEN** the player has at least one painted Home Range cell
- **THEN** the Doorstep SHALL show a still portrait of that Range's outline and Bloom fill, with no pins, markers, or numeric overlay

#### Scenario: Tapping the portrait opens the map
- **WHEN** the player taps the territory portrait
- **THEN** the system SHALL navigate to the map screen

#### Scenario: No Home Range yet
- **WHEN** the player has no painted Home Range cells
- **THEN** the Doorstep SHALL show no portrait, and SHALL instead show an invitation to start the first walk

### Requirement: The "While You Were Out" Strip Never Shows an Empty Placeholder
The Doorstep SHALL show at most three short lines summarizing what changed since the player's last app open, drawn only from: a resolved "Somewhere Wild" card state, an achievement unlocked while the player was away, Den passive treat accrual since last open, and treat storage sitting at capacity. When none of these conditions hold, the system SHALL render no strip and no placeholder in its place.

#### Scenario: Nothing changed
- **WHEN** none of the strip's sourcing conditions hold
- **THEN** the system SHALL render no strip and no empty-state message in its place

#### Scenario: Storage-at-cap line does not duplicate a push notification
- **WHEN** the Doorstep's storage-at-cap line is shown for a given overflow event
- **THEN** the earned-trigger overflow push notification SHALL NOT also fire for that same event

#### Scenario: Bloom decay is never shown as a number
- **WHEN** the "While You Were Out" strip includes a wild-ground fact
- **THEN** it SHALL be drawn only from the existing "Somewhere Wild" card evaluation, and SHALL NOT include any freshness percentage, decay count, or loss-framed copy

### Requirement: No Guilt, Streak, or Freshness Signal Anywhere on the Doorstep
The Doorstep SHALL NOT display, at any point in any of its three session states, a days-since-last-open number, a sad or droopy dog state, a numeric freshness or decay indicator, loss-framed copy, an untied daily-login-style grant, a visible streak or weekly-walk-count indicator, urgency copy on away-treats, or any comparison to another player.

#### Scenario: A long-absence return uses the same flow as a first-open-of-day return
- **WHEN** the player returns after a long absence
- **THEN** the Doorstep SHALL use the structurally identical flow it uses for a first-open-of-the-day return, differing only in which greeting-copy pool is selected, and the dog SHALL be shown awake, never sad or dozing

#### Scenario: No internal timing signal leaks into copy
- **WHEN** any Doorstep copy is composed
- **THEN** it SHALL NOT include a number or phrase derived from how much time has elapsed since the player's last app open

### Requirement: A Same-Day Re-Open Shows a Quieter Doorstep
When the player has already opened the app earlier on the current calendar day, the Doorstep SHALL show the dog in a dozing state and SHALL cap its "While You Were Out" strip to at most one line, shown only if something changed since the earlier open on the same day.

#### Scenario: Re-opening later the same day
- **WHEN** the player opens the app again on the same local calendar day as their last open
- **THEN** the dog SHALL be shown dozing, and the strip SHALL show at most one line

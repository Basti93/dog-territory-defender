Note for whoever applies this delta: this is a brand-new capability — there is no existing `openspec/specs/home-dashboard/spec.md` to diff against. On apply, this becomes a new spec file; its `## Purpose` should read: "Defines The Doorstep — the landing screen shown once per app cold start, between the first-launch dog-naming gate and the map, that surfaces Buddy's current standing and what changed while the player was away, without ever introducing a guilt, streak, or freshness-decay signal. This capability aggregates and presents facts already computed by `den-economy`, `home-range`, `personal-stats`, and the earned-trigger notification system — it introduces no new economy, XP, or reward logic of its own."

## ADDED Requirements

### Requirement: The Doorstep Is the Persistent Home Screen
**Revised 2026-08-22, before this capability ever shipped** — see `proposal.md`'s Why for the founder's own on-device finding that prompted the reversal, and `design.md` Decisions 8-13 for the full navigation-model scoping. The original version of this requirement (below, for the record) said the Doorstep SHALL NOT reappear once dismissed until relaunch, framing it as a one-time landing gate. On-device testing of this exact behavior (this capability's own manual-verification task, `tasks.md` 8.1) surfaced that this reads as a bug, not a feature: once a player left the Doorstep for the Den, History, Stats, or the map, there was no way back to it for the rest of the session. Corrected before archiving rather than shipped and patched after.

> Original text (superseded): "The system SHALL show The Doorstep as the first screen after the first-launch dog-naming gate, before the map, exactly once per app process launch. Once the player dismisses it (by starting a walk, tapping the territory portrait, or opening the Den from its footer), it SHALL NOT reappear again until the app is relaunched."

The system SHALL show The Doorstep as the first screen after the first-launch dog-naming gate, before the map, at every app cold start. The Doorstep SHALL be shown again whenever the player dismisses any other screen reached from it (the map, the Den, Stats & Badges, Walk History, or the burger menu's Debug Log or Log a Missed Walk screens), for the entire lifetime of the app process — it is not a one-time splash. The one exception: while a walk is actively being tracked, the system SHALL show the live map and Finish Walk/Cancel controls, and SHALL NOT show or offer a way to reach the Doorstep until the walk ends.

#### Scenario: Cold start shows the Doorstep first
- **WHEN** the app launches and the dog has already been named
- **THEN** The Doorstep SHALL be the first screen shown, before the map

#### Scenario: Dismissing any other screen returns to the Doorstep
- **WHEN** the player dismisses the map, the Den, Stats & Badges, Walk History, Debug Log, or Log a Missed Walk
- **THEN** The Doorstep SHALL be shown next

#### Scenario: Active tracking is never interrupted by the Doorstep
- **WHEN** a walk is actively being tracked
- **THEN** the system SHALL show the live map and Finish Walk/Cancel controls, and SHALL NOT show the Doorstep or any control that navigates to it, until the walk ends

### Requirement: The Idle Map Screen Has No Button List and Returns to the Doorstep
When the map is shown with no walk actively being tracked, the system SHALL show only the map, the player's current walk trail and stats readout (if a just-finished walk hasn't been cleared yet), the existing Territories entry point, the "Somewhere Wild" card, and a single control to return to the Doorstep. It SHALL NOT show a list of navigation buttons to other screens (Log a Missed Walk, View Past Walks, The Den, Stats & Badges, Debug Log, or a duplicate Start Walk control).

#### Scenario: Idle map screen has no button list
- **WHEN** the map is shown with no walk actively being tracked
- **THEN** it SHALL show no buttons for Log a Missed Walk, View Past Walks, The Den, Stats & Badges, Debug Log, or Start Walk

#### Scenario: Returning to the Doorstep from the idle map
- **WHEN** the player taps the idle map screen's return control
- **THEN** the Doorstep SHALL be shown

#### Scenario: Territories entry point is unaffected
- **WHEN** the player taps the map screen's existing Territories button
- **THEN** the Territories list SHALL open exactly as before, and dismissing it SHALL return to the map screen, not the Doorstep

### Requirement: Core Actions Reachable Directly From the Doorstep
The Doorstep SHALL provide direct access, in at most one tap, to View Past Walks and Stats & Badges, in addition to its existing Start Walk button and Den footer tease. These SHALL be visually subordinate to the Start Walk button — the Doorstep SHALL continue to present exactly one primary call to action.

#### Scenario: Direct access to Walk History and Stats
- **WHEN** the Doorstep is shown
- **THEN** it SHALL show a way to reach View Past Walks and a way to reach Stats & Badges, each requiring no more than one tap

#### Scenario: Start Walk remains the sole primary action
- **WHEN** the Doorstep is shown
- **THEN** no other control on it SHALL match the Start Walk button's visual prominence

### Requirement: The Burger Menu Holds Secondary and Debug Actions
The Doorstep SHALL provide a burger-menu control that opens an overlay listing Debug Log and Log a Walk We Missed. The overlay SHALL be dismissible without navigating away from the Doorstep, and selecting either item SHALL open that screen directly.

#### Scenario: Opening the burger menu
- **WHEN** the player taps the Doorstep's burger-menu control
- **THEN** an overlay SHALL appear listing Debug Log and Log a Walk We Missed, and no other full-screen navigation SHALL occur

#### Scenario: Selecting a burger-menu item
- **WHEN** the player selects Debug Log or Log a Walk We Missed from the burger menu
- **THEN** that screen SHALL open, and the burger-menu overlay SHALL close

### Requirement: Away-Strip Facts Surface Once Per App Launch, Not Once Per Doorstep Visit
The "While You Were Out" strip's facts (accrued treats, an idle-accrued achievement, storage-at-cap, and the one-off territory-income reveal) SHALL each be evaluated and shown at most once per app process launch, even though the Doorstep may be shown to the player multiple times within that same launch.

#### Scenario: Returning to the Doorstep does not re-show an already-shown away-strip fact
- **WHEN** the player has already seen the Doorstep once this app launch and returns to it again later in the same launch, with no new accrual or event since the first visit
- **THEN** the away-strip SHALL show no lines it already showed on the first visit this launch

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

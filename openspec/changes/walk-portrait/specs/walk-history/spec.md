## MODIFIED Requirements

### Requirement: Each entry identifies the walk
The system SHALL show, for each walk in the history list, enough information to distinguish it from others: at minimum its date/time and whether it covered enough ground to qualify for a reward. A walk that did not qualify SHALL be described with warm, non-judgmental language, never as a shortfall ("Too short"), and SHALL NOT be greyed out, disabled, or otherwise made to look locked or lesser. Every entry, regardless of `startSource` or reward-qualifying status, SHALL be tappable to open that walk's Walk Portrait (see the new "Walk Portrait" requirement below); the Delete action SHALL remain its own separate tap target within the row, not the row itself.

#### Scenario: Distinguishing closed from open walks
- **WHEN** the history list is displayed
- **THEN** each entry indicates whether that walk covered enough ground to qualify for a reward, or was a shorter stroll, using warm rather than deficit-framed language

#### Scenario: A manual-log entry is never a dead end
- **WHEN** the history list displays a manually-logged walk (`startSource: 'manual-log'`)
- **THEN** that entry SHALL look and behave identically to a tracked walk's entry — same tap target, same visual treatment, never greyed out or disabled

#### Scenario: Tapping a row opens its Walk Portrait
- **WHEN** the user taps anywhere on a walk's row other than its Delete action
- **THEN** that walk's Walk Portrait SHALL open

## ADDED Requirements

### Requirement: Walk Portrait Shows a Walk's Own Route in Context
Opening a walk from the history list SHALL show that walk's own recorded route, auto-fit to that walk's own extent, on top of a muted rendering of the player's full Home Range — so the walk reads as "this walk, inside everything the dog has ever walked," not in isolation and not conflated with the Home Range's own live coloring. The Home Range background rendering in this view SHALL NOT use the Bloom's freshness-driven color range (no "wildness colour"); it SHALL render as a single muted tone.

#### Scenario: Opening a tracked walk's Portrait
- **WHEN** the user opens a Walk Portrait for a walk that has its own recorded GPS trail
- **THEN** that trail SHALL be shown auto-fit to its own bounds, with the aggregate Home Range visible behind it at reduced, non-wildness-coded visual weight

#### Scenario: No map controls
- **WHEN** a Walk Portrait is open
- **THEN** the map SHALL NOT support panning, zooming, or any other gesture-driven navigation

### Requirement: A Walk's Trail Draws On Once Per Open
The walk's trail SHALL animate from its start to its end over a short, fixed duration each time its Walk Portrait is opened, rather than appearing instantly as a static shape.

#### Scenario: Trail animates on open
- **WHEN** a Walk Portrait opens for a walk with a recorded or linked trail
- **THEN** the trail SHALL visibly draw from start to finish once, and SHALL NOT replay on its own afterward without the screen being reopened

### Requirement: New Ground Segments Are Visually Distinguished
Whichever parts of a walk's own trail were New Ground discoveries at the time that walk happened SHALL render in a visually brighter tone than the rest of that trail. A walk with no New Ground of its own SHALL render its entire trail in one uniform tone, with no additional copy implying a discovery that didn't happen.

#### Scenario: A walk that discovered new ground
- **WHEN** a walk's own New Ground segments are known
- **THEN** those segments SHALL render brighter than the rest of that walk's trail

#### Scenario: A walk with no New Ground
- **WHEN** a walk discovered no New Ground of its own, or that information was never recorded for it
- **THEN** its entire trail SHALL render in one uniform tone

### Requirement: Manual-Log Walks Get an Equally Designed Portrait, Never a Dead End
A manually-logged walk's Walk Portrait SHALL show the route of whichever previously-tracked route it refreshed, if any, with the same layout and visual treatment as a tracked walk's own Portrait. A manual log with no linked route SHALL instead show the player's aggregate Home Range, centered and calm, with copy that affirms the walk still counted rather than describing an error or missing state.

#### Scenario: A manual log with a linked route
- **WHEN** the user opens the Walk Portrait for a manual log that refreshed a specific previously-tracked route
- **THEN** that route's own trail SHALL be shown, laid out identically to a tracked walk's own Portrait

#### Scenario: A manual log with no linked route
- **WHEN** the user opens the Walk Portrait for a manual log that did not refresh any route
- **THEN** the player's aggregate Home Range SHALL be shown instead, with copy affirming the walk counted, and SHALL NOT read as an error, a missing-data state, or a broken image

#### Scenario: A linked route that no longer exists
- **WHEN** a manual log's linked route has since been deleted from history
- **THEN** its Walk Portrait SHALL fall back to the aggregate Home Range state above, not a broken reference

### Requirement: Walk Portrait Metadata Row
Below its map, a Walk Portrait SHALL show a muted, non-evaluative row of this walk's date (with a place-anchored description where a location can be resolved), distance, duration, and treats earned, wherever those figures are meaningful for that walk's state. It SHALL NOT include any pace, speed, ranking, comparison to another walk, or share/export action.

#### Scenario: A walk with a known route
- **WHEN** a Walk Portrait has a real trail to show (tracked, or a manual log with a linked route)
- **THEN** its metadata row SHALL show date, distance, duration, and treats earned

#### Scenario: A manual log with no linked route
- **WHEN** a Walk Portrait has no trail of its own to show
- **THEN** its metadata row SHALL show date and treats earned only, omitting distance and duration rather than showing a placeholder or zero value

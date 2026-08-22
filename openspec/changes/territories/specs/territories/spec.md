Note for whoever applies this delta: this is a brand-new capability — there is no existing `openspec/specs/territories/spec.md` to diff against. On apply, this becomes a new spec file; its `## Purpose` should read: "Defines Buddy's Territories — the partition of the single persistent Home Range grid (`home-range`) into named, auto-discovered sub-regions, their auto-birth/assimilation/merge rules, per-territory presentation stats, and the one-title-per-territory character system. This capability adds no new mechanic of its own beyond partitioning and naming an already-existing grid; the passive-income addition it enables is specified in `den-economy`."

## ADDED Requirements

### Requirement: Every Home Range Cell Belongs to Exactly One Territory
The system SHALL partition every cell of the Home Range grid into exactly one Territory at all times (after the one-time migration backfill completes), never zero and never more than one. A Territory SHALL be identified by a stable id, a player-editable name, and the timestamp it was first created.

#### Scenario: A newly painted cell always resolves to a territory
- **WHEN** a live-tracked walk paints a cell that has never been part of the Home Range before
- **THEN** that cell SHALL belong to exactly one Territory by the time the walk finishes, whether an existing one or a newly created one

### Requirement: A New Territory Is Born Only Far From Every Existing Territory
The system SHALL create a new Territory from newly painted ground only when that ground's nearest cell is farther than a configured distance threshold from the nearest cell of every existing Territory. Newly painted ground within that threshold of exactly one existing Territory SHALL join that Territory instead, even if its cells do not directly touch that Territory's existing cells.

#### Scenario: Ground far from every territory births a new one
- **WHEN** a walk paints ground whose nearest cell is farther than the configured threshold from every existing Territory's nearest cell
- **THEN** a new Territory SHALL be created from that ground

#### Scenario: Ground near exactly one territory joins it without requiring direct contact
- **WHEN** a walk paints ground within the configured threshold of exactly one existing Territory, with a gap of unpainted cells between them
- **THEN** that ground SHALL join the nearby Territory, and no new Territory SHALL be created

### Requirement: Two Territories Merge Only When Their Cells Become Adjacent or Overlapping
The system SHALL merge two different Territories into one whenever any cell of one becomes 8-neighbour-adjacent to or overlapping with any cell of the other, using the same adjacency rule the Home Range's own New Ground detection already uses. The merged Territory SHALL keep the older of the two Territories' id, name, and creation timestamp. Each of the merged Territory's monotonic counters SHALL equal the sum of both source Territories' values for that counter.

#### Scenario: Adjacent territories merge
- **WHEN** a walk causes two previously separate Territories' cells to become directly adjacent
- **THEN** the two Territories SHALL merge into one, keeping the older Territory's name and id

#### Scenario: Merged counters sum, never reset
- **WHEN** two Territories merge
- **THEN** the merged Territory's walk count and lifetime treats-earned counter SHALL each equal the sum of the two source Territories' values, not either value alone and not zero

#### Scenario: Nearby but non-touching territories do not merge
- **WHEN** two Territories' cells come within the birth/assimilation distance of each other but no cell of either is directly adjacent to or overlapping a cell of the other
- **THEN** the two Territories SHALL remain separate

### Requirement: A New Territory Is Named via Reverse-Geocode, With a Non-Empty Fallback
The system SHALL name a newly created Territory using a reverse-geocoded place name of its founding ground. If reverse-geocoding fails to resolve any usable place name, the system SHALL assign a non-empty, non-technical fallback name rather than leaving the Territory unnamed or showing an error state.

#### Scenario: Reverse-geocoding succeeds
- **WHEN** a new Territory is created and its founding ground's location resolves to a real place name
- **THEN** the Territory's name SHALL incorporate that place name

#### Scenario: Reverse-geocoding fails
- **WHEN** a new Territory is created and reverse-geocoding fails to resolve any usable place name
- **THEN** the Territory SHALL still be created with a non-empty fallback name, never left unnamed or shown with an error

### Requirement: A Territory Can Be Renamed Anytime, Never During the Post-Walk Celebration
The system SHALL allow the player to rename any Territory at any time from that Territory's own card. The post-walk celebration screen SHALL NOT offer a rename control.

#### Scenario: Renaming from the territory card
- **WHEN** the player edits a Territory's name from its own card
- **THEN** the new name SHALL be saved and displayed everywhere that Territory's name appears

#### Scenario: No rename control on the celebration screen
- **WHEN** the post-walk celebration screen is shown, including one where a new Territory was just created
- **THEN** it SHALL NOT show a text input or rename control for that Territory

### Requirement: Per-Territory Stats Are Shown Only on That Territory's Own Card, Never Compared
Each Territory's card SHALL show exactly four stats scoped to that Territory alone: streets known (derived from that Territory's own cell count), walk count, lifetime treats earned while walking there, and the date it was first claimed. The system SHALL NOT show a ranked list of Territories by any metric, a percentage-of-total for any Territory stat, a "strength" or "health" score, or a visible days-since-last-visited value, for any Territory.

#### Scenario: A territory card shows its own four stats
- **WHEN** a Territory's card is displayed
- **THEN** it SHALL show that Territory's own streets-known count, walk count, lifetime treats earned there, and first-claimed date, and no other Territory's values

#### Scenario: No ranking or comparison surface exists
- **WHEN** the list of the player's Territories is displayed anywhere in the app
- **THEN** it SHALL NOT be sorted or labeled by any comparative metric, and no Territory SHALL show a percentage-of-total, strength/health score, or days-since-visited value

### Requirement: A Discovery Beat Fires Only When an Additional Territory Is Created
The post-walk celebration screen SHALL show a discovery beat when a walk creates a new Territory, except when that new Territory is the player's very first Territory ever. The celebration screen SHALL separately show a distinct beat when a walk causes two Territories to merge.

#### Scenario: A second territory triggers the discovery beat
- **WHEN** a walk creates a new Territory and the player already had at least one Territory before this walk
- **THEN** the celebration screen SHALL show the new-territory discovery beat

#### Scenario: The player's first-ever territory is silent
- **WHEN** a walk creates a Territory and the player had no Territory before this walk
- **THEN** the celebration screen SHALL NOT show the new-territory discovery beat

#### Scenario: A merge triggers its own beat
- **WHEN** a walk causes two Territories to merge
- **THEN** the celebration screen SHALL show a distinct merge beat, framed as a positive event, never a loss

### Requirement: Exactly One Character Title Per Territory, Computed Live, Never Forced
The system SHALL compute, on each display of the player's Territories, at most one character title per Territory from a fixed set of categories (at minimum: most walks, highest current average wildness, and furthest from the player's oldest Territory), such that no Territory ever displays more than one title at once. A category SHALL go unawarded in that computation rather than being forced onto a Territory that already holds a different title. A player with exactly one Territory SHALL see no title.

#### Scenario: Categories resolve to distinct territories
- **WHEN** the player has at least as many Territories as title categories and each category's winning Territory is distinct
- **THEN** each Territory SHALL show its own single title

#### Scenario: A tied category goes unawarded rather than double-stacked
- **WHEN** a title category's winning Territory already holds a different, higher-priority title
- **THEN** that category SHALL go unawarded in this computation rather than causing any Territory to display two titles

#### Scenario: A single territory shows no title
- **WHEN** the player has exactly one Territory
- **THEN** no title SHALL be shown for it

### Requirement: A Manually Logged Walk Never Affects Territory Structure or Stats
A manually logged walk (no live GPS trail) SHALL NOT create, assimilate into, or merge any Territory, and SHALL NOT increment any Territory's walk count or treats-earned counter.

#### Scenario: A manual log does not affect any territory
- **WHEN** the player logs a missed walk with no GPS trail
- **THEN** no Territory SHALL be created, merged, or have its stats changed as a result

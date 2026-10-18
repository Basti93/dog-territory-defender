# Home Range Specification

## Purpose

Defines the Home Range: a persistent, per-player spatial grid replacing the one-polygon-per-walk territory model, tracked as two rendering layers (the Range, a permanent monotonic outline of everywhere the player has ever walked, and the Bloom, a colour-only freshness fill) plus a `visits` ghost-trail brightness channel. Numeric thresholds here are load-bearing — see `docs/decisions/` for the introducing change's `design.md` before changing any of them.

## Requirements

### Requirement: The Home Range Is a Persistent Grid, Not a Per-Walk Shape
The system SHALL model territory as a persistent grid of fixed-size cells (20m square), each carrying its own `lastRefreshed`, `lastTracked`, and `visits` state, rather than as a separate shape computed per walk.

#### Scenario: A cell's state persists across walks
- **WHEN** a cell is painted by one walk and later walked again by a different walk
- **THEN** that cell's `lastRefreshed`/`visits` state SHALL reflect the more recent walk, not create a second, separate record

### Requirement: The Range Is Monotonic and Never Shrinks
The Range — the set of every cell ever painted by a live-GPS-tracked walk — SHALL only ever grow. No player action, including deleting a previously saved walk from history, SHALL remove a cell from the Range once painted.

#### Scenario: Deleting a walk does not shrink the Range
- **WHEN** the user deletes a previously saved tracked walk from their walk history
- **THEN** the cells that walk painted SHALL remain part of the Range, and the Range SHALL NOT visibly shrink as a result

#### Scenario: Range never decreases across normal play
- **WHEN** any sequence of walks is recorded over time
- **THEN** the total number of cells in the Range SHALL never decrease from one walk to the next

### Requirement: Every Live-Tracked Walk Paints the Range, Regardless of Shape
The system SHALL paint every cell within the painting radius of a live-tracked walk's recorded path into the Home Range, whether or not that walk forms a closed loop, subject to the anti-exploit segment guards (gap and speed) that prevent painting through a signal dropout or a non-walking mode of travel.

#### Scenario: A straight out-and-back walk paints its full path
- **WHEN** a live-tracked walk goes out and back down the same street without forming a loop
- **THEN** the cells along that path SHALL be painted into the Range

#### Scenario: A GPS signal dropout does not paint a false corridor
- **WHEN** consecutive GPS fixes are farther apart than the maximum segment gap, or imply travel faster than the maximum walking speed
- **THEN** the cells between those two fixes SHALL NOT be painted

### Requirement: The Bloom Renders Freshness as Colour Only, With a Visible Floor
Each Range cell SHALL render a freshness value derived only from elapsed time since it was last refreshed, as hue/saturation — never as a number, percentage, or bar. Every Range cell SHALL remain equally visually present (constant fill opacity) regardless of its freshness, so a long-untouched cell never fades toward the base map.

#### Scenario: No numeric freshness readout
- **WHEN** the Bloom fill is rendered anywhere in the UI
- **THEN** no percentage, count, or numeric readout of freshness SHALL be shown alongside it

#### Scenario: An old cell stays visually present
- **WHEN** a cell was last refreshed a long time ago
- **THEN** it SHALL render at the same fill opacity as a recently refreshed cell, differing only in colour

### Requirement: Freshness Has a Hard Ceiling and No Unbounded Decay
A cell's wildness SHALL reach its maximum value within 18 days of last being refreshed and SHALL NOT continue changing beyond that point, however long the cell goes unrefreshed after that.

#### Scenario: Wildness stops changing after the ceiling
- **WHEN** a cell has not been refreshed for more than 18 days
- **THEN** its rendered wildness SHALL be identical whether it has been 18 days or 18 months

### Requirement: New Ground Detection Ignores GPS Jitter
The system SHALL detect "New Ground" (cells painted by this walk that are neither already in the Range nor adjacent to a Range cell) using an 8-neighbour dilation against the Range, so that GPS jitter on an already-known route does not repeatedly register as new ground.

#### Scenario: A repeated walk on a known route does not fire New Ground
- **WHEN** a previously walked route is walked again with normal GPS jitter
- **THEN** New Ground SHALL NOT fire for that walk

#### Scenario: A genuinely unwalked street fires New Ground
- **WHEN** a walk covers a street with no previously painted cell within one cell of it
- **THEN** New Ground SHALL fire once enough new cells are painted to clear the detection threshold

### Requirement: Existing Recorded Walks Seed the Home Range Once
The system SHALL replay every previously saved walk that has a real GPS location trail into the Home Range exactly once, using that walk's own recorded time (not the replay time) to seed each painted cell's freshness, so historical walks appear as their true age rather than as freshly walked. Walks with no location trail (manually logged walks) SHALL NOT be replayed, since a manual log cannot discover ground it has no GPS evidence for.

#### Scenario: A year-old walk seeds a wild patch, not a fresh one
- **WHEN** a walk recorded a year before this feature shipped is replayed into the Home Range
- **THEN** the cells it paints SHALL render at full wildness, not as freshly walked

#### Scenario: The replay runs at most once
- **WHEN** the app is opened for a second time after the Home Range feature ships
- **THEN** previously saved walks SHALL NOT be replayed again

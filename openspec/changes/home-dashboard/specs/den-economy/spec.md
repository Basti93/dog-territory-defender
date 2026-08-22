## MODIFIED Requirements

### Requirement: Milestone Titles Are Front-Loaded and Never Final
At a front-loaded, ever-widening sequence of levels, Buddy SHALL earn a text-only title with no fixed final title, no numeric maximum shown (no "/100", no percentage), and no state that forecloses future growth. In addition to the one-away cliffhanger's use of the title attached to an *upcoming* milestone level, the system SHALL be able to report Buddy's *currently held* title — the most recently attained milestone title at or below his present Level — for use anywhere his Level is displayed as an ongoing readout, not only at the moment a new milestone is reached.

#### Scenario: Title sequence has no final entry
- **WHEN** a player reaches the highest currently-authored milestone title
- **THEN** the system SHALL NOT present this as a final or maximum achievement, and the milestone sequence SHALL continue to be computable (even if uncopy-written) beyond that level

#### Scenario: Current title is available between milestone levels
- **WHEN** Buddy's Level is above the first milestone level but not itself an exact milestone level
- **THEN** the system SHALL still report the most recently attained milestone title as his current title

#### Scenario: No title before the first milestone
- **WHEN** Buddy's Level is below the first milestone level
- **THEN** the system SHALL report no current title, rather than an empty or placeholder string

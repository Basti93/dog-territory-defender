# Visual Design Specification

## Purpose

Defines the visual identity, tone, design tokens, and screen-level interaction intent for Dog Territory Defender, so every build — prototype or production — reads as warm, spring-like, and dog-centric. Design North Star: after a walk, the player looks at the map and thinks "I just did that. My dog did that. We belong here."

## Requirements

### Requirement: Design Tokens
The system SHALL use exactly these design tokens, extended only via a new entry in `DECISIONS.md`:
- Primary green (territory/growth): `#2ECC71`
- Sky blue (map/safety): `#3498DB`
- Warm accent (collectibles/joy): `#F39C12`
- Dog brown (UI elements, badges): `#8B6F47`
- White/neutral: `#FAFAF8`
- Headline typeface: rounded sans (e.g. Sora or Nunito) — friendly, not corporate
- Body typeface: clean sans (e.g. Inter) — readable at small sizes
- Minimum text size: never below 12px, for outdoor readability

#### Scenario: New color needed
- **WHEN** a screen needs a color not in the token list
- **THEN** it SHALL NOT be added without a corresponding entry in `DECISIONS.md`

### Requirement: Tone and Language Rules
Copy and UI language SHALL be warm and celebratory, not transactional, and SHALL NOT use aggressive or PvP language. Use "claim," "defend," "protect" — never "conquer," "destroy," "kill," "battle."

#### Scenario: Competitive interaction copy
- **WHEN** copy describes territory overlap or a player-vs-player interaction
- **THEN** it SHALL use "claim / defend / protect" phrasing and SHALL NOT use "conquer / destroy / kill / battle" phrasing

### Requirement: No Dark Mode
The system SHALL NOT offer a dark mode. Dark mode is considered too aggressive for the product's outdoor, spring vibe.

#### Scenario: Theme options presented to user
- **WHEN** a settings or appearance screen is built
- **THEN** it SHALL NOT include a dark mode option

### Requirement: Additional Exclusions
Beyond dark mode and PvP language, the system SHALL avoid gamey chrome (XP bars everywhere, battle UI, power meters) and SHALL NOT use dog photos — dogs SHALL be rendered as illustrations/avatars instead, for inclusivity and playfulness.

#### Scenario: Dog rendering
- **WHEN** a dog is displayed anywhere in the UI
- **THEN** it SHALL be rendered as an illustration/avatar, not a photo

### Requirement: Key Screen Intents
The following four key screens SHALL follow this intent:
- **Map View (Active Walk):** the map dominates full screen; walk-in-progress state is obvious (time, distance); pause/stop controls are easy to reach but not accidental to trigger.
- **Territory Claimed (Post-Walk Celebration):** the peak-joy moment; shows what was claimed and the dog's XP/level progress; ends with clear momentum toward the next walk.
- **Dog Profile:** the dog is the star; stats are about walks and community, not power creep; badges feel earned.
- **Leaderboard:** friendly competition that celebrates all dogs; reached by tapping from the map (modal), not as a separate primary tab, so the map stays primary.

#### Scenario: Territory claimed celebration
- **WHEN** a walk closes and claims new territory
- **THEN** the post-walk screen SHALL show what was claimed and the dog's XP/level progress, and SHALL end with a clear call to the next walk

### Requirement: Delight Interaction Moments
Where the relevant screen exists, the system SHALL implement: paw prints appearing briefly on pull-to-refresh on the map; a bounce plus a "ding" sound when a collectible is tapped and collected; a subtle red outline on overlapping rival territory (the player's own territory stays green) with a "defend" action (walk it again) available on tap; a full-screen celebration with a tail-wag animation and a ticking XP counter on dog level-up; and gentle, not aggressive, confetti at the end of a walk.

#### Scenario: Rival territory overlap
- **WHEN** the player's territory overlaps a rival's
- **THEN** the rival's territory SHALL show a subtle red outline while the player's own territory stays green, and tapping it SHALL offer a "defend" action

### Requirement: Phase-Scoped Visual Delivery
Visual and UI work SHALL be scoped to the current target phase only (per `game-phases`): the target phase SHALL be confirmed before building, only that phase's screens and components SHALL be added, existing design tokens and components SHALL be reused rather than rebuilt, and anything belonging to a later phase SHALL be recorded as a parked backlog note instead of being built early.

#### Scenario: Visual update requested
- **WHEN** a visual or UI update is requested for the prototype or the production app
- **THEN** the target phase SHALL be confirmed first, only that phase's screens/components SHALL be added, and any later-phase idea SHALL be parked rather than built

### Requirement: Success Criteria
The visual design SHALL be considered successful when all of the following hold: a parent looking at the app says it makes the dog walk more fun, not stressful; the map remains the primary visual element with UI chrome fading into the background; claiming territory feels like "I made my mark on the neighborhood," not "I leveled up a metric"; and two people walking together can both play at once without feeling like competitors.

#### Scenario: Design review against success criteria
- **WHEN** a phase's visual design is reviewed
- **THEN** it SHALL be checked against all four success criteria before being considered done

## ADDED Requirements

### Requirement: Buddy Coat Palette
The system SHALL use exactly these colours for rendering the Buddy avatar, in addition to the Design Tokens. They SHALL be used only inside the Buddy avatar and its appearance picker swatches, never for UI chrome, text or backgrounds. Outlines and shading on the avatar SHALL reuse Dog brown `#8B6F47`; the "Zzz" mark SHALL reuse Sky blue `#3498DB`; confetti and sparkles SHALL reuse existing tokens only.
- Coats: cream `#F3E3C3`, golden `#E0A94E`, ginger `#C8672E`, chocolate `#6B4429`, charcoal `#4A423E` (warm, deliberately not pure black), grey `#A9A8A2`, white `#F7F2EA` (off-white so it reads on `#FAFAF8`), tricolour (base `#F7F2EA` with ginger and charcoal patches)
- Accent (muzzle and belly): cream `#FBEFD5`, white `#FFFDF7`, tan `#E8C99A`
- Nose: dark `#2B2523`, brown `#5A3A28`, pink `#E59A9A` (the pink also serves as tongue and cheek blush)

#### Scenario: Colour needed on the avatar that is not listed
- **WHEN** the avatar or its picker needs a colour not in the Design Tokens or this palette
- **THEN** it SHALL NOT be added without an OpenSpec change explaining why

#### Scenario: Coat colour used outside the avatar
- **WHEN** a screen needs a colour for text, buttons or backgrounds
- **THEN** it SHALL NOT use a coat, accent or nose colour

### Requirement: Illustration Style
The system SHALL render characters, Den buildings and icons as pre-rendered 3D illustration sprites: PNG images with a soft clay / Pixar-style look, rounded shapes, the spring pastel palette from the Design Tokens, soft studio lighting, a slight top-down three-quarter view, a transparent background and no text. Motion SHALL be produced by code (move, scale, bounce, layer) on these sprites. The system SHALL NOT ship real-time 3D rendering (no 3D engine, GLB models or GL views) in Phase 1. Vector or flat placeholders MAY be shown until a sprite exists.

#### Scenario: Sprite available
- **WHEN** a screen needs a building, icon or character image and the sprite exists in the art registry
- **THEN** it SHALL show the PNG sprite and animate it with transforms only

#### Scenario: Sprite not yet generated
- **WHEN** the sprite for an element does not exist yet
- **THEN** the screen SHALL show its placeholder and SHALL NOT fail to bundle or render

#### Scenario: Real-time 3D proposed in Phase 1
- **WHEN** a change proposes real-time 3D rendering in Phase 1
- **THEN** it SHALL be deferred, because Phase 1 uses pre-rendered sprites only

## MODIFIED Requirements

### Requirement: Additional Exclusions
Beyond dark mode and PvP language, the system SHALL avoid gamey chrome (XP bars everywhere, battle UI, power meters) and SHALL NOT use dog photos — dogs SHALL be rendered as illustrations/avatars instead, for inclusivity and playfulness. The player MAY customise the avatar's look to resemble their own dog (see `buddy-avatar`), but SHALL NOT be able to import a photo.

#### Scenario: Dog rendering
- **WHEN** a dog is displayed anywhere in the UI
- **THEN** it SHALL be rendered as an illustration/avatar, not a photo

#### Scenario: Player wants their real dog shown
- **WHEN** the player wants Buddy to look like their own dog
- **THEN** the app SHALL offer appearance options for the avatar and SHALL NOT offer a photo import

### Requirement: Delight Interaction Moments
Where the relevant screen exists, the system SHALL implement: paw prints appearing briefly on pull-to-refresh on the map; a bounce plus a "ding" sound when a collectible is tapped and collected; a subtle red outline on overlapping rival territory (the player's own territory stays green) with a "defend" action (walk it again) available on tap; a full-screen celebration with a tail-wag animation and a ticking XP counter on dog level-up; and gentle, not aggressive, confetti at the end of a walk. Additionally, presentation-only delight SHALL include: Buddy's idle life and tap reaction; spring press feedback on primary buttons; count-up tickers for treats and XP on the Celebration screen; a small "+N" treat float on Den upgrade; a short fade-and-slide transition on screen changes; and, on a first open of the day only, a gentle pulse on Start Walk. These moments SHALL NOT introduce any guilt signal (no streak, no days-away count, no sad states), SHALL NOT appear on the live map during a walk, and SHALL be skippable by simply tapping through (no input blocking longer than 2 seconds).

#### Scenario: Rival territory overlap
- **WHEN** the player's territory overlaps a rival's
- **THEN** the rival's territory SHALL show a subtle red outline while the player's own territory stays green, and tapping it SHALL offer a "defend" action

#### Scenario: Walk celebrated
- **WHEN** the Celebration screen appears
- **THEN** treats and XP SHALL count up, confetti of 20 to 30 pieces in spec token colours SHALL fall for about 2 seconds, and Buddy SHALL be excited with a wagging tail

#### Scenario: Primary button pressed
- **WHEN** the player presses a primary button
- **THEN** it SHALL scale down slightly on press and spring back on release

#### Scenario: Start Walk pulse
- **WHEN** the Doorstep session is a first open of the day
- **THEN** Start Walk MAY pulse gently, and on any other session it SHALL NOT pulse, and no number or text SHALL refer to missed walks

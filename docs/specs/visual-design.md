# Visual Design Specification

## Purpose

Defines the visual identity, tone, design tokens, and screen-level interaction intent for Dog Territory Defender, so every build — prototype or production — reads as warm, spring-like, and dog-centric. Design North Star: after a walk, the player looks at the map and thinks "I just did that. My dog did that. We belong here." Guiding principle: the walk is the heartbeat — phone stays in the owner's pocket, eyes on the dog, minimal audio-first cues — and the actual game experience (Den progression, async events, upgrade decisions) lives in the 23.5 hours between walks, not during them.

## Requirements

### Requirement: Design Tokens
The system SHALL use exactly these design tokens, extended only via the introducing change's `proposal.md`/`design.md` explaining why:
- Primary green (territory/growth, Bloom "fresh" end): `#2ECC71`
- Wild meadow (Bloom "wild" end — see `docs/decisions/` home-range's `design.md` Decision 2): `#DCE8BE`
- Sky blue (map/safety): `#3498DB`
- Warm accent (collectibles/joy): `#F39C12`
- Dog brown (UI elements, badges): `#8B6F47`
- White/neutral: `#FAFAF8`
- Headline typeface: rounded sans (e.g. Sora or Nunito) — friendly, not corporate
- Body typeface: clean sans (e.g. Inter) — readable at small sizes
- Minimum text size: never below 12px, for outdoor readability

#### Scenario: New color needed
- **WHEN** a screen needs a color not in the token list
- **THEN** it SHALL NOT be added without a corresponding OpenSpec change explaining why

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
The following five key screens SHALL follow this intent:
- **Map View:** the map dominates full screen. While a walk is active, walk-in-progress state is obvious (time, distance) and Finish/Cancel controls are easy to reach but not accidental to trigger. While idle (no walk active), the map SHALL show the player's full Home Range — the Range outline and Bloom fill — so the accumulated result of every past walk stays visible rather than disappearing once a walk ends, and rendered as the soft rounded outline / colour-only freshness fill described in `docs/decisions/` home-range's `design.md`, not as separate per-walk shapes.
- **Territory Claimed (Post-Walk Celebration):** the peak-joy moment; shows what was claimed and the dog's XP/level progress; ends with clear momentum toward the next walk.
- **Dog Profile:** the dog is the star; stats are about walks and community, not power creep; badges feel earned.
- **Leaderboard:** friendly competition that celebrates all dogs; reached by tapping from the map (modal), not as a separate primary tab, so the map stays primary.
- **Den (Home Base):** the dog's buildable home base; the current "next upgrade" is always visible with its cost; buildings feel alive (idle touches, spring theming) rather than a stat dashboard; upgrading a building reads as building a bigger yard for the dog, not leveling a stat.

#### Scenario: Territory claimed celebration
- **WHEN** a walk closes and claims new territory
- **THEN** the post-walk screen SHALL show what was claimed and the dog's XP/level progress, and SHALL end with a clear call to the next walk

#### Scenario: Den screen visited
- **WHEN** the player opens the Den screen
- **THEN** the current cheapest affordable upgrade SHALL be visibly called out, and the screen SHALL avoid stat-dashboard chrome (bare progress bars, power meters) in favor of a home-base feel

#### Scenario: Idle map shows accumulated territory
- **WHEN** the player opens the app or returns to the map with no walk currently active
- **THEN** the player's full Home Range (Range outline plus Bloom fill) SHALL be visible on the map, reflecting every walk ever recorded, not just the most recently finished one

### Requirement: Postcards on the Bench (Album)
Every finished tracked walk that went somewhere SHALL be a two-sided postcard, derived from the walk (nothing extra is stored); a walk that painted nothing gets none, and a manual log is a handwriting-only card (no route, no flip). The front is the walk's trail on the muted patchwork; the back is handwritten (`hand` font, ink green): weekday plus part of the day (Morgen, Vormittag, Mittag, Nachmittag, Abend, Nacht), the distance, "drei neue Straßen" only when there were new streets, one Buddy line chosen from what was special that day (new territory, first-time place, long walk, morning/evening/night, with a fallback pool), and a postmark with the territory name. The bench in the yard SHALL fan the 3 newest cards as small static paper cards (no WebView, no text, no counter); one card, Buddy's favourite (first-time place, else new territory, else longest walk), carries a small paw stamp without explanation. Tapping the bench opens the Album: a calm grid of every card, newest first, never pruned; an opened card turns over by tap or swipe, and Back turns it face-up before closing it. Cards SHALL NOT compare walks, show a total, or offer share/export, and the card stays quiet: it does not repeat the homecoming's star number as a headline.

#### Scenario: Bench with many walks
- **WHEN** the player has more than three cards
- **THEN** only the three newest are on the bench, with no number anywhere, and tapping the bench opens the Album

#### Scenario: Opening a card
- **WHEN** the player taps a card in the Album and then taps or swipes it
- **THEN** it turns over (a transform, never an opacity fade, because the front hosts a WebView) to the handwritten back, and at most one card WebView exists at a time

### Requirement: Delight Interaction Moments
Where the relevant screen exists, the system SHALL implement: paw prints appearing briefly on pull-to-refresh on the map; a bounce plus a "ding" sound when a collectible is tapped and collected; a subtle red outline on overlapping rival territory (the player's own territory stays green) with a "defend" action (walk it again) available on tap; a full-screen celebration with a tail-wag animation and a ticking XP counter on dog level-up; and gentle, not aggressive, confetti at the end of a walk.

#### Scenario: Rival territory overlap
- **WHEN** the player's territory overlaps a rival's
- **THEN** the rival's territory SHALL show a subtle red outline while the player's own territory stays green, and tapping it SHALL offer a "defend" action

### Requirement: Backlog-Scoped Visual Delivery
Visual and UI work SHALL be scoped to what has been pulled from the backlog (`game-backlog`): only the pulled item's screens and components SHALL be added, existing design tokens and components SHALL be reused rather than rebuilt, and anything not yet pulled SHALL stay recorded in the backlog spec instead of being built early.

#### Scenario: Visual update requested
- **WHEN** a visual or UI update is requested for the prototype or the production app
- **THEN** only the pulled item's screens/components SHALL be added, and any other idea SHALL be parked in the backlog rather than built

### Requirement: Success Criteria
The visual design SHALL be considered successful when all of the following hold: a parent looking at the app says it makes the dog walk more fun, not stressful; the map remains the primary visual element with UI chrome fading into the background; claiming territory feels like "I made my mark on the neighborhood," not "I leveled up a metric"; and two people walking together can both play at once without feeling like competitors.

#### Scenario: Design review against success criteria
- **WHEN** a visual design is reviewed
- **THEN** it SHALL be checked against all four success criteria before being considered done

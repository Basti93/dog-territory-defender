## ADDED Requirements

### Requirement: Buddy Is a Vector Avatar, Never a Photo
The system SHALL render the player's dog everywhere as an animated vector illustration ("Buddy") built from SVG pieces in the app. It SHALL NOT display, accept, store, or process a photo of the dog. The dog's name is the one already stored in `DenEconomyState.dogName`.

#### Scenario: Dog shown on any screen
- **WHEN** a dog is displayed on any screen
- **THEN** it SHALL be the Buddy avatar rendered from the player's saved appearance, not an emoji or a photo

#### Scenario: Player wants Buddy to look like their own dog
- **WHEN** the player opens the appearance picker
- **THEN** they SHALL be able to choose coat, markings, ear style, tail style, size and accent colour, with a live animated preview

### Requirement: Buddy Appearance Model and Persistence
Buddy's look SHALL be a record of `coat` (cream, golden, ginger, chocolate, charcoal, grey, white, tricolour), `markings` (none, patch, socks, mask), `earStyle` (floppy, pointy, folded), `tailStyle` (curly, straight, stubby), `size` (small, medium, large), and `accentColour` (cream, white, tan). It SHALL persist locally through a `BuddyAppearanceRepository` with a SQLite implementation and an in-memory fake that pass the same contract test. A default appearance SHALL always exist, so reading the appearance never fails or blocks the app. An unrecognised stored value SHALL fall back to that field's default rather than throw.

#### Scenario: Fresh install, nothing saved
- **WHEN** the appearance is read and nothing has ever been saved
- **THEN** the default appearance SHALL be returned and `hasChosen()` SHALL be false

#### Scenario: Appearance saved
- **WHEN** an appearance is saved and then read back
- **THEN** every field SHALL round-trip unchanged and `hasChosen()` SHALL be true

#### Scenario: Stored value from a future or corrupt row
- **WHEN** a stored field holds a value that is not in the current option set
- **THEN** that field SHALL read as its default and the other fields SHALL be unaffected

### Requirement: Appearance Chosen at First Launch, Editable Later
Right after the dog-naming prompt at first launch, the system SHALL show a skippable "What does {name} look like?" step with a live preview. Skipping SHALL save the default appearance. Players who already named their dog before this change SHALL NOT be shown the step; they SHALL get the default look and SHALL be able to change it through Settings ("Change {name}'s look").

#### Scenario: New player names dog
- **WHEN** the player submits a dog name for the first time
- **THEN** the appearance step SHALL appear next, and either Save or Skip SHALL lead on to the Doorstep

#### Scenario: Existing player updates the app
- **WHEN** a player whose dog already has a name opens the app after this change
- **THEN** they SHALL land on the Doorstep with no extra step, and Buddy SHALL use the default appearance until they change it

### Requirement: Buddy Moods
Buddy SHALL support exactly five moods: `idle`, `happy`, `excited`, `sleepy`, `curious`. Mood selection from app state SHALL be a pure, unit-tested function. Tapping Buddy SHALL play `happy` for a short time and then return to the mood the screen requested. In `idle`, Buddy SHALL occasionally perform a random trick (sit, stretch, shake) chosen by a pure function with an injectable random source that never repeats the previous trick back to back. No mood SHALL ever depict sadness, loneliness, hunger, or neglect.

#### Scenario: Player returns after a long absence
- **WHEN** the Doorstep session is a long-absence fresh open
- **THEN** Buddy SHALL greet with joy (`excited` briefly, then `idle`), and no sad or lonely state SHALL be shown, and no absence duration SHALL be shown or implied

#### Scenario: Same-day re-open or late evening
- **WHEN** the Doorstep session is a same-day re-open, or the local time is between 22:00 and 06:00
- **THEN** Buddy SHALL be `sleepy`

#### Scenario: Buddy tapped
- **WHEN** the player taps Buddy
- **THEN** Buddy SHALL hop, wag fast and show its tongue for about 1.5 seconds, then return to the requested mood

#### Scenario: Upgrade bought or walk celebrated
- **WHEN** a Den upgrade is bought, or the Celebration screen is shown
- **THEN** Buddy SHALL be `excited` (for about 2 seconds after an upgrade; for the whole Celebration screen)

### Requirement: Buddy Animation Performance and Lifecycle
Buddy's animation SHALL use only React Native's built-in `Animated` API with the native driver for every transform and opacity animation, and SHALL use no native dependency beyond those already in `package.json`. A single Buddy SHALL use at most 12 animated nodes. Every loop, timer and animation SHALL be stopped when Buddy unmounts or the screen is replaced. At most one Buddy SHALL be mounted per visible screen (the appearance picker's live preview counts as that screen's one Buddy).

#### Scenario: Screen replaced while Buddy is animating
- **WHEN** the player navigates away from a screen showing Buddy
- **THEN** no animation loop or timer started by that Buddy SHALL keep running

### Requirement: Where Buddy Appears
Buddy SHALL appear on the Doorstep (in place of the dog emoji), in the Den (in place of the placeholder scene), on the Celebration screen, in the appearance picker, and optionally in empty states and the Walk Portrait. Buddy SHALL NOT appear on the live map while a walk is being tracked.

#### Scenario: Walk in progress
- **WHEN** a walk is actively being tracked
- **THEN** the map screen SHALL show no Buddy and no animation beyond what exists today

#### Scenario: Small phone
- **WHEN** the Doorstep is shown on a 6-inch phone
- **THEN** the Start Walk button SHALL remain visible without scrolling

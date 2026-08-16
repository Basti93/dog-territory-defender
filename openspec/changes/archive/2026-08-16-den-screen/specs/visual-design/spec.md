## MODIFIED Requirements

### Requirement: Key Screen Intents
The following five key screens SHALL follow this intent:
- **Map View (Active Walk):** the map dominates full screen; walk-in-progress state is obvious (time, distance); pause/stop controls are easy to reach but not accidental to trigger.
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

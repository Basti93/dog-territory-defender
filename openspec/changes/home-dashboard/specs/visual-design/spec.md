## MODIFIED Requirements

### Requirement: Key Screen Intents
The following six key screens SHALL follow this intent:
- **The Doorstep:** the landing screen shown once per app cold start, before the map; Buddy's name/Level/title and his territory portrait are the visual focus, with at most a short "While you were out" strip and a single Start Walk action — no progress bars, no guilt or streak signal, and the map remains one tap away as the primary screen it leads into.
- **Map View:** the map dominates full screen. While a walk is active, walk-in-progress state is obvious (time, distance) and Finish/Cancel controls are easy to reach but not accidental to trigger. While idle (no walk active), the map SHALL show the player's full Home Range — the Range outline and Bloom fill — so the accumulated result of every past walk stays visible rather than disappearing once a walk ends, and rendered as the soft rounded outline / colour-only freshness fill described in `openspec/changes/archive/` home-range's `design.md`, not as separate per-walk shapes.
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

#### Scenario: The Doorstep leads to, and never replaces, the map
- **WHEN** the player dismisses The Doorstep
- **THEN** the map SHALL become reachable in one tap or fewer, and SHALL remain the primary screen for the rest of the session

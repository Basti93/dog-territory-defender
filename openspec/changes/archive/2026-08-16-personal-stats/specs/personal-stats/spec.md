## Purpose

Defines the lifetime stat tracking and one-off personal achievement system that gives a solo player a highscore to chase without requiring other players (leaderboards) or calendar-based tracking (streaks). Achievements here are purely personal/cosmetic prestige in Phase 1; Phase 4's Trophy Hall (`den-economy`) is the only system permitted to attach a mechanical bonus to them.

## ADDED Requirements

### Requirement: Lifetime Stat Tracking
The system SHALL track, across the player's full history, at minimum: total walks closed, lifetime distance walked, lifetime territory area claimed, the single biggest territory ever claimed, the single longest walk by distance, and total treats earned lifetime. These stats SHALL update incrementally at the moment the underlying event occurs (a walk closes, treats are earned — whether from a walk reward or from passive accrual, building upgrade) rather than being recomputed from full history on each read.

#### Scenario: Stat update on walk close
- **WHEN** a walk is successfully closed into a territory
- **THEN** total walks closed SHALL increment by one, lifetime distance and lifetime territory area SHALL increase by that walk's values, and the biggest-territory and longest-walk stats SHALL update if the new walk exceeds the previous record

#### Scenario: Lifetime treats stat includes passive accrual
- **WHEN** treats are earned through passive accrual while the player was away, not only through a walk reward
- **THEN** total treats earned lifetime SHALL increase by the accrued amount, exactly as it would for a walk-earned reward

### Requirement: Personal Achievements (Phase 1)
The system SHALL support one-off lifetime-milestone achievements, each triggered by a single checkable threshold against lifetime stats or current Den building levels. Achievements SHALL NOT be triggered by consecutive-day streaks, time-of-day/calendar conditions, or any other player's data.

#### Scenario: Achievement unlock check
- **WHEN** a lifetime stat crosses an achievement's threshold, or a Den building reaches an achievement's required level
- **THEN** that achievement SHALL be recorded as unlocked exactly once, with the timestamp of the triggering event, and SHALL NOT be re-evaluated or re-triggered afterward

### Requirement: No Mechanical Bonus from Personal-Stats Achievements
Unlocking a Phase 1 personal-stats achievement SHALL NOT grant treats, XP, territory advantage, or any Den bonus. The achievement record SHALL exist solely as prestige data (name, unlock copy, unlock timestamp) for display purposes.

#### Scenario: Achievement unlock has no side effect on gameplay
- **WHEN** an achievement unlocks
- **THEN** the player's treats balance, Den building levels, and territory holdings SHALL be unaffected by the unlock itself

### Requirement: Achievement Unlock Presentation
Achievements triggered by closing a walk SHALL surface as part of the existing post-walk celebration moment. Achievements triggered by a Den action (an upgrade purchase, a treat threshold crossed while idle) SHALL surface as a lightweight in-Den notice rather than a full-screen celebration, reserving the full-screen celebratory treatment for the walk itself.

#### Scenario: Walk-triggered achievement unlock
- **WHEN** closing a walk causes one or more achievements to unlock
- **THEN** the post-walk celebration screen SHALL display all newly unlocked achievements alongside the territory-claimed and treats-earned summary, without opening a separate screen

#### Scenario: Den-triggered achievement unlock
- **WHEN** a Den building upgrade or passive treat accrual causes an achievement to unlock while the player is not actively closing a walk
- **THEN** the Den screen SHALL display the unlock as an inline notice, consistent with how treat storage overflow is already communicated

### Requirement: Trophy Hall Handoff (Phase 4)
Achievements unlocked under this capability SHALL be the same badges Trophy Hall (`den-economy` building #8) displays starting Phase 4, using that capability's existing per-badge bonus figure. This capability SHALL NOT implement badge display selection, badge display limits, or any per-badge bonus percentage — those SHALL be built no earlier than Phase 4 as part of Trophy Hall.

#### Scenario: Badge available for future display
- **WHEN** Trophy Hall is built in Phase 4
- **THEN** it SHALL be able to read every achievement unlocked under this capability by id and unlock timestamp, without this capability having implemented any display or bonus logic itself

# Pack Collection Specification

## Purpose

Defines The Pack — the AI dog companion collection metagame that adds horizontal variety on top of the Den's vertical progression, driven by a "gotta catch 'em all" collection drive, while staying capped so it never creates an unfair power gap.

## Requirements

### Requirement: Recruitment Tiers
The Pack SHALL support three companion tiers:
- **Common dogs** — easy: walk 5km in the companion breed's preferred zone. Grants a +1-3% bonus.
- **Rare dogs** — medium: complete a multi-walk quest. Grants a +5-10% bonus plus a special ability.
- **Legendary dogs** — hard: seasonal events, limited time. Grants a cosmetic, a small bonus, and flex value.

#### Scenario: Recruiting a common dog
- **WHEN** a player walks 5km in a companion breed's preferred zone
- **THEN** that common companion SHALL become recruitable with a +1-3% bonus

### Requirement: Quests Do Not Break Routine
Pack quests SHALL be completable via the player's normal walking routine (e.g. "walk anywhere for 5km this week to recruit a Beagle scout") and SHALL NOT require abandoning the player's normal route for a special one.

#### Scenario: Weekly recruitment quest
- **WHEN** a Pack quest is active
- **THEN** it SHALL be satisfiable by walks on the player's normal route, not only on a dedicated special route

### Requirement: Pack Anti-Snowball Limits
The Pack's contribution to a player's overall power SHALL be capped: total Pack bonus contribution SHALL NOT exceed +30%; Common dogs SHALL be at least 80% as effective as Legendary dogs in core mechanics (Legendary is mostly cosmetic flex, not a core-mechanic power advantage); and a player SHALL have at most 8 active Pack slots regardless of level, so a level-100 player cannot run an unlimited roster.

#### Scenario: Pack bonus cap enforcement
- **WHEN** a player's combined Pack bonuses would exceed +30%
- **THEN** the system SHALL cap the applied bonus at +30%

#### Scenario: Slot cap enforcement
- **WHEN** a level-100 player attempts to field more than 8 companions at once
- **THEN** the system SHALL refuse to activate a 9th Pack slot

### Requirement: Roster Shows Off Without Making New Players Feel Weak
A long-term player's Pack roster SHALL be visible as a display of long-term play, without the Pack anti-snowball limits above being exceeded — so veterans get bragging rights while new players are never mechanically outmatched beyond the capped advantage.

#### Scenario: Veteran roster display
- **WHEN** a long-term player's profile or Den is viewed
- **THEN** their full Pack roster SHALL be visible, and the mechanical advantage it grants SHALL still respect the +30% total Pack cap

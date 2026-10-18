# Game Backlog Specification

## Purpose

The agile backlog of game features and ideas for Dog Territory Defender, grouped by theme, plus the cross-cutting constraints that hold for every slice and a short list of known stubs and debts. This replaces the former 5-phase lean-startup plan: there are no phase gates. Work is pulled from here by owner feedback and fun; nothing in this file is a promise or an order.

## Requirements

### Requirement: Agile prioritisation
Work SHALL be pulled from this backlog by owner feedback and fun, not by a fixed sequence. There SHALL be no phase gates: no item waits for another to be "validated", and no validation audit is required between slices. Each shipped slice SHALL get a bullet in the decisions log (the introducing change's `design.md` Decisions section). Mechanics and numbers still go through an OpenSpec change (see `CLAUDE.md`, Tier A).

#### Scenario: Pulling an item
- **WHEN** the owner wants a backlog item next
- **THEN** it MAY be built immediately, regardless of which theme it sits in, and its decision is logged when it ships

### Requirement: Repetition loop
The backlog SHALL hold the ideas that make same-route walks more rewarding over time instead of less: scent strength (territory deepens visually with repeat walks; the `visits` ghost-trail brightness channel already covers a first version); 7-day streak rewards; time-of-day and seasonal collectible variations (morning vs. evening, spring blooms); an evening recap notification ("Here's what happened in your territory today"); and background passive accumulation that continues on rest days with diminishing returns.

What we want to learn: do same-route walks feel better with time? Optional hint: 4 of 5 testers still engaged on day 14 of walking the same route and liking to see their territory grow stronger.

#### Scenario: Repetition item is pulled
- **WHEN** a repetition-loop item is pulled
- **THEN** it SHALL reward repeating a route and SHALL NOT punish a missed day (see `anti-snowball`)

### Requirement: Social layer
The backlog SHALL hold the async-multiplayer ideas that make the world feel alive without being toxic: other players' territories on a shared map; async events (e.g. "Luna sniffed your territory at 3pm"); a local leaderboard scoped to zip code only; soft territory overlap that reduces rather than destroys existing territory; and rolling 7-day scoring as the primary competitive metric. This theme needs a backend and accounts (see Known stubs and debts).

What we want to learn: do other dogs visiting and friendly competition feel good? Optional hint: 20 testers in one city for 14 days, about 60% engagement, positive social feelings, no toxicity reported.

#### Scenario: Social item is pulled
- **WHEN** a social-layer item is pulled
- **THEN** it SHALL use claim/defend/protect language only and SHALL NOT destroy another player's territory

### Requirement: Long-term hooks
The backlog SHALL hold the long-term metagame: the full Den (10+ buildable upgrades, levels 1-100, soft caps at level 50 for diminishing returns); Pack collection (recruit AI dog companions, common through rare to legendary); seasonal events (spring blooms, summer heat, autumn leaves, winter cozy); the anti-snowball mechanisms (Beginner's Luck at 2x for 30 days, mentor bonuses, co-op neighborhood goals, seasonal leaderboard resets); and cosmetic prestige (badges, dog accessories). Numeric details live in `den-economy`, `pack-collection`, and `anti-snowball` and are load-bearing there.

What we want to learn: do long-term players stay while newcomers still feel welcome? Optional hint: a closed beta of about 100 users in one city for 30 days, D7 retention above 40%, D30 above 20%, no abandonment by new joiners.

#### Scenario: Long-term item is pulled
- **WHEN** a Den, Pack, or anti-snowball item is pulled
- **THEN** the relevant spec SHALL be re-read first and any numeric change SHALL be logged with its reason

### Requirement: Cross-cutting constraints
The following constraints SHALL hold for every slice without being restated per feature: battery drain SHALL target under 5% per 30-minute walk, and background location tracking SHALL be opt-in; the walk's start point SHALL be fuzzed by 100 meters to hide the home address, and the system SHALL be GDPR compliant by default; interaction SHALL be audio-first (subtle dings on points-of-interest passes, optional Apple Watch / Wear OS haptics) so the phone can stay in the owner's pocket.

#### Scenario: Constraints hold for every slice
- **WHEN** any backlog item is built
- **THEN** it SHALL respect the battery, opt-in background tracking, 100-meter start-point fuzz, GDPR, and audio-first constraints without a separate decision

### Requirement: Known stubs and debts
The following are known gaps, recorded so nobody mistakes them for finished work (state as of 2026-10-18):
- No backend, no accounts, no social layer: everything is local to one phone.
- Reminders are inexact (no `SCHEDULE_EXACT_ALARM`) and re-arm only when the app is opened or a walk is saved; they stop after 7 unopened days. Android OEMs with aggressive battery saving may deliver them late or never.
- Sounds and the music box are synthetic (generated by script), except the Buddy barks (public-domain recording). Music box loudness is unknown on real speakers and in a pocket.
- Buddy appears in medium size only as art (size is a uniform scale); markings are overlays on the head layer and follow head tilt by a few px; accent colour is baked in; pivots are hard-coded in `imageSkinSources.ts`.
- Territory names come from reverse-geocoding and stay in the language they were created in.
- Den art has 3 growth stages for building levels up to 100 (thresholds picked by eye).
- Map tiles need internet (no offline tiles, the map is blank-ish without signal); the Doorstep portrait falls back to a neutral line if capture fails, and portrait tile capture (CORS) is unverified.
- `src/app` hooks are covered by the component harness but untested on device; SQLite migrations (guarded `ALTER TABLE`s) are untested at the SQLite level; no crash reporting and no CI (`npm run check` is run by hand).
- Backlog themes above (streaks, leaderboards, Pack, and so on) are intentionally absent until pulled.

#### Scenario: A debt is paid
- **WHEN** a stub or debt is resolved
- **THEN** its bullet SHALL be removed or updated in this requirement in the same change

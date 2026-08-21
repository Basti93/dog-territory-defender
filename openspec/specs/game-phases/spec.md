# Game Phases Specification

## Purpose

Defines the 5-phase lean-startup build plan that gates all feature work on Dog Territory Defender, the mandatory end-of-phase validation process, and the cross-cutting technical constraints that apply across every phase. The phased plan is sacred: each phase validates exactly one hypothesis with real users before the next phase's build work begins.

## Requirements

### Requirement: Phase 0 — Walking Skeleton
The system SHALL implement a walking skeleton that tests the hypothesis that GPS tracking on a real urban walk feels accurate and satisfying to replay, before any game mechanics are built. Build scope: map view, start/stop walk button, a live polyline of the route shown during the walk, and a post-walk replay. No game mechanics.

#### Scenario: Phase 0 acceptance
- **WHEN** 3 testers each walk 20 minutes in their own city
- **THEN** GPS drift SHALL be under 10 meters in an urban canyon, battery drain SHALL be under 5% per 30 minutes, and testers SHALL report the replay feels accurate

### Requirement: Phase 1 — Core Game Loop
The system SHALL implement the core game loop that tests the hypothesis that claiming territory plus earning passive treats creates a "want to walk again tomorrow" feeling. Build scope: a persistent Home Range grid (see `den-economy`) painted by every tracked walk, rendered as a soft outline (the Range) with a colour-only freshness fill (the Bloom) and a ghost-trail brightness channel (`visits`, brought forward from Phase 2's "scent strength" scope by direct decision — see the Engagement Mechanic Rollout requirement below) so a fixed-loop walker's repeat visits are visible even when the Bloom alone has nothing new to show; treats earned per walk plus passive treat generation per hour (the cookie-clicker hook); a Den screen with 3 buildable upgrades (Doghouse, Treat Bakery, Sniff Garden), each giving a percentage bonus; a visible "next upgrade" always teased; personal lifetime stats plus non-social, non-bonus one-off achievements (see `personal-stats`) as a solo-friendly highscore to chase, ahead of Phase 3's leaderboards and Phase 2's streaks; Buddy's Level/XP (see `den-economy`) as a continuously-advancing progress signal that also sets the per-walk treats income rate — an income effect, explicitly excluded from the `anti-snowball` power cap, not a Phase-4-reserved capped power bonus; and an earned-trigger notification that surfaces an already-true, unclaimed core-loop event (e.g. a Den-economy treat/build overflow) — never a clock-fired reminder invented on a schedule, which remains Phase 2's evening-recap notification, not Phase 1's.

#### Scenario: Phase 1 acceptance
- **WHEN** 5 dog owners walk twice a day for 5 days
- **THEN** at least 4 of the 5 testers SHALL complete 8 or more walk sessions and self-report wanting to walk again

#### Scenario: Earned-trigger notification distinguished from Phase 2 recap
- **WHEN** an earned-trigger notification fires because an existing Den-economy overflow event has not yet been surfaced to the player
- **THEN** it SHALL be treated as Phase 1 core-loop capture, not the Phase 2 evening-recap/streak notification, and SHALL NOT fire on a bare clock schedule with nothing behind it

### Requirement: Phase 2 — Repetition Reward Loop
The system SHALL implement the repetition reward loop that tests the hypothesis that same-route walks become more rewarding over time, not less, through scent layering and seasonal variation. Build scope: scent strength (territory deepens visually with repeat walks); 7-day streak rewards; time-of-day and seasonal collectible variations (morning vs. evening, spring blooms); an evening recap notification ("Here's what happened in your territory today"); and background passive accumulation that continues on rest days with diminishing returns.

#### Scenario: Phase 2 acceptance
- **WHEN** the same 5 testers walk the same route for 14 consecutive days
- **THEN** at least 4 of the 5 testers SHALL still be engaged at day 14 and self-report liking seeing their territory grow stronger

### Requirement: Phase 3 — Social Layer
The system SHALL implement async multiplayer that tests the hypothesis that other dogs visiting, leaving gifts, and friendly competition make the world feel alive without being toxic. Build scope: other players' territories shown on a shared map; async events (e.g. "Luna sniffed your territory at 3pm"); a local leaderboard scoped to zip code only (anti-snowball); soft territory overlap that reduces rather than destroys existing territory; and rolling 7-day scoring as the primary competitive metric.

#### Scenario: Phase 3 acceptance
- **WHEN** 20 testers in the same city use the app for 14 days
- **THEN** 60% engagement SHALL be maintained, tester feedback SHALL report positive social feelings, and no toxicity SHALL be reported

### Requirement: Phase 4 — Long-Term Hooks & Beta-Ready
The system SHALL implement the long-term metagame that tests the hypothesis that the Den plus Pack metagame plus seasonal events keep long-term players engaged while new players still don't feel locked out. Build scope: the full Den (10+ buildable upgrades, levels 1-100, soft caps at level 50 for diminishing returns); Pack collection (recruit AI dog companions, common through rare to legendary); seasonal events (spring blooms, summer heat, autumn leaves, winter cozy); anti-snowball mechanisms (Beginner's Luck at 2x for 30 days, mentor bonuses, co-op neighborhood goals, seasonal leaderboard resets); and cosmetic prestige (badges, dog accessories).

#### Scenario: Phase 4 acceptance
- **WHEN** a closed beta runs in 1 city with 100 users for 30 days
- **THEN** D7 retention SHALL exceed 40%, D30 retention SHALL exceed 20%, and no abandonment by new joiners SHALL be observed

### Requirement: Phase Gating Rule
The build process SHALL NOT implement a later phase's features while an earlier phase is unvalidated or still in progress. Every feature request SHALL first be classified against the 5-phase plan; a request belonging to a later phase SHALL be parked, not built.

#### Scenario: Out-of-phase feature request
- **WHEN** a feature belonging to Phase N+1 is proposed while Phase N is the active phase
- **THEN** the request SHALL be classified as out-of-phase and deferred rather than implemented

### Requirement: Cross-Cutting Technical Constraints
The following constraints SHALL be built once and hold across all phases without being restated per phase: battery drain SHALL target under 5% per 30-minute walk, and background location tracking SHALL be opt-in; the walk's start point SHALL be fuzzed by 100 meters to hide the home address, and the system SHALL be GDPR compliant by default; interaction SHALL be audio-first — subtle dings on points-of-interest passes, optional Apple Watch / Wear OS haptics — so the phone can stay in the owner's pocket.

#### Scenario: Constraints hold for every phase's build
- **WHEN** any phase's build is implemented
- **THEN** it SHALL respect the battery, opt-in background tracking, 100-meter start-point privacy fuzz, and audio-first constraints without requiring a separate decision each phase

### Requirement: Engagement Mechanic Rollout per Phase
The Den, Pack, and anti-snowball mechanics SHALL be introduced no earlier than the phase listed here: Phase 0 introduces none of them (walking skeleton only). Phase 1 introduces treats, the first 3 Den buildings (Doghouse, Treat Bakery, Sniff Garden — see `den-economy`), the Home Range grid, and — as the one deliberate exception to this table, decided directly by the user — the `visits` ghost-trail brightness channel that Phase 2 below still nominally owns. Phase 2 introduces the Bloom's remaining freshness-driven scope (already covered by Phase 1's Home Range), 7-day streak rewards, seasonal variation, and passive accumulation during rest days (see `den-economy`). Phase 3 introduces local leaderboards, rolling 7-day scoring, and mentor bonuses (see `anti-snowball`). Phase 4 introduces the full 10-building Den, Pack collection, seasonal events, and Beginner's Luck (see `den-economy`, `pack-collection`, `anti-snowball`).

#### Scenario: Mechanic introduced in its mapped phase
- **WHEN** a Den, Pack, or anti-snowball mechanic is implemented
- **THEN** it SHALL NOT be introduced earlier than the phase mapped to it above, except for the single named Phase 1 exception (`visits`) recorded above

### Requirement: Per-Phase Validation Process
At the end of every phase (0 through 4), before the next phase's build work begins, the team SHALL produce a validation audit. The audit SHALL cover: the phase's hypothesis and whether it validated (yes / no / partial, with concrete evidence); what works end-to-end versus what is fake, hardcoded, or stubbed; the top 3 technical debts and top 3 UX smells found; exactly one decision — CONTINUE to the next phase, ITERATE within the current phase (max 2 weeks), PIVOT to an adjacent direction, or KILL — with supporting evidence, cost, and risk; a re-evaluation of whether the hypothesis (and the next phase's hypothesis) still holds; the next phase's readiness (must-fix-first list, architecture changes needed, updated continue/kill thresholds); user and market signals (tester quotes, one surprise, competitive shifts); the top 5 immediate actions with owner and time estimate; the 3 open questions for the founder that can't be answered from code and tests alone; and a "ship this week" block of 3 concrete deliverables.

#### Scenario: Phase completion gate
- **WHEN** a phase's build work is reported complete
- **THEN** the team SHALL run the validation audit described above and record exactly one of CONTINUE, ITERATE, PIVOT, or KILL before starting the next phase's build work

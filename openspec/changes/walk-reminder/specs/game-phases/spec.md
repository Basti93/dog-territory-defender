## MODIFIED Requirements

### Requirement: Phase 2 — Repetition Reward Loop
The system SHALL implement the repetition reward loop that tests the hypothesis that same-route walks become more rewarding over time, not less, through scent layering and seasonal variation. Build scope: scent strength (territory deepens visually with repeat walks); 7-day streak rewards; time-of-day and seasonal collectible variations (morning vs. evening, spring blooms); an evening recap notification ("Here's what happened in your territory today"); and background passive accumulation that continues on rest days with diminishing returns. As a second deliberate exception to this phase boundary, decided directly by the founder/user (the same kind of explicit call that pulled the `visits` ghost-trail channel forward into Phase 1 — see the Engagement Mechanic Rollout requirement below), an opt-in, player-set-time daily walk reminder (see `walk-reminder`) is built and shipped ahead of the rest of this phase's scope, as a fenced, time-boxed 4-week experiment with its own kill condition, not as a signal that this phase's other repetition-reward mechanics are now unblocked.

#### Scenario: Phase 2 acceptance
- **WHEN** the same 5 testers walk the same route for 14 consecutive days
- **THEN** at least 4 of the 5 testers SHALL still be engaged at day 14 and self-report liking seeing their territory grow stronger

#### Scenario: The walk-reminder exception does not unblock the rest of Phase 2
- **WHEN** the opt-in walk reminder (`walk-reminder`) is implemented ahead of the rest of Phase 2
- **THEN** it SHALL be treated as a single named exception, and no other Phase 2 capability (scent strength, streak rewards, seasonal variation, the evening recap notification, rest-day passive accumulation) SHALL be built as a result, without its own separate phase-gating decision

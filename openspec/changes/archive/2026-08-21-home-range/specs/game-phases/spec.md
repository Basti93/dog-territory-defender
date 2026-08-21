Note for whoever applies this delta: this replaces Phase 1's closed-perimeter-polygon build scope with the Home Range grid model, and records the one deliberate phase-boundary exception this change makes — the `visits` ghost-trail channel (nominally Phase 2's "scent strength" language) ships in Phase 1 alongside the Home Range, decided directly by the user (see `proposal.md`'s Open Questions and `design.md`'s FLAG 1 resolution) because the Phase 1 acceptance-test persona (a twice-a-day fixed-loop walker) gets nothing visible from the Bloom alone.

## MODIFIED Requirements

### Requirement: Phase 1 — Core Game Loop
The system SHALL implement the core game loop that tests the hypothesis that claiming territory plus earning passive treats creates a "want to walk again tomorrow" feeling. Build scope: a persistent Home Range grid (see `den-economy`) painted by every tracked walk, rendered as a soft outline (the Range) with a colour-only freshness fill (the Bloom) and a ghost-trail brightness channel (`visits`, brought forward from Phase 2's "scent strength" scope by direct decision — see note above) so a fixed-loop walker's repeat visits are visible even when the Bloom alone has nothing new to show; treats earned per walk plus passive treat generation per hour (the cookie-clicker hook); a Den screen with 3 buildable upgrades (Doghouse, Treat Bakery, Sniff Garden), each giving a percentage bonus; a visible "next upgrade" always teased; personal lifetime stats plus non-social, non-bonus one-off achievements (see `personal-stats`) as a solo-friendly highscore to chase, ahead of Phase 3's leaderboards and Phase 2's streaks; Buddy's Level/XP (see `den-economy`) as a continuously-advancing progress signal that also sets the per-walk treats income rate — an income effect, explicitly excluded from the `anti-snowball` power cap, not a Phase-4-reserved capped power bonus; and an earned-trigger notification that surfaces an already-true, unclaimed core-loop event (e.g. a Den-economy treat/build overflow) — never a clock-fired reminder invented on a schedule, which remains Phase 2's evening-recap notification, not Phase 1's.

#### Scenario: Phase 1 acceptance
- **WHEN** 5 dog owners walk twice a day for 5 days
- **THEN** at least 4 of the 5 testers SHALL complete 8 or more walk sessions and self-report wanting to walk again

#### Scenario: Earned-trigger notification distinguished from Phase 2 recap
- **WHEN** an earned-trigger notification fires because an existing Den-economy overflow event has not yet been surfaced to the player
- **THEN** it SHALL be treated as Phase 1 core-loop capture, not the Phase 2 evening-recap/streak notification, and SHALL NOT fire on a bare clock schedule with nothing behind it

### Requirement: Engagement Mechanic Rollout per Phase
The Den, Pack, and anti-snowball mechanics SHALL be introduced no earlier than the phase listed here: Phase 0 introduces none of them (walking skeleton only). Phase 1 introduces treats, the first 3 Den buildings (Doghouse, Treat Bakery, Sniff Garden — see `den-economy`), the Home Range grid, and — as the one deliberate exception to this table, decided directly by the user — the `visits` ghost-trail brightness channel that Phase 2 below still nominally owns. Phase 2 introduces the Bloom's remaining freshness-driven scope (already covered by Phase 1's Home Range), 7-day streak rewards, seasonal variation, and passive accumulation during rest days (see `den-economy`). Phase 3 introduces local leaderboards, rolling 7-day scoring, and mentor bonuses (see `anti-snowball`). Phase 4 introduces the full 10-building Den, Pack collection, seasonal events, and Beginner's Luck (see `den-economy`, `pack-collection`, `anti-snowball`).

#### Scenario: Mechanic introduced in its mapped phase
- **WHEN** a Den, Pack, or anti-snowball mechanic is implemented
- **THEN** it SHALL NOT be introduced earlier than the phase mapped to it above, except for the single named Phase 1 exception (`visits`) recorded above

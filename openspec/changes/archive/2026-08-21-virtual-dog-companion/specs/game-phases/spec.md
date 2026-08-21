Note for whoever applies this delta: this modifies the Phase 1 paragraph as it will read *after* `den-level-xp`'s own pending delta is merged (that change adds the "standalone, non-percentage Den Level/XP tracking" clause this file replaces) — see this change's `tasks.md` sequencing note. Written now, against that anticipated post-merge text.

## MODIFIED Requirements

### Requirement: Phase 1 — Core Game Loop
The system SHALL implement the core game loop that tests the hypothesis that claiming territory plus earning passive treats creates a "want to walk again tomorrow" feeling. Build scope: closed-perimeter detection producing a polygon territory shown on the map; treats earned per walk plus passive treat generation per hour (the cookie-clicker hook); a Den screen with 3 buildable upgrades (Doghouse, Treat Bakery, Sniff Garden), each giving a percentage bonus; a visible "next upgrade" always teased; personal lifetime stats plus non-social, non-bonus one-off achievements (see `personal-stats`) as a solo-friendly highscore to chase, ahead of Phase 3's leaderboards and Phase 2's streaks; and Buddy's Level/XP (see `den-economy`) as a continuously-advancing progress signal that also sets the per-walk treats income rate — an income effect, explicitly excluded from the `anti-snowball` power cap, not a Phase-4-reserved capped power bonus.

#### Scenario: Phase 1 acceptance
- **WHEN** 5 dog owners walk twice a day for 5 days
- **THEN** at least 4 of the 5 testers SHALL complete 8 or more walk sessions and self-report wanting to walk again

#### Scenario: Earned-trigger notification distinguished from Phase 2 recap
- **WHEN** an earned-trigger notification fires because an existing Den-economy overflow event has not yet been surfaced to the player
- **THEN** it SHALL be treated as Phase 1 core-loop capture, not the Phase 2 evening-recap/streak notification, and SHALL NOT fire on a bare clock schedule with nothing behind it

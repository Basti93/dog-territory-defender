## MODIFIED Requirements

### Requirement: Phase 1 — Core Game Loop
The system SHALL implement the core game loop that tests the hypothesis that claiming territory plus earning passive treats creates a "want to walk again tomorrow" feeling. Build scope: closed-perimeter detection producing a polygon territory shown on the map; treats earned per walk plus passive treat generation per hour (the cookie-clicker hook); a Den screen with 3 buildable upgrades (Doghouse, Treat Bakery, Sniff Garden), each giving a percentage bonus; a visible "next upgrade" always teased; personal lifetime stats plus non-social, non-bonus one-off achievements (see `personal-stats`) as a solo-friendly highscore to chase, ahead of Phase 3's leaderboards and Phase 2's streaks; and standalone, non-percentage Den Level/XP tracking (see `den-economy`) as a continuously-advancing progress signal alongside those milestone achievements.

#### Scenario: Phase 1 acceptance
- **WHEN** 5 dog owners walk twice a day for 5 days
- **THEN** at least 4 of the 5 testers SHALL complete 8 or more walk sessions and self-report wanting to walk again

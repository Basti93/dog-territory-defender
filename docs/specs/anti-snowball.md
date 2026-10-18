# Anti-Snowball Specification

## Purpose

Defines the 10 layered anti-snowball mechanisms that keep new players competitive, welcomed, and meaningfully progressing against long-term veterans, while still letting veterans feel their long-term investment was worthwhile. Design North Star: every walk feels rewarding, every off-walk hour feels productive, every veteran feels respected, every newcomer feels welcomed.

## Requirements

### Requirement: Local Leaderboards by Zip Code
Leaderboards SHALL be scoped to the player's zip code, not to global rankings, so a new player competes only with their immediate neighbors.

#### Scenario: New player leaderboard placement
- **WHEN** a new player joins and starts walking within their zip code
- **THEN** they SHALL be able to reach a top-3 placement on their zip-code leaderboard within their first week

### Requirement: Rolling 7-Day Scoring
The primary competitive metric SHALL be the player's score over the trailing 7 days ("walks this week"), not lifetime XP.

#### Scenario: Daily walker vs. lapsed veteran
- **WHEN** a daily walker who joined yesterday is compared to a veteran who has not played in 6 months
- **THEN** the daily walker's rolling 7-day score SHALL exceed the lapsed veteran's

### Requirement: Soft Caps with Diminishing Returns
Den building bonuses SHALL cap at +50% above level 50. On equivalent walks, a level-100 player's total advantage over a level-1 player from building/level sources SHALL be approximately 30% — the walk itself SHALL dominate outcomes; buildings tilt results, they do not decide them.

#### Scenario: Level 100 vs. level 1 on an equivalent walk
- **WHEN** a level-100 player and a level-1 player complete an equivalent walk
- **THEN** the level-100 player's total advantage from building/level sources SHALL be approximately 30%, not more

### Requirement: Beginner's Luck
New players SHALL receive 2x XP and 2x treats for their first 30 days, so they catch up toward mid-level quickly and feel meaningful progress immediately.

#### Scenario: New player within first 30 days
- **WHEN** a player is within 30 days of account creation
- **THEN** they SHALL earn 2x XP and 2x treats on all qualifying actions

### Requirement: Mentor Bonuses
A high-level player who mentors a new player SHALL receive a +5% treats bonus whenever the mentored new player walks, encouraging veterans to onboard newcomers rather than outcompete them.

#### Scenario: Mentored walk completes
- **WHEN** a new player with an assigned mentor completes a walk
- **THEN** the mentor SHALL receive a +5% treats bonus attributable to that walk

### Requirement: Seasonal Resets (Cosmetic-Only Prestige)
Leaderboards SHALL reset every 3 months. Long-term players SHALL keep all upgrades and SHALL receive a permanent cosmetic prestige badge for the season they led (e.g. "Spring 2026 Champion"). Each new season's leaderboard SHALL start fair for every player.

#### Scenario: Season rollover
- **WHEN** a 3-month season ends
- **THEN** the leaderboard SHALL reset for the new season, every player's upgrades SHALL persist, and top players from the ending season SHALL receive a permanent cosmetic prestige badge

### Requirement: Co-op Over Compete
Most limited-time events SHALL be collaborative (e.g. a shared neighborhood walking goal) rather than solo-competitive, so long-term and new players are on the same team; solo competition SHALL remain the minority of gameplay.

#### Scenario: Neighborhood collaborative event
- **WHEN** a co-op neighborhood event is active (e.g. "walk 1000km collectively to unlock a community Spring Garden")
- **THEN** progress SHALL be shared across all participating players regardless of their level

### Requirement: Walk-Frequency-Based Territory Defense
Territory defense strength SHALL scale with how recently the owner walked, not with total lifetime stats, so lapsed veterans gradually lose defended territory to actively-walking new players.

#### Scenario: Lapsed veteran vs. active new player
- **WHEN** a new player walks daily and a level-100 veteran has not walked in 5 days
- **THEN** the new player SHALL be able to successfully defend or contest territory against the lapsed veteran

### Requirement: Asymmetric Value Props
Long-term players SHALL be rewarded with rare cosmetics, prestige badges, a large Den to display, and a deep Pack collection. New players SHALL be rewarded with the Beginner's Luck 2x bonus, fresh territory in their own neighborhood, and beginner perks. Both value sets SHALL be genuinely meaningful to their respective cohort.

#### Scenario: Value delivered to each cohort
- **WHEN** a long-term player and a brand-new player each view their available rewards
- **THEN** the long-term player SHALL see cosmetic/prestige/collection rewards and the new player SHALL see Beginner's Luck and fresh-territory rewards, with neither cohort's reward set empty

### Requirement: Hard Power Gap Soft-Cap
The combined advantage from all *power* sources (Den building bonuses, Pack, badges) that a level-100 player can hold over a level-1 player on equivalent walks SHALL be capped at a maximum of +30% — high enough that veterans don't feel their grind was meaningless, low enough that new players don't give up. Buddy's Level (Den Level) SHALL NOT count toward this budget: it drives a per-walk *income* rate (treats earned), not a capped bonus percentage applied to a defense/XP/find-rate quantity, so it contributes 0% regardless of how high it climbs. The Home Range's Fresh Ground `bloomMultiplier` SHALL likewise NOT count toward this budget: it is a function of walk geography and elapsed time only, with no level, building, or treat-balance term, so it applies identically to a level-1 and a level-100 player on an equivalent walk and cancels out of the ratio the cap is defined over. No future capped percentage bonus SHALL ever be defined as a function of Buddy's Level or of a player's treat balance — only of building level, Pack, or badges.

#### Scenario: Combined power gap ceiling
- **WHEN** all applicable capped-power bonuses (Den building, Pack, badge percentages) are summed for a level-100 player versus a level-1 player on an equivalent walk
- **THEN** the combined advantage SHALL NOT exceed +30%

#### Scenario: Level contributes no power
- **WHEN** Buddy's Level is evaluated as a candidate power source for the combined power gap ceiling above
- **THEN** its contribution SHALL be 0%, regardless of how high Buddy's Level climbs

#### Scenario: Fresh Ground contributes no power
- **WHEN** the Home Range's `bloomMultiplier` is evaluated as a candidate power source for the combined power gap ceiling above, on an equivalent walk with identical cell freshness for both players
- **THEN** its contribution SHALL be 0%, regardless of either player's Level, building levels, or treat balance

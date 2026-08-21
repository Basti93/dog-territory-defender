Note for whoever applies this delta: two of the requirements below (`Phase 1 Level Payoff Is Non-Percentage and Visually Secondary`, `Walk-Derived XP`'s neighboring Level text) only exist today in the still-open `den-level-xp` change's own pending spec delta, not yet merged into the canonical `openspec/specs/den-economy/spec.md`. This change's `tasks.md` requires `den-level-xp` to be archived first, so that by the time this delta is actually applied, those requirements are real, current spec text and this file's `MODIFIED` sections resolve cleanly. Written now, against that anticipated post-merge text, so the intent isn't lost waiting on sequencing.

## MODIFIED Requirements

### Requirement: The 10 Den Buildings
The Den SHALL support exactly these 10 buildings, unlocking progressively:

| # | Building | Effect | Unlocks at |
|---|---|---|---|
| 1 | Doghouse (HQ) | Treat storage capacity + base | Start |
| 2 | Treat Bakery | Passive treats per hour (idle generator) | Start |
| 3 | Sniff Garden | +X% treats found on a walk | Start |
| 4 | Training Yard | +X% XP per walk | Den Level 5 |
| 5 | Watch Tower | +X% territory defense | Den Level 10 |
| 6 | Friend Lounge | Chance for visiting dogs to leave gifts | Den Level 15 |
| 7 | Spring Garden | Seasonal +X% during spring (cycles per season) | Den Level 20 |
| 8 | Trophy Hall | Display badges, +0.5% per badge displayed | Den Level 25 |
| 9 | Pack House | Recruit AI dog companions (passive bonuses) | Den Level 30 |
| 10 | Memorial Bench | Logs walks, sentimental, no bonus | Anytime (free) |

#### Scenario: Building unlock gating
- **WHEN** the Den reaches a new level
- **THEN** only buildings whose unlock level is at or below the Den's current level SHALL become available to build

### Requirement: Phase 1 Level Payoff Is Buddy's Per-Walk Income Rate, Never a Capped Power Bonus
In Phase 1, Buddy's Level (the player-facing name for Den Level) SHALL determine the flat treats payout awarded per walk, via a per-level curve that increases by a constant relative percentage at every level with no upper limit, displayed to the player as a concrete per-walk figure (e.g. "Buddy brings home N treats a walk"). This is an income effect, not a capped power bonus: it SHALL NOT be summed into the `anti-snowball` capability's `Hard Power Gap Soft-Cap` budget, and no capped percentage bonus anywhere in the game (building, Pack, or badge) SHALL ever be a function of Buddy's Level or of a player's treat balance. The Den Level readout and any level-up notice SHALL remain visually secondary to the walk's own territory-claimed outcome wherever both appear together, consistent with `visual-design`'s Success Criteria.

#### Scenario: Level-up changes the walk's treat payout
- **WHEN** Buddy's Level increases
- **THEN** the per-walk treats payout SHALL increase by a visible whole number of treats, and the post-walk celebration SHALL show the old and new per-walk rate together

#### Scenario: Level income never counts toward the power cap
- **WHEN** the `anti-snowball` `Hard Power Gap Soft-Cap` is evaluated for a level-100 player versus a level-1 player
- **THEN** Buddy's Level's contribution to that capped total SHALL be 0%

#### Scenario: Level-up notice does not overshadow territory claimed
- **WHEN** a walk that closes into a territory also crosses a Den Level threshold
- **THEN** the post-walk celebration SHALL present the territory-claimed outcome as the primary moment, and the level-up notice SHALL be shown at or below the visual weight of the existing upgrade tease

## ADDED Requirements

### Requirement: Doghouse Storage Never Permanently Softlocks
The Doghouse's storage capacity SHALL scale so that it never falls below a fixed multiple of the cheapest currently-available upgrade cost across all owned buildings, so a player can never be permanently unable to save enough treats to afford any further upgrade.

#### Scenario: Storage capacity tracks upgrade cost growth
- **WHEN** the cheapest available building upgrade's cost grows as buildings are upgraded
- **THEN** the Doghouse's storage capacity SHALL grow at least proportionally, so the cheapest available upgrade always remains within reach of a full storage bank

### Requirement: Milestone Titles Are Front-Loaded and Never Final
At a front-loaded, ever-widening sequence of levels, Buddy SHALL earn a text-only title with no fixed final title, no numeric maximum shown (no "/100", no percentage), and no state that forecloses future growth.

#### Scenario: Title sequence has no final entry
- **WHEN** a player reaches the highest currently-authored milestone title
- **THEN** the system SHALL NOT present this as a final or maximum achievement, and the milestone sequence SHALL continue to be computable (even if uncopy-written) beyond that level

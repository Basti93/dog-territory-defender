## MODIFIED Requirements

### Requirement: Hard Power Gap Soft-Cap
The combined advantage from all *power* sources (Den building bonuses, Pack, badges) that a level-100 player can hold over a level-1 player on equivalent walks SHALL be capped at a maximum of +30% — high enough that veterans don't feel their grind was meaningless, low enough that new players don't give up. Buddy's Level (Den Level) SHALL NOT count toward this budget: it drives a per-walk *income* rate (treats earned), not a capped bonus percentage applied to a defense/XP/find-rate quantity, so it contributes 0% regardless of how high it climbs. The Home Range's Fresh Ground `bloomMultiplier` SHALL likewise NOT count toward this budget: it is a function of walk geography and elapsed time only, with no level, building, or treat-balance term, so it applies identically to a level-1 and a level-100 player on an equivalent walk and cancels out of the ratio the cap is defined over. Territories' `territoryRate` (the Home Range passive-income addition) SHALL likewise NOT count toward this budget, for the same reason as Buddy's Level's own income curve: it is an uncapped income rate derived from total ground claimed and Buddy's Level, not a capped percentage bonus applied to any defense/XP/find-rate quantity, and it applies identically to any two players holding the same total ground regardless of how that ground is partitioned into Territories. No future capped percentage bonus SHALL ever be defined as a function of Buddy's Level or of a player's treat balance — only of building level, Pack, or badges.

#### Scenario: Combined power gap ceiling
- **WHEN** all applicable capped-power bonuses (Den building, Pack, badge percentages) are summed for a level-100 player versus a level-1 player on an equivalent walk
- **THEN** the combined advantage SHALL NOT exceed +30%

#### Scenario: Level contributes no power
- **WHEN** Buddy's Level is evaluated as a candidate power source for the combined power gap ceiling above
- **THEN** its contribution SHALL be 0%, regardless of how high Buddy's Level climbs

#### Scenario: Fresh Ground contributes no power
- **WHEN** the Home Range's `bloomMultiplier` is evaluated as a candidate power source for the combined power gap ceiling above, on an equivalent walk with identical cell freshness for both players
- **THEN** its contribution SHALL be 0%, regardless of either player's Level, building levels, or treat balance

#### Scenario: Territory income contributes no power
- **WHEN** `territoryRate` is evaluated as a candidate power source for the combined power gap ceiling above, for two players holding an identical total claimed Home Range
- **THEN** its contribution SHALL be 0%, regardless of how many Territories either player's ground is split into

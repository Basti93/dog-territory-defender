## MODIFIED Requirements

### Requirement: Walk-Derived XP
The system SHALL award Den XP for every reward-eligible closed walk (see `walk-lifecycle`'s `Reward Eligibility Is Ground Covered, Not Loop Closure`), computed only from that walk's own distance and the real ground it painted into the Home Range (see `home-range`), with no dependency on Den building levels, treats spent, or Pack bonuses. The contribution of painted ground to the XP award SHALL be capped per walk, so a single outsized or GPS-anomalous walk cannot produce a disproportionate XP or level jump.

#### Scenario: XP awarded on walk close
- **WHEN** a walk is finished and meets the reward-eligibility floor
- **THEN** the system SHALL award XP equal to a flat base plus an amount scaled by the walk's total distance plus a capped amount scaled by the walk's painted Home Range footprint, with no building-derived or treats-derived multiplier applied

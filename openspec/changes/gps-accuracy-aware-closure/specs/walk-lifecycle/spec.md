## MODIFIED Requirements

### Requirement: Walk can end without a closed loop
The system SHALL allow the user to end an in-progress walk before it satisfies the closure condition — at least 10 recorded points, and straight-line distance between the first and last point under an accuracy-aware radius (the sum of the first and last points' own reported GPS accuracy, plus a fixed margin, rather than one fixed distance regardless of conditions) — preserving the recorded trail as an open, unclosed walk.

#### Scenario: Ending a walk that hasn't closed
- **WHEN** the user ends the walk while tracking and the walk has not yet met the closure condition
- **THEN** tracking stops, the recorded locations are retained, the walk is marked as not closed with no territory polygon, and the trail remains visible on the map

#### Scenario: Closing under good GPS conditions
- **WHEN** the first and last recorded points both have good (low-meter) reported accuracy
- **THEN** the closure radius is small, close to what a fixed ~20m threshold would have required

#### Scenario: Closing under poor GPS conditions
- **WHEN** the first and/or last recorded points have worse reported accuracy (e.g. under tree cover or in an urban canyon)
- **THEN** the closure radius widens accordingly, so a walker who genuinely returned to their starting point is not blocked by ordinary GPS noise

## MODIFIED Requirements

### Requirement: Achievement Unlock Presentation
Achievements triggered by closing a walk SHALL surface as part of the existing post-walk celebration moment. Achievements triggered by a Den action (an upgrade purchase, a treat threshold crossed while idle) SHALL surface as a lightweight in-app notice — either the Den screen's inline notice, or (when the achievement was triggered by idle passive accrual and the player has not yet opened the Den since it unlocked) the home-dashboard's "While You Were Out" strip — rather than a full-screen celebration, reserving the full-screen celebratory treatment for the walk itself. Whichever surface displays the unlock first SHALL mark it as acknowledged so it is not shown a second time on the other surface.

#### Scenario: Walk-triggered achievement unlock
- **WHEN** closing a walk causes one or more achievements to unlock
- **THEN** the post-walk celebration screen SHALL display all newly unlocked achievements alongside the territory-claimed and treats-earned summary, without opening a separate screen

#### Scenario: Den-triggered achievement unlock
- **WHEN** a Den building upgrade causes an achievement to unlock while the player is not actively closing a walk
- **THEN** the Den screen SHALL display the unlock as an inline notice, consistent with how treat storage overflow is already communicated

#### Scenario: Idle-accrual achievement unlock surfaces on the Doorstep first
- **WHEN** passive treat accrual crosses an achievement threshold before the player has opened the Den since it unlocked
- **THEN** the home-dashboard's "While You Were Out" strip SHALL be an acceptable surface for that unlock, and the Den screen SHALL NOT also show it once it has already been shown there

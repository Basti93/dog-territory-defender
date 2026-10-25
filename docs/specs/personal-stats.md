# Personal Stats

Lifetime stat tracking and one-off personal achievements give a solo player a highscore to chase without other players (leaderboards) or calendar tracking (streaks). Achievements are purely personal/cosmetic prestige today; the backlog's Trophy Hall (`den-economy`) is the only system allowed to attach a mechanical bonus to them.

## Lifetime stats

- Tracked across the full history, at minimum: total walks closed, lifetime distance walked, lifetime territory area claimed, biggest single territory ever claimed, longest single walk by distance, total treats earned lifetime.
- Updated incrementally when the underlying event occurs (a walk closes; treats are earned from a walk reward or passive accrual; building upgrade), not recomputed from full history on each read.
- Walk distance follows `walk-lifecycle`'s `Walked Distance Counts Only Plausible Steps`; stored totals and records are never recomputed or lowered by a rule change, except the one-off statistics correction (`walk-lifecycle`, "Statistics hygiene": idle tails out of lifetime distance, `statsBasis`). Aborted/stuck/glitchy walks never set the longest-walk record.
- **Walk closed into a territory:** total walks +1; lifetime distance and area increase by that walk's values; biggest-territory and longest-walk update if the new walk exceeds the record.
- **Passive accrual while away:** counts toward total treats earned lifetime exactly like a walk reward.

## Achievements (current)

- One-off lifetime-milestone achievements, each triggered by a single checkable threshold against lifetime stats or current Den building levels. Never triggered by consecutive-day streaks, time-of-day/calendar conditions, or any other player's data.
- Crossing a stat threshold or reaching a required building level records the achievement as unlocked exactly once, with the triggering event's timestamp; never re-evaluated or re-triggered afterward.
- **No mechanical bonus:** unlocking grants no treats, XP, territory advantage, or Den bonus; treats balance, building levels, and territory holdings are unaffected. The record is prestige data only (name, unlock copy, unlock timestamp).

## Unlock presentation

- **Walk-triggered:** surfaces in the walk's homecoming (badge arrival), showing the first two newly unlocked achievements (fence badges first) alongside the territory-claimed and treats-earned summary, without a separate screen; the rest hang on the fence already.
- **Den-triggered** (upgrade purchase, treat threshold crossed while idle): lightweight inline Den notice, consistent with how treat storage overflow is communicated; the homecoming is reserved for the walk itself.

## The fence (free display)

- Every unlocked achievement hangs on the yard fence as a clay rosette (colour per family: walks, distance, treats, den). It is the free, personal display: the badges are stored per player on the server so a reinstall brings them back, but they are never shown to partners or anyone else and never compared; no bonus; Trophy Hall (backlog, below) stays the only place a badge bonus may live.
- Off the fence: `ground-claimed`, `big-backyard`, `whole-city-block` (any qualifying walk, 25+ cells = 10,000 m², already clears them; thresholds unchanged). Beat 3 of a homecoming reveals new badges, max 2, never for a manual log or a partner's return.
- One empty hook shows the not-yet-earned threshold badge closest to its goal from 80% progress: no numbers, never a den badge.

## Trophy Hall handoff (backlog)

- Achievements here are the same badges Trophy Hall (`den-economy` building #8) displays once built (see `game-backlog`), using its existing per-badge bonus figure.
- This capability does not implement badge display selection, display limits, or any per-badge bonus percentage; those are built only when Trophy Hall is pulled, as part of Trophy Hall.
- When Trophy Hall is built, it can read every unlocked achievement by id and unlock timestamp.

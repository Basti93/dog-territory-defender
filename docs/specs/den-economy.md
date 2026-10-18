# Den Economy

The Den is the dog's home-base cookie-clicker loop between walks: treats earned from walking and passively from buildings, spent on building upgrades, with a visually evolving home and an always-visible "next upgrade" to chase.

## Treats and buildings

- **Treats:** earned once per walk and passively per hour by buildings (mainly the Treat Bakery); spent on building upgrades, up to the Doghouse's storage capacity.
- **Passive accrual while not walking:** treats keep accumulating at the owned buildings' rate, capped by Doghouse storage.
- **Exactly 10 buildings**, unlocking progressively. Only buildings whose unlock level is at or below the current Den Level become available to build.

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

- **Minimum Den:** until more buildings are pulled from the backlog (`game-backlog`, Long-term hooks), the Den shows exactly 3 buildings (Doghouse, Treat Bakery, Sniff Garden); the other 7 stay in the backlog.
- **Levels:** each building has up to 100 levels; each level costs exponentially more treats. Above level 50, bonuses give diminishing returns (soft cap, matching `anti-snowball`'s +50%-above-L50 cap): the marginal bonus per level past 50 is smaller than below 50.
- **Specialization:** at least three paths (e.g. Sniff Garden for collecting, Watch Tower for defense, Treat Bakery for idle farming); no single optimal build.
- **Next-upgrade tease:** the Den always shows one clearly visible next upgrade; once the player can afford at least one upgrade, it indicates which is next and its treat cost.
- **Storage never softlocks:** Doghouse capacity never falls below a fixed multiple of the cheapest currently-available upgrade cost across owned buildings. When that cost grows, capacity grows at least proportionally, so a full bank always affords it.

## Presentation

- Reflects the season and shows idle life: grass grows visibly greener in spring; the Spring Garden blooms with daffodils on season change; idle animations (dog sleeping in the Doghouse, butterflies near the Sniff Garden).
- **Overflow while away:** when passive generation fills Doghouse storage, notify the player on return (e.g. "Your Treat Bakery overflowed! 124 treats waiting").

## Walk-derived XP

- Every reward-eligible closed walk awards Den XP (eligibility: `walk-lifecycle`'s `Reward Eligibility Is Ground Covered, Not Loop Closure`), computed only from that walk's own distance and the real ground it painted into the Home Range (`home-range`). No dependency on building levels, treats spent, or Pack bonuses.
- XP on walk close = flat base + amount scaled by total distance + capped amount scaled by painted Home Range footprint; no building- or treats-derived multiplier. The painted-ground part is capped per walk, so one outsized or GPS-anomalous walk cannot cause a disproportionate XP or level jump.

## Den Level

- **Standalone and XP-derived:** derived only from the player's own lifetime XP; never from the sum, average, or presence of any building's level. Changing Doghouse, Treat Bakery, or Sniff Garden levels does not change Den Level.
- **Curve:** XP needed from level N to N+1 grows geometrically (like building upgrade costs), so each level-up needs more XP than the one just completed. Capped at level 100 (matching max building level): lifetime XP beyond the cumulative XP for level 100 leaves the level at 100.
- **No early unlock-ladder disclosure:** in the current game, Den Level does not display which building or feature unlocks at any future Den Level.

## Level payoff: per-walk income, never a capped power bonus

- Buddy's Level (player-facing name for Den Level) sets the flat treats payout per walk via a per-level curve that rises by a constant relative percentage per level with no upper limit. Shown as a concrete figure (e.g. "Buddy brings home N treats a walk").
- It is income, not a capped power bonus: not summed into `anti-snowball`'s `Hard Power Gap Soft-Cap` budget (contribution 0% for a level-100 vs a level-1 player). No capped percentage bonus anywhere (building, Pack, badge) is ever a function of Buddy's Level or the treat balance.
- **Level-up:** the per-walk payout rises by a visible whole number of treats; the walk's homecoming shows old and new per-walk rate together.
- **Secondary to territory:** the Den Level readout and level-up notice stay visually secondary to the walk's territory-claimed outcome (`visual-design` Success Criteria). When a territory-closing walk also crosses a level threshold, territory claimed is the primary moment and the level-up notice sits at or below the visual weight of the upgrade tease.
- **Milestone titles:** at a front-loaded, ever-widening sequence of levels Buddy earns a text-only title. No fixed final title, no numeric maximum shown (no "/100", no percentage), nothing that forecloses growth. At the highest authored title it is not presented as a final or maximum achievement, and the sequence stays computable beyond that level (even if not yet copy-written).

## Fresh Ground payout

- A treats-only multiplier on a walk's payout, scaled by the mean freshness of the Home Range cells it painted: ground not walked recently pays more treats than an otherwise identical walk over ground walked the day before.
- Never applies to XP.
- Suppressed (no bonus, no display) for any walk painting fewer cells than the Home Range's qualifying-walk cell floor.

## Manual-log route refresh

- A manually logged walk may optionally refresh the freshness of a route previously walked with live GPS tracking; capped at one route refresh per calendar day (no further refresh until the next calendar day).
- Always pays the same fixed Fresh Ground multiplier regardless of which eligible route is selected or how wild it is.
- Cannot extend the Home Range's Range: only cells already in the Range are eligible, none outside it are added.

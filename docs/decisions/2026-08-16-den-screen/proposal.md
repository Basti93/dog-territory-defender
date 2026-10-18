## Why

`treats-economy-core` built the treats/building logic but no UI — treats are only visible as a plain number in the header. Phase 1's actual hypothesis ("claiming territory plus earning passive treats creates a 'want to walk again tomorrow' feeling") can't be tested without the Den screen itself: the visible buildings, the "next upgrade" tease, the cookie-clicker hook the whole phase exists to validate.

## What Changes

- New Den screen: shows the 3 Phase 1 buildings (Doghouse, Treat Bakery, Sniff Garden), each tappable to view its effect and upgrade cost, reachable from the main screen (toggled view, same lightweight pattern as "View Past Walks" — no navigation library yet, that's Phase 1's later nav-tabs step).
- Building cards show current level, current effect, next-level effect, and upgrade cost (using `upgradeCost`/`storageCap`/`passiveTreatsPerHour`/`softCapBonusPercent` from `treats-economy-core`); tapping an affordable building upgrades it via the existing `upgradeBuilding` logic.
- A visible "next upgrade" tease: whichever affordable upgrade is cheapest is called out, per `den-economy`'s existing "Specialization and Visible Progression" requirement.
- Spring-themed presentation: per `den-economy`'s existing requirement — grass reads greener, a small idle touch (e.g. the dog resting near the Doghouse), and a notification when passive treats have filled storage while away.
- Adopts the prototype's per-building colors (Doghouse brown `#8B6F47`/`#D4A76A`, Treat Bakery orange `#C87941`/`#F5CBA7`, Sniff Garden green `#3A9E5F`/`#A8D5A2`) — these extend beyond `visual-design`'s 5 core tokens but match the already-approved visual prototype (`prototype/den-screen.jsx`); logged as a token extension here per that spec's own escape hatch.
- **Not in this change:** Pack collection, seasonal events, the other 7 buildings, tab navigation, post-walk celebration/confetti (separate, later steps).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `visual-design`: "Key Screen Intents" currently lists exactly 4 screens (Map View, Territory Claimed, Dog Profile, Leaderboard) — the Den screen is genuinely missing from that list. Adds a 5th intent describing what the Den screen should feel like.

## Impact

- New component(s) in `src/components/`: a `DenScreen` (and likely a `BuildingCard` sub-component).
- `App.tsx`: a toggle to reach the Den screen (same pattern as `showHistory`), wired to the existing `denEconomyRepository`/`denEconomy` logic from `treats-economy-core` — no new persistence or formulas needed, this change is UI only.
- `den-economy`/`anti-snowball`: unchanged — already fully specify the required behavior; this change implements it visually.

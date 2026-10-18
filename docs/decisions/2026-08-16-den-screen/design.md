## Context

`treats-economy-core` already built and tested all the underlying logic: `formulas.ts` (`upgradeCost`, `storageCap`, `passiveTreatsPerHour`, `softCapBonusPercent`), `denEconomy.ts` (`applyPassiveAccrual`, `awardWalkTreats`, `upgradeBuilding`), and `DenEconomyRepository` (persisted, single-row). This change is UI only — no new economy logic, no new persistence. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- A Den screen showing the 3 Phase 1 buildings, each upgradeable, with a visible "next upgrade" tease.
- Spring-themed presentation per `den-economy`'s existing requirement, scoped lightly (Phase 1, not Phase 4's full production).
- Reuse `treats-economy-core`'s logic as-is — no changes to `src/economy/`.

**Non-Goals:**
- No Pack collection, seasonal events, or the other 7 buildings (Phase 4).
- No tab navigation (Phase 1's later step) — same toggled-screen pattern as `WalkHistoryScreen`.
- No post-walk celebration/confetti screen (separate, later step) — treats-on-close still just folds into the existing `Alert`.

## Decisions

**Display metadata lives in the component layer, not `src/economy/`.** Building name, description, color, and effect-label formatting are UI concerns — `balanceConfig.ts`/`formulas.ts` stay pure numeric logic. A `BUILDING_DISPLAY` map (in `src/components/DenScreen.tsx`, mirroring the shape of the prototype's `BUILDINGS_DATA`) holds `{ name, sub, color, lightColor }` per building, keyed the same as `BuildingKey` from `balanceConfig.ts` so the two stay in sync by construction.

**Per-building colors, adopted from the prototype:** Doghouse `#8B6F47`/`#D4A76A`, Treat Bakery `#C87941`/`#F5CBA7`, Sniff Garden `#3A9E5F`/`#A8D5A2`. These extend `visual-design`'s 5-token palette — logged here and in `proposal.md`, matching the token requirement's own extension process rather than inventing new colors ad hoc.

**Effect text per building:**
- Doghouse: `storageCap(level)` → "Storage: N treats"
- Treat Bakery: `passiveTreatsPerHour(level)` → "+N treats/hour"
- Sniff Garden: `softCapBonusPercent(level)` → "+N% collectibles" (inert until Phase 2 collectibles exist — still shown, per `den-economy`'s Phase 1 scope already including this building)

**"Next upgrade" tease: cheapest affordable upgrade across all 3 buildings.** Compute `upgradeCost(building, currentLevel+1)` for each of the 3 buildings, filter to ones the player can currently afford, highlight the cheapest. If none are affordable, show the cheapest overall (so there's always a visible target to save toward, per `den-economy`'s "always a visible next upgrade" requirement).

**Toggled screen, same pattern as `WalkHistoryScreen`.** `App.tsx` gets a `showDen` boolean toggled by a "Den" button; `DenScreen` receives the repository via props and manages its own local state (mirrors the existing history-screen pattern — no new architectural pattern introduced).

**Upgrade flow:** tap a building → `denEconomyRepository.getState()` → `upgradeBuilding(state, key)` → if it's an error (`insufficient-treats` or `max-level`), show a small inline message, state unchanged; otherwise `saveState` and update the screen's local state (and bubble the new treats total back to `App.tsx`'s header via the existing `setTreats`, passed down as a callback).

**Spring presentation, kept light for Phase 1.** One idle SVG touch (e.g. the dog resting near the Doghouse) and a background storage-full notice ("Your Treat Bakery filled up while you were away!") shown once per session if treats are already at the storage cap on load. Full animation/seasonal theming (grass greening, Spring Garden blooms) is Phase 2+ scope (`den-economy`'s Spring-Themed Presentation requirement is broader than Phase 1 needs — Phase-Scoped Visual Delivery says build only what this phase needs).

## Risks / Trade-offs

- [Adding 3 more colors beyond the 5-token palette could invite unbounded palette growth] → Mitigation: these are the prototype's already-approved colors, not new ad hoc choices, and this change's own `proposal.md`/`design.md` document why, per the token rule's intended extension process — not a precedent for inventing colors freely elsewhere.
- [Sniff Garden's effect has nothing to consume it yet (no collectibles)] → Accepted, matches `den-economy`'s own Phase 1 building list; the number is still meaningful as a "next upgrade" target even before it does anything.

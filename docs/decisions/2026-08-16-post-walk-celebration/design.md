## Context

`DenScreen.tsx` already computes "cheapest affordable upgrade, or cheapest overall if none affordable" inline (`upgradable`/`affordableNow`/`teaseTarget`, lines ~77–82), using a local `getLevel(state, building)` switch. `stopWalk()`'s closing branch in `App.tsx` currently calls `Alert.alert('Success!', ...)` after saving the closed walk and awarding treats. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- One shared, tested `getUpgradeTease` function — no duplicated tease logic between `DenScreen` and the new celebration screen.
- A celebration screen that reads as "peak-joy," not a bigger alert box.
- Confetti that's actually gentle (few pieces, brief, tokens' colors) — matches the tone rules, not generic app-store-review-request-style confetti.

**Non-Goals:**
- No dog XP/level display — doesn't exist yet, deferred per `visual-design`'s Phase-Scoped Visual Delivery (see proposal.md). **Superseded:** this deferral was explicitly reopened in `docs/decisions/den-level-xp/` (2026-08-16) at the owner's request — see that change's `design.md` Context section for the full record.
- No celebration/reward path for open (unclosed) walks — unchanged, `walk-lifecycle` already specifies none.
- No confetti/animation library dependency — hand-rolled with `Animated`, scoped to this one moment.

## Decisions

**Extract `getUpgradeTease` into `src/economy/denEconomy.ts`.** Also extract `getBuildingLevel(state, building)` (currently a private switch inside `DenScreen`) as an exported helper, since the tease function needs it and it's generically useful. Building keys are read from `Object.keys(BALANCE.buildings)` rather than a UI-local array, so the economy layer doesn't depend on a list `DenScreen` owns.
```ts
export interface UpgradeTease {
  building: BuildingKey;
  cost: number;
  affordable: boolean;
}
export function getBuildingLevel(state: DenEconomyState, building: BuildingKey): number { ... }
export function getUpgradeTease(state: DenEconomyState): UpgradeTease | null { ... } // null only when every building is maxed
```
`DenScreen.tsx` switches its inline computation and local `getLevel` to these, removing the duplication proposal.md flagged.

**`CelebrationScreen` is a controlled overlay, same pattern as `WalkHistoryScreen`/`DenScreen`.** Props: `areaM2: number`, `treatsEarned: number`, `tease: UpgradeTease | null`, `onContinue: () => void`. `App.tsx` holds a `celebration: { areaM2, treatsEarned, tease } | null` state; `stopWalk()`'s closing branch sets it (computing the tease via `getUpgradeTease` on the post-award economy state) instead of calling `Alert.alert`; `onContinue` clears it back to `null`, returning to the map (which still shows the claimed territory, unchanged from today).

**Confetti: ~8 `Animated.View` pieces, hand-rolled.** Each piece: random horizontal start position, one of the token colors (green/blue/warm accent/dog brown), animates `translateY` down + fades out over ~1.2s via `Animated.timing`, triggered once on mount. No physics, no new dependency — matches "gentle, not aggressive" directly (a large confetti-cannon library's default look tends toward the "aggressive" end the tone rules warn against).

## Risks / Trade-offs

- [Hand-rolled confetti is less polished than a dedicated library] → Accepted — "gentle" is explicitly the goal, not maximal visual flourish; a small custom effect is easier to keep restrained and matches the project's general preference for minimal new dependencies.
- [`getUpgradeTease` returning `null` when everything's maxed is an edge case unlikely to occur in Phase 1's short test window] → Handled anyway (cheap to do correctly) — `CelebrationScreen` just omits the tease line if `tease` is `null`.

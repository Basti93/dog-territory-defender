## Status

**Technical, ready to implement — depends on `home-range` having already archived.** This is the second half of the `home-range` technical split (see `docs/decisions/home-range/design.md`'s "Technical Split Addendum" for why it split this way). All concept, geometry, and payout-curve reasoning lives in that file, already validated by `docs/decisions/home-range/home-range-prototype.mjs` — this proposal only scopes what ships in this half and does not repeat the math.

## Why

`home-range` ships a Range/Bloom that renders correctly and grows correctly, but pays exactly what today's polygon model pays — no walk earns more for returning to wilder ground, no walk celebrates discovering new streets, and there's no honest way to refresh a route's freshness from a walk that wasn't GPS-tracked. Those are the concept's actual payoff — `design.md`'s Decision 3 ("the load-bearing inversion... a wilder patch pays a bigger treat reward") is the whole point of the feature, not a follow-on. This change wires it up.

## What This Adds

- **Fresh Ground payout** (`design.md` Decision 3): `bloomMultiplier = 1 + 0.6 · B` applied to a walk's treats (never XP — see Decision 3's "why treats only"), suppressed below a ×1.25 threshold so a routine walk shows no multiplier line at all (Decision 3's UI rule).
- **Manual-log route refresh** (`design.md` Decision 4): picking a previously-GPS-tracked route to refresh from a manual log, capped at 1 refresh/day, fixed ×1.112 payout regardless of which route is picked (closes the route-picking exploit `design.md` measured).
- **New Ground / Fresh Ground celebration beats** at walk-close, and the "Buddy knows N streets" headline stat — exact copy and placement is `game-master`'s lane (`design.md` explicitly declines to write it), not settled in this proposal.
- **The anti-snowball invariant record**: `design.md` Decision 7 proves `bloomMultiplier` spends 0pp of the 30pp Hard Power Gap Soft-Cap budget arithmetically (no level/building/treat-balance term) — this needs to be real, reviewable spec text per this project's `virtual-dog-companion` precedent (`anti-snowball/spec.md`'s "no capped bonus reads Level or treat balance" invariant), not just a design-doc proof nobody re-checks later.

## Guardrails (unchanged from `home-range/proposal.md`, restated because they bind this half specifically)

- Bigger reward for coming back, never a penalty for having left — `bloomMultiplier`'s floor is `1.0`, never below.
- No numbers on the Bloom fill itself (already enforced by `home-range`'s rendering); the multiplier is a treats-screen line, not a map overlay.
- Territory is never a competitive metric — nothing here touches a leaderboard.

## Open Questions

- **K = 0.6 vs. a lower value** — `design.md`'s Decision 3/FLAG 2 sweep is provided for exactly this; needs a `game-master` sign-off before shipping the final constant, not just this architect's read of the sweep.
- **Copy for New Ground, Fresh Ground, and "Buddy knows N streets"** — `game-master`'s lane.
- **Whether the manual-log route-picker UI shows the player which routes are eligible** (vs. picking blind) — a UX call not resolved by `design.md`, which only fixes the payout math.

## Source

Concept and geometry/economy validation: see `docs/decisions/home-range/proposal.md` and `design.md`. Technical split: `senior-app-architect` review of `home-range`, see this repo session's decision to split into two changes.

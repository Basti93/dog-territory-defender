## Status

**Technical split complete, ready to implement.** This proposal and `design.md` remain the non-technical concept + validated geometry/economy reference for both halves of the technical split below. `specs/` and `tasks.md` in this change cover only the first half — the grid model, storage, migration, and rendering rewrite. The Fresh Ground payout, manual-log refresh, New Ground/Fresh Ground celebration copy, and the `anti-snowball`/`den-economy` invariant record ship in a sibling change, `home-range-rewards`, applied after this one archives (see `design.md`'s "Technical Split Addendum" for why it split this way and not into a third rendering-only change).

Drafted by a `game-master` subagent (non-technical, fun-only player-experience persona — see `.claude/agents/game-master.md`). The geometry, curves and payout maths in `design.md` were then produced and validated by a `game-economist` subagent against `home-range-prototype.mjs` in this folder.

**Phase is an open question** — see "Open Questions" below. This proposal does not assume one.

## Why

The territory model shipped today is one hard-cornered polygon per walk, computed by the shoelace formula in `src/utils/geometry.ts`, drawn as a separate green polygon on the map, with no aggregation across walks and nothing that connects one walk's territory to the next. Three things follow from that, and all three get worse the longer someone plays:

- **A walk that doesn't close into a loop produces nothing to look at.** `walk-lifecycle` already accepts open walks as first-class, and they leave no mark on the map at all.
- **The map becomes a scribble.** Every walk adds another polygon. After a hundred walks the map is a heap of overlapping green shapes that says nothing about where the dog actually goes.
- **Repetition is invisible.** Walking the same street every day for a year looks exactly like walking it once. There is no memory in the map, so there's no reason to look at it twice.

The polygon also lies about what happened: a walk is a *route*, and a shoelace polygon over that route claims the block interiors the dog never entered, with hard GPS-jitter corners that make it obvious the shape is an artefact rather than a place.

## The Concept: The Home Range

Two layers, deliberately kept separate, because they answer two different questions: *where have we ever been* and *where have we been lately*.

### Layer 1 — The Range (the outline)

The union of everywhere the player has ever walked with real GPS tracking on. It is **monotonic — it never shrinks, permanently.** Not a score, not a thing that can be lost, not a thing anyone else can take.

Any walk whose route touches ground outside the current Range extends it — **"New Ground"** — and that gets a celebration beat at walk-close. The headline stat is shown **in words** ("Buddy knows 41 streets"), never as a percentage of anything, because a percentage implies a denominator and a denominator implies a finish line.

### Layer 2 — The Bloom (the fill)

Inside the fixed Range outline, every patch carries a **freshness** value — how recently it was walked. It is rendered **as colour only**: deep saturated green where the dog was recently, paler and wilder where he hasn't been. Three hard rules:

- **(a) Never a number.** No percentage, no bar, no readout. Colour, and nothing else.
- **(b) A visible floor.** A patch walked once, years ago, keeps a faint permanent tint. It never goes blank, and the "wildest" state is reached in about two to three weeks and then *stops getting worse*. There is no unbounded decay and nothing that keeps sinking while you're away.
- **(c) The load-bearing inversion.** A wilder patch pays a **bigger** treat reward when walked than a freshly-walked one, and it renders as **more inviting** — wildflowers and texture, not neglect. Coming back after a break is the best walk of the month, not a guilt trip.

Rule (c) is the whole feature. If it inverts, this becomes a decay mechanic, which is exactly the anti-pattern `virtual-dog-companion` already ruled out ("the instant a bar can go down, opening the app becomes an obligation instead of a treat").

### Manual logs can refresh, but never discover

`walk-lifecycle` already supports logging a walk that wasn't tracked. That log may optionally pick a route the player has genuinely walked before with GPS on, and refresh that route's Bloom freshness exactly like a real walk of it — so the map tells the truth about a walk that really happened.

It can **never extend the Range.** You cannot discover new ground from memory. And it needs a cap, so freshness refreshes can't be farmed.

### Rendering: soft shapes and ghost trails

The Range renders as a **soft, rounded outline** rather than a hard-cornered polygon — which is both the right look and, practically, what hides GPS jitter. Past routes show as **ghost trails** faintly under the fill, accumulating as *brightness where routes overlap* — a street walked every day becomes a bright glowing vein — rather than drawing every individual route as its own line, which is the scribble problem again.

## Architectural Constraint (must hold)

Freshness must be modelled as a **per-patch clock** — a spatial grid or cell, not one global scalar. Phase 3 (deferred, not built now) needs "another player walking your patch accelerates that patch's freshness clock" to plug into the same mechanism without a rebuild.

## Guardrails

- **Nothing the player owns can shrink.** The Range is monotonic, forever. Only the *colour* of the fill moves, and it moves both ways.
- **No guilt.** A wild patch is an invitation, never a reproach. No sad states, no "your territory is fading" copy, no neglect imagery.
- **No numbers on the Bloom.** Colour only, per rule (a).
- **No finish line.** No percentage, no "N of M streets", no completion state.
- **Territory is never a competitive metric.** `anti-snowball` mandates rolling-7-day scoring; Range size must never appear on a leaderboard, in any phase.
- **Bigger reward for coming back, never a penalty for having left.** Same number, opposite framing, and only one of them is allowed.

## Explicitly Deferred (Phase 3 — don't design for it, just don't block it)

Other players' Ranges; shared or blended patches; neighbour presence effects; any territory-based leaderboard.

## What This Replaces

The per-walk `TerritoryPolygon` model in `src/utils/geometry.ts` (`locationsToPolygon`, `calculatePolygonArea`) and the `SHOW_ALL_TERRITORIES` polygon rendering in `src/web/mapHTML.ts`. `den-economy`'s walk-XP formula currently reads the polygon's enclosed area, so replacing the polygon has a reward-side consequence that the technical split must resolve — `design.md` covers it.

## Open Questions for the Technical Split

- **Which phase does this belong to? — Resolved: Phase 1 rebuild, proceed now.** This replaces the already-shipped Phase 1 territory mechanic (closed-perimeter polygon), not new-phase content — same posture as `virtual-dog-companion` touching Phase 1's existing Level mechanic. `game-master` had already resolved that the `visits` brightness channel (nominally Phase 2's "scent strength" language) must ship in the same release as Bloom, not split out (see `design.md`'s FLAG 1) — splitting it away would leave the Phase 1 acceptance-test persona (twice-a-day fixed-loop walker) with a feature that visibly does nothing for them. Decided directly by the user.
- **What happens to existing saved walks? — Resolved.** Every stored walk with a real GPS trail is replayed into the grid once, on first load after this change ships, seeded with that walk's own `startTime` so old ground reads as wild, not fresh. See `design.md`'s Technical Split Addendum.
- **Does the walk-XP formula's area term survive? — Resolved.** Replaced by `cellsPainted · 400` (a cell's real m² footprint), same shape, same cap, ships in this change (not deferred to `home-range-rewards`) since the area term breaks the moment the polygon is deleted. See `design.md`'s "Consequence that must be resolved" section and its worked replacement formula.
- **Does the loop-closure requirement (`canCloseWalk`) survive? — Resolved: no, retired.** Painting is decoupled from closure; reward eligibility moves to the existing 25-painted-cell (~200m) qualifying floor instead of "returns near its start." See `design.md`'s Technical Split Addendum for the full reasoning and the numeric-threshold log entry this requires per `CLAUDE.md` rule 6.
- **Copy and celebration wording for New Ground**, and the noun behind "Buddy knows 41 streets" — `game-master`'s lane, not settled here. Lives in `home-range-rewards`.

## Source

Concept designed by a `game-master` subagent pass. Geometry, freshness curve, payout scaling, exploit analysis and all numbers in `design.md` produced by a `game-economist` subagent and validated by running `home-range-prototype.mjs` (standalone Node, not wired into `src/`).

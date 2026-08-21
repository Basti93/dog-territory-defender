## Status

**Technical, ready to implement once its two upstream dependencies have archived — do not start before then:**

1. **`home-range`** — supplies the grid, the shipped `wildness()`/`paintedCells()`/`newGroundCells()` functions in `src/utils/grid.ts`, `HomeRangeRepository`, and the WebView renderer (`src/web/homeRangeRendererScript.ts`) this change extends. Its own tasks.md still has two unchecked items (5.1 and the 10.x on-device pass) — this change needs the renderer confirmed working on a real device first, not just unit-tested, since it adds a second contour pass to that same renderer.
2. **`home-range-rewards`** — supplies `bloomMultiplier` wired into `awardWalkTreats`. This is a **hard correctness dependency, not a sequencing nicety**: this change's wild-ground contour and "Somewhere Wild" card exist to tell the player "come back here, it pays off." Until `home-range-rewards` ships, no walk pays differently for wildness at all — every patch, circled or not, earns the same treats. Shipping this change first would mean drawing a dashed line around a spot and it turning out to be exactly as rewarding as everywhere else, which is precisely the failure mode ("the map must never draw attention to a patch that then pays nothing") this change's own design is built to avoid. See `design.md` Decision 2.

Drafted by `senior-app-architect`, scoping a concept already designed and user-approved from a `game-master` subagent pass (see `design.md`'s "Source" section for the full brief). The concept is not re-litigated here — this proposal only scopes it into buildable work and fixes two things in the original algorithm that were wrong as written (see `design.md` Decision 3).

## Why

`home-range` replaced the old per-walk polygon with a colour gradient (the Bloom) that's supposed to make "where hasn't the dog been lately" legible at a glance. Real on-device testing (after `home-range` already raised fill opacity from 0.28 to 0.6 to compensate) found that a smooth colour gradient over varying map tiles is something human vision genuinely can't read absolute values from — no amount of further opacity tuning fixes that, because the problem isn't contrast, it's that gradients don't carry legible thresholds. The fix isn't a colour change; it's converting the gradient into a shape (a second contour line, a marker) and a text surface (a small map-screen card) that state the same fact in words.

## What This Adds

Three tightly-coupled pieces — coupled because the marker and the card must agree on the same spot, which is why this ships as one change rather than being split further (see `design.md`'s "Why one change" note):

1. **A second contour line** at a wildness threshold that's guaranteed to be above `home-range-rewards`' Fresh Ground display-suppression floor — a warm, dashed line (distinct from the existing Range outline) circling ground that will visibly pay more if walked. Pure rendering, a second pass of the renderer's already-shipped marching-squares function over its already-shipped wildness field.
2. **One marker** on the single most-worth-visiting wild cluster on the player's map (not one per patch).
3. **A "Somewhere Wild" card** on the map screen (never the Den screen, never a push notification) — one warm sentence, tappable to pan to and highlight the marker from #2. Three states, evaluated when the app returns to the foreground: a recent New Ground discovery (past tense, expires after 48h), a qualifying wild cluster exists, or — the majority of the time — nothing renders at all. No count, no badge, no dismiss button.

## Two fixes to the original algorithm (see `design.md` Decision 3 for detail — flagging here because they're not implementation nitpicks, they're feasibility/correctness problems)

- **The wild-cluster threshold must be derived from `home-range-rewards`' `BALANCE` constants, not hardcoded as a bare `0.75`.** The original number was hand-checked against today's `K = 0.6` and the 1.25 display-suppression floor. `design.md`'s own Decision 3 for `home-range-rewards` calls `K` "a judgment call presented as a recommendation" that may be retuned. A bare `0.75` would silently stop being "safely above the floor" the day `K` changes, and nothing would catch it — exactly the failure mode this feature exists to prevent. Compute it from the constants instead.
- **The label-resolution fallback chain as originally specified requires data that doesn't exist.** "Fall back to the street name of the walk that first painted that cluster" implies per-cell provenance (which walk painted this cell first) that `HomeRangeRepository`'s `Cell` record doesn't carry and that this change has no reason to add just for a cosmetic fallback. Replaced with a bounded scan of recent walk history for any walk whose path overlaps the cluster — same intent (a real GPS fix is more likely to sit exactly on a named street than an arbitrary cell centre is), answerable from data that already exists. See `design.md` Decision 5.
- A third, smaller inconsistency also fixed: the original spec left an orphaned marker on the map (no card) when label resolution fails entirely. An unexplained marker with nothing to tap or read is exactly the kind of "thing sitting there quietly" the card's own "neither state renders" rule was written to avoid. Fixed: if the label can't be resolved at all, neither the marker nor the card renders.

## Guardrails (restated, unchanged from `home-range`/`home-range-rewards`)

- No numbers on the Bloom fill or the new contour — the card is the one place a fact is stated in words, and even there it's a sentence, never a count.
- No dismiss button, no push notification, no placeholder/empty state when neither card condition is met.
- Never the Den screen, per `home-range-rewards/design.md`'s FLAG 2 resolution (never a Den percentage and a Fresh Ground signal on the same screen).
- Copy's subject is always the place or the dog, never "you" — invitation, never reproach.

## Phase

Phase 1 — same posture as `home-range` itself: this extends the already-shipped-into-Phase-1 Home Range rebuild's own legibility, not new-phase content. No social, streak, or leaderboard surface is touched.

## Open Questions

- **Exact card/marker visual treatment** (icon glyph, card corner radius, marker style) — within existing design tokens (warm accent `#F39C12` for both the dashed contour and the marker, matching the "warmer tone" the concept asked for), left to whoever implements + a `game-master` pass, not pinned down here.
- **Whether foreground re-evaluation should be literally on every `AppState` foreground transition or debounced** — `design.md` Decision 6 recommends debouncing to avoid a reverse-geocode network call on every app switch; this is an implementation judgment call, not a product requirement change.
- **Exact card copy variants beyond the two examples already given** — `game-master`'s lane.

## Source

Concept: `game-master` subagent pass, already reviewed and approved by the user (see this session's brief). Technical scoping, algorithm fixes, and dependency analysis: `senior-app-architect`, grounded in `home-range`'s and `home-range-rewards`' already-written `design.md`s and the current state of `src/utils/grid.ts`, `src/web/homeRangeRendererScript.ts`, `src/web/homeRangeRaster.ts`, `src/components/MapView.tsx`, `src/storage/HomeRangeRepository.ts`, and `src/storage/WalkRepository.ts`.

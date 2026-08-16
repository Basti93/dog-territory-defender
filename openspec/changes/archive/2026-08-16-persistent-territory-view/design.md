## Context

`mapHTML.ts` currently tracks exactly one `territoryPolygon` via the `SHOW_TERRITORY` message — the active/just-closed walk's polygon. `MapView.tsx` sends it from a single `territory?: TerritoryPolygon` prop. `DenScreen`/`WalkHistoryScreen` already establish the pattern of taking a `repository` prop and fetching internally on mount. `walkRepository.getWalks()` already returns every saved walk (open and closed) with its `territory` field intact. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Every previously closed walk's territory visible on the map whenever no walk is active.
- Reuse the exact same visual styling as the current single-territory rendering — this is a "show more of the same," not a new visual tier.
- Follow the existing `repository`-prop pattern other screens already use, for consistency.

**Non-Goals:**
- No visual differentiation between old/new/repeat-visited territory (scent-strength deepening) — that's Phase 2 (`game-phases`' "Repetition Reward Loop"), explicitly deferred.
- No territory-merging/union geometry (overlapping polygons just overlap visually) — real geometric merging isn't needed for a single player with no overlap concept yet (that's Phase 3, other players' territories).
- No change to the active-walk rendering path (`SHOW_TERRITORY` for the current walk stays exactly as-is).

## Decisions

**New message type: `SHOW_ALL_TERRITORIES`, separate from `SHOW_TERRITORY`.** Keeps the current-walk polygon (shown during/just after a walk) and the accumulated-past-territories layer independent — `reset()` (called when a new walk starts) clears the current-walk polygon/trail/marker but must NOT clear the accumulated layer, since that's the whole point of this change. `mapHTML.ts` gets a second layer reference (`allTerritoriesLayer`, an `L.layerGroup`) alongside the existing `territoryPolygon`.

**`MapView` takes an optional `walkRepository` prop, fetches on mount and whenever it returns to idle.** Matches `DenScreen`/`WalkHistoryScreen`'s existing pattern rather than inventing a new one. Triggered on the same `locations.length === 0` transition that already drives `RESET` — a freshly closed walk (saved via `walkRepository.saveWalk` in `App.tsx`'s `stopWalk`) is naturally included the next time the app goes idle (Cancel, or "New Walk"), no extra wiring needed.

**Fit bounds to the union of all territories when the message is received, only if at least one exists.** If the player has no closed walks yet, leave the current default view untouched (no behavior change for a first-time user) — don't invent a "no territory yet" empty state as part of this change, that's a separate, smaller polish item if it turns out to matter.

**Same visual styling as today's single polygon** (`#2ECC71`, `weight:2`, `fillOpacity:0.2`) for every polygon in the accumulated layer — no new tokens, no new visual language.

## Risks / Trade-offs

- [A player with many closed walks could accumulate enough polygons to slow WebView rendering] → Not a concern at Phase 1's testing scale (single player, days of testing, at most a handful of walks); revisit if it becomes a real problem later.
- [Overlapping polygons just visually overlap rather than merging into one shape] → Accepted — real territory-union geometry isn't needed until multiplayer overlap (Phase 3) makes it meaningful; premature to build now.

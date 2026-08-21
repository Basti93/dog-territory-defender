## Context

`home-range` shipped a colour-only freshness gradient (the Bloom). Real on-device use found it unreadable at a glance even after raising fill alpha from 0.28 to 0.6 — the diagnosis (from the `game-master` pass this change scopes) is that a smooth gradient over varying basemap tiles genuinely can't be read for absolute value by human vision, no matter how saturated. The fix is to add a legible *shape* (a second contour, a marker) and a *text* surface (a card) that restate the same underlying fact — never a new fact, never a new number.

Everything here builds on `home-range`'s already-shipped `src/utils/grid.ts`, `src/storage/HomeRangeRepository.ts`, `src/web/homeRangeRaster.ts`, `src/web/homeRangeRendererScript.ts`, and `src/components/MapView.tsx`, and on `home-range-rewards`' not-yet-implemented `bloomMultiplier`/`BALANCE` constants (see Decision 2 for why this is a hard dependency, not a soft one).

## Goals / Non-Goals

**Goals:** make "there's a wilder patch nearby, and walking it pays more" legible without a new number anywhere; keep the marker and the card in agreement (same spot); degrade to nothing (not a broken/empty state) whenever the underlying data can't support a confident answer.

**Non-goals:** re-tuning the Bloom's colour ramp or opacity (already shipped, already tuned); anything involving other players (Phase 3, explicitly deferred); a general-purpose reverse-geocoding service (this uses exactly one native API call, cached).

## Why one change, not a further split

`home-range` itself was split into a model+render half and a payout half specifically because a grid with no picture is strictly worse than the polygon it replaced (nothing to show for the work), but the payout half layers cleanly on top of an already-visible, already-correct render without touching it again. That reasoning does not apply to splitting *this* change further: the contour and the marker are only meaningful because the card explains them (an unlabelled dashed line and a marker with nothing to tap are exactly the "gradient nobody can read" problem restated in a new shape), and the card's tap-to-pan behaviour requires the marker to already exist. There is no useful middle milestone here — ship together.

## Decision 1 — Where each piece is computed

| Piece | Computed | Why |
|---|---|---|
| Second (wild-ground) contour | Inside `homeRangeRendererScript.ts` (WebView) | It's a second pass of the already-shipped `hrMarchingSquaresSegments` over the already-shipped `wildBlurred` field, at a different threshold — no new data leaves the WebView, no new payload field needed. |
| Winning wild cluster (connected components, scoring, anchor) | RN side, in a new `src/utils/wildSpot.ts` | Reverse geocoding, `WalkRepository` access, and `AppState` foreground events are all RN/native concerns unavailable inside a WebView script. The candidate set is also small (only cells at or above the wild threshold, not the full Range), so there's no meaningful performance reason to push it into the WebView the way the bounded-raster payload was for the full render. |
| Marker placement | RN computes the anchor `{ix, iy}` → `MapView.tsx` sends it to the WebView as a small new bridge message (`SHOW_WILD_SPOT`, alongside the existing `SHOW_HOME_RANGE`) carrying just a lat/lon; the WebView drops an `L.marker` at it. | Mirrors the existing `postMessage` bridge pattern exactly (see `SHOW_HOME_RANGE`'s own shape) — one more small, typed message, not a new mechanism. |
| Street-name resolution, New Ground event persistence, card copy | RN side | Needs `expo-location.reverseGeocodeAsync`, `HomeRangeRepository`, and `WalkRepository` — none of which exist in the WebView. |

## Decision 2 — Hard dependency on `home-range-rewards`, and why the threshold must be derived, not hardcoded

The game-master brief specified `WILD_THRESHOLD = 0.75`, justified as "safely above `bloomMultiplier >= 1.25`" using today's `K = 0.6` (`bloomMultiplier = 1 + 0.6 · 0.75 = 1.45`). That arithmetic is correct **today**, but `home-range-rewards/design.md` explicitly calls `K` "a judgment call presented as a recommendation," with a sweep table showing 0.3 through 1.0 all pass every degeneracy/cap check — i.e., `K` is documented as plausibly still open. If `K` is ever retuned down (say to 0.4), a hardcoded `0.75` silently stops being "safely above" the suppression floor (`1 + 0.4 · 0.75 = 1.30`, still technically above 1.25, but the margin the original author intended is gone; at `K = 0.3`, `1 + 0.3 · 0.75 = 1.225`, actually **below** the floor — the contour would then circle a spot that shows no Fresh Ground beat at all, exactly the bug this feature exists to prevent).

**Fix:** compute the threshold from `home-range-rewards`' own `BALANCE` constants rather than duplicating a literal:

```
WILD_THRESHOLD = ceil20((FRESH_GROUND_UI_THRESHOLD - 1) / BALANCE.homeRange.bloomK, step=0.05)
             // FRESH_GROUND_UI_THRESHOLD = 1.25, per home-range-rewards/design.md Decision 3's UI rule
             // at K=0.6 today this evaluates to 0.70, rounded up to 0.75 — matches the original number,
             // by construction rather than by coincidence
```

Round up (never down) to the nearest 0.05 so there's always a small margin, not an exact boundary match — a cell sitting exactly at the computed threshold should clear the display-suppression check with room for floating-point noise, not land on it. Store this as a named constant next to the wild-cluster code with a comment pointing at `home-range-rewards/design.md` Decision 3, so a future change to `K` is the one place this needs revisiting — and grep for `bloomK` finds it.

This is also the concrete reason this change cannot ship before `home-range-rewards`: the constant it needs (`BALANCE.homeRange.bloomK`, `FRESH_GROUND_UI_THRESHOLD`) doesn't exist in code until that change lands.

## Decision 3 — Wild cluster selection: the game-master algorithm, with two fixes

Original 8-step algorithm (see this session's brief) is sound in its core shape — candidate cells at or above threshold, 8-neighbour connected components, drop small ones, score by `visits` (not `wildness`, since past the 18-day ceiling every wildness value is flat at 1.0 and would rank arbitrarily), anchor on the highest-visits cell rather than a centroid that could land off-street. Reusing `NEW_GROUND_MIN_CELLS`'s neighbour ("11 cells" is `grid.ts`'s existing `CELLS_PER_STREET` divisor, not a new invented number) is good discipline and is kept as specified — `CELLS_PER_STREET` needs an `export` added in `grid.ts` (currently module-private) so `wildSpot.ts` can import it directly instead of re-declaring the same number a second time.

Two problems, both fixed here:

### Fix 1 — Label fallback chain referenced data that doesn't exist

Original step 8: "fallback to the street name of the walk that first painted that cluster (from walk history)." `HomeRangeRepository`'s `Cell` record has no per-cell provenance (which walk painted it first) — adding one would mean a schema change to an already-shipped table for a fallback path that (by design) is rarely exercised. There's also no reason it needs to be the *first* walk chronologically; the actual purpose (per the original intent, preserved here) is "a real GPS fix is more likely to sit exactly on a mapped street than an arbitrary cell centre is, so if reverse-geocoding the anchor cell's centre returns nothing useful, try reverse-geocoding a real point from a walk that's known to have passed through this cluster instead."

**Fix:** replace "first walk to paint the cluster" with a bounded scan of recent walk history for *any* walk whose path overlaps the cluster:

```
1. Reverse-geocode the anchor cell's own centre point. If it resolves, done — this is the common case.
2. Else: from WalkRepository.getWalks(), filter to tracked walks (locations.length > 0) whose
   bounding box overlaps the cluster's bounding box (cheap pre-filter, no paintedCells() call yet),
   most recent first, capped at the 20 most recent matches.
3. For each candidate walk (nearest-in-time first), call paintedCells() on its locations and check
   for intersection with the cluster's cell set. On the first hit, reverse-geocode one of that walk's
   own recorded locations (e.g. the one nearest the anchor cell's centre) instead of the anchor.
4. If nothing resolves after that, render neither the marker nor the card this cycle (see Fix 2).
```

Cache the resolved label keyed by the winning cluster's anchor cell id, so this scan — and any reverse-geocode network call — runs once per newly-selected winning cluster, not on every foreground check (see Decision 6).

### Fix 2 — An orphaned marker when the label fails is worse than no marker

Original spec: "fallback to marker-only, no card, if neither resolves." A marker with nothing to tap and no accompanying sentence is itself an unexplained thing sitting on the map — precisely what the card's own "neither state → nothing renders" rule exists to avoid for the text surface. **Fix: label resolution failing means neither the marker nor the card renders this cycle.** This is a rare path (native reverse-geocoding usually succeeds for coordinates inside a walked area) and costs nothing to wait for on the next foreground check.

### Determinism additions the original spec didn't fully pin down

- **Tie-break on `visits` sum** (step 6): cell count, then lowest `(ix, iy)` — as specified.
- **Tie-break on anchor selection** (step 7, not specified): if multiple cells in the winning component share the highest `visits` value, pick the lowest `(ix, iy)` among them, same convention as step 6, so the anchor is reproducible given identical stored data (useful for tests and for the "does the marker jump around" bug class).

## Decision 4 — New Ground event: a persisted fact, not a recomputation

The card's first-priority state ("Buddy learned 3 new streets... on Tuesday") needs to still be answerable up to 48 hours *after* the walk that discovered them closed — by which point `home-range`'s in-memory `newGroundCellCount` (computed once, at that walk's own close, and only threaded into that walk's own celebration screen per `home-range-rewards` task 3.1) is long gone. This needs a small persisted fact, not a re-derivation, because re-deriving "was there a New Ground event in the last 48h" from the stored Range alone is not reconstructable after the fact (the Range doesn't remember *when* each cell first joined it, only its current `lastRefreshed`/`visits`).

**Add to `HomeRangeRepository`** (extending the existing interface, not a new sibling repository — this is Home-Range-derived state, and the existing repository already owns the one other Home-Range-wide fact worth persisting): a single-row record —

```
getLastNewGroundEvent(): Promise<{ occurredAt: number; cellIds: CellId[] } | null>
recordNewGroundEvent(occurredAt: number, cellIds: CellId[]): Promise<void>  // overwrites, doesn't append
```

Written at Finish Walk, in the same `App.tsx` call site that already computes `newGroundCells(...)` (task 6.1 of `home-range`'s own tasks.md) — whenever that count clears `NEW_GROUND_MIN_CELLS`, this change adds one more write alongside the existing celebration-data assembly. This is a single overwritten row (matching the `dogName`/`xp`/migration-flag singleton pattern this codebase already uses elsewhere), not an event log — only the most recent New Ground event is ever relevant to this card, and there is no other consumer of a history of past ones.

**"N new streets" for the copy**: reuse the same conversion `streetsKnown` already uses for the Range total — `max(1, floor(newGroundCellCount / CELLS_PER_STREET))` — applied to this walk's own new-ground count, not the whole-Range count. (Not specified explicitly in the original brief; this is the one place a concrete formula needed to be chosen to make the copy computable at all.)

**48-hour expiry is evaluated on read** (`now - occurredAt <= 48h`), the same "compute freshness at evaluation time, don't schedule anything" philosophy `wildness()` and the existing earned-trigger notification system already use — there is no cleanup job, and the stored row is simply ignored once stale (and overwritten wholesale the next time New Ground fires again).

**Label for the New Ground state** uses the same resolution chain as Decision 3 (reverse-geocode a point from the discovering walk's own trail — already have exact GPS fixes for this state, no anchor-cell-centre approximation needed at all), independently cached.

### Card copy, finalized by `game-master`

**New Ground state.** Does *not* require a resolved place name (unlike the wild-cluster state below, which is meaningless without one) — the count plus the day is a complete sentence on its own; render the card either way rather than withholding a discovery celebration because a geocoder blinked:

```
with place:    {dog} learned {n} new street{s} by {place} {dayPhrase}.
without place: {dog} learned {n} new street{s} {dayPhrase}.
```
`dayPhrase` = `today` | `yesterday` | `on {Weekday}` (the 48h window can reach two calendar days back).

**Wild-cluster state.** Requires a resolved place name — no name, no card, per Decision 3's rule (this state alone). Rotate through 4 variants so the same walk-back suggestion doesn't read identically for weeks:

```
A: {place} is looking wild — great sniffing over there.
B: {place} has gone lovely and overgrown — worth a wander.
C: Something wild is happening over by {place}.
D: {place} is greening up again — {dog} would love a look.
```
Selection: `index = hash(anchorCellId + variantEpoch) % 4`, where `variantEpoch` only advances when the winning cluster (Decision 2's `wildestCluster()`) changes — stable within a session (no flicker on re-foreground), fresh when the wild spot itself moves.

Both states hold the project-wide copy rule locked earlier in this session: the subject is always the place or the dog, never "you" — no "you haven't," no day-count-as-guilt.

## Decision 5 — Reverse geocoding: `expo-location`'s native call, no new dependency, cached

`expo-location` (already a dependency, already used for foreground/background permission and tracking) exports `reverseGeocodeAsync(location)`, backed by the OS's own geocoder (Android `Geocoder` / iOS `CLGeocoder`) — not a new package, not a new backend service, not an API key. This fits the project's no-backend constraint the same way the existing Leaflet/OpenStreetMap tile fetch already does: it needs network access at the moment it's called (already true for the map generally, per `CLAUDE.md`'s "Requires internet access at walk time" note on `MapView.tsx`), but introduces no new external account, key, or server.

**Caveat worth flagging plainly, not glossed over:** the OS geocoder is not uniformly reliable on every Android device (some budget devices/regions lack a working backend geocoder even with location permission granted and network available) — this is a real device-fragmentation risk, not a hypothetical one. That's exactly why Decision 3's fallback chain and Decision 3/Fix 2's "resolve or render nothing" rule matter: this feature must degrade to invisible, not to a broken or placeholder card, on a device where geocoding doesn't work at all. **Practical consequence: on some fraction of real devices, this card may simply never appear**, which is an acceptable, silent degradation given the guardrail against empty/placeholder states — but it should be called out during manual on-device verification (tasks.md's manual section) on more than one device/Android version, not assumed to work from a single test device.

Cache resolved labels (keyed by anchor cell id or, for the New Ground state, by the event's `occurredAt`) in memory for the app session at minimum; a small persisted cache (e.g. alongside the New Ground event row) avoids re-geocoding the same spot on every cold start, but isn't required for correctness — geocoding failure just means the card doesn't render that cycle, per Decision 3/Fix 2.

## Decision 6 — Evaluation cadence: on foreground, but debounced

The brief says "evaluated on app foreground" as a *product* behaviour (the state can only change while the player wasn't looking), not literally "issue a network call every time the app switches back from another app." Recomputing the connected-components pass is cheap (bounded to the wild-threshold candidate subset of the Range, itself bounded per `home-range`'s own viewport-scoped reads), but the reverse-geocode call is a network round-trip and should not fire on rapid app-switching (e.g. checking a text message mid-walk). **Recommendation:** recompute the winning cluster/label at most once per some short interval (e.g. 15–30 minutes) or when the Range's cell count has changed since the last computation — whichever is simpler to implement; this is an implementation judgment call, not a product requirement, and is called out as an Open Question in `proposal.md` rather than pinned down here.

## Decision 7 — Rendering style for the second contour

Reuse `hrMarchingSquaresSegments` (already generic over field/threshold) a second time over `wildBlurred` (already computed every render pass) at the derived `WILD_THRESHOLD` from Decision 2, stroked distinctly from the existing Range outline: warmer tone (`#F39C12`, the existing "warm accent" design token — no new token needed), thinner weight, dashed (`dashArray`, supported by the Leaflet version already in use). No new bridge payload field — the second pass reads the exact same `wild` plane the fill already decodes.

## Risks / Trade-offs

- **[Reverse geocoding may simply not work on some real devices]** — see Decision 5. Mitigated by degrading to "card doesn't render," never to a broken state, but this means the feature's actual reach across the install base is unknown until tested on more than one device.
- **[`WILD_THRESHOLD`'s correctness is now tied to a constant in a sibling change]** — mitigated by deriving it in code (Decision 2) rather than hardcoding, but whoever retunes `bloomK` later needs to know this file exists and re-derives from it automatically; the comment cross-reference in Decision 2 is the whole mitigation, so don't drop it in a later refactor.
- **[A player who's been away 3+ weeks may have most of their Range simultaneously above `WILD_THRESHOLD`]** — not a bug: the connected-components pass still picks one winning cluster (by `visits`), which in this case surfaces their historically most-walked spot as "the" wild spot, which is the intuitively correct answer for someone who's been gone a long time. Worth a manual on-device check (tasks.md) since it wasn't validated against simulated data the way `home-range`'s numbers were (no `game-economist` pass ran against this feature — it's a UI/legibility change, not an economy change).
- **[Bounded walk-history scan (Decision 3, Fix 1) could still be slow on a very long-lived install]** — capped at 20 candidate walks and pre-filtered by bounding box before the more expensive `paintedCells()` call, but not measured against a large synthetic walk-history dataset the way `home-range`'s own numbers were. Flag for retuning if it's ever observed to lag on-device.

## Source

Concept: `game-master` subagent pass (already reviewed/approved by the user). Grounding and the two algorithm fixes above: this session's `senior-app-architect` read of `home-range/design.md`, `home-range-rewards/design.md`, and the current contents of `src/utils/grid.ts`, `src/web/homeRangeRendererScript.ts`, `src/web/homeRangeRaster.ts`, `src/components/MapView.tsx`, `src/storage/HomeRangeRepository.ts`, `src/storage/WalkRepository.ts`, `src/types.ts`.

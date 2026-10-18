## Context

`proposal.md` is the `game-master`'s concept document — it deliberately carries no numbers. This design supplies them. It answers the five questions that concept handed over: the freshness curve, the Fresh Ground payout scaling, the spatial patch model itself, the manual-log refresh cap, and New Ground detection.

Every formula here was validated by running **`home-range-prototype.mjs`** in this folder (standalone Node, nothing imported from or into `src/`). **Every worked number quoted below is that script's real output**, reproducible with:

```
node docs/decisions/home-range/home-range-prototype.mjs
```

**What is already implemented**, since every number below is anchored to shipped code rather than to specs' prose:

- `src/utils/geometry.ts` — `locationsToPolygon` builds one hard-cornered polygon per walk from the raw GPS point list; `calculatePolygonArea` is a shoelace over lat/lon scaled by `111000²`. No aggregation across walks, no persisted growing territory.
- `src/web/mapHTML.ts` — `SHOW_ALL_TERRITORIES` posts every stored polygon's full coordinate list to the WebView and draws each as its own Leaflet `L.polygon`. Payload and layer count both grow linearly with walk count, forever.
- `src/economy/formulas.ts` — `buddyTreatsPerWalk(L, sg) = round(buddyPayout(L) · (1 + sniffGardenPct(sg)/100))`, `buddyPayout(L) = round(50 · 1.055^(L−1))`, `sniffGardenPct(100) = 8.00 %`.
- `src/economy/walkRewards.ts` — `DAILY_REWARD_MULTIPLIERS = [1, 1, 1, 0.5, 0.25, 0.1]` applied to the treat payout and the XP flat base on both the tracked-close and manual-log paths.
- `src/economy/formulas.ts` — `xpAwardForWalk = 20·baseMult + 15·km + 5·min(area, 20 000)/1000`. **The area term reads the polygon this change deletes.**
- `docs/decisions/2026-08-21-virtual-dog-companion/design.md` — the invariant this design must not break: *no bonus percentage may ever be a function of Buddy's Level or of a player's treat balance*, and the +30 pp power ledger (Sniff Garden 8, Training Yard 6, Watch Tower 6, Spring Garden 3, Trophy Hall 3, Pack 4, Level 0).

## Goals / Non-Goals

**Goals**
- A per-patch freshness clock with a hard floor and a hard ceiling, whose one-day step is *measurably* perceptible as colour without any number being shown.
- A Fresh Ground payout that makes a return walk genuinely the best walk of the month, while making it arithmetically impossible for walking *less* to earn more.
- A geometric unit that is discrete enough to carry a per-patch clock (the Phase 3 architectural constraint) and cheap enough to run live on-device with no backend.
- Proof — not assertion — that this spends **0 pp** of `anti-snowball`'s 30 pp power budget.
- Numbers that survive real GPS jitter, not just idealised routes.

**Non-Goals**
- Not judging whether any of this is *fun*. Where a number implies a lived experience I flag it and hand it back to `game-master`; two such flags are raised below and neither is resolved here.
- Not writing copy, celebration wording, or the noun in "Buddy knows N streets".
- Not implementing anything. Wiring this into `src/` is a separate change with its own tasks.
- Not designing Phase 3's shared/neighbour behaviour — only reserving the field it will write to.
- Not choosing the phase. See `proposal.md`'s Open Questions.

---

## Decision 1 — The patch is a **20 m square grid cell**, not a buffered blob

```
CELL_M   = 20                                  // cell edge, metres
D_LAT    = 20 / 111320                         // = 1.7966e-4 deg, constant everywhere
dLon(iy) = 20 / (111320 · cos((iy + 0.5)·D_LAT))  // depends only on the ROW, never on the point

iy = floor(lat / D_LAT)
ix = floor(lon / dLon(iy))
```

A cell is identified by the integer pair `(ix, iy)`. `dLon` is derived from the row index rather than from the point's own latitude, so the mapping is a pure function with no drift and no ambiguity at cell boundaries. Cells stay near-square at every latitude the game will ever see.

**Why a fixed grid and not a buffered polyline.** The buffered-blob approach renders more smoothly out of the box, but the concept's load-bearing architectural constraint is a **per-patch clock** — Phase 3 must be able to push *one patch's* freshness forward when a neighbour walks it. A blob is a continuous region with no discrete addressable units; giving it per-patch clocks means inventing a discretisation anyway, at which point you have a grid with extra steps. A grid also makes every operation this feature needs O(1): membership, neighbour lookup, spatial range query, merge of two players' cell sets (Phase 3, deferred). Blockiness is a *rendering* problem, and Decision 6 solves it at render time without touching the model.

**Why 20 m and not 10 or 50.** It is chosen against the GPS constants already in this codebase and in `game-phases/spec.md`:

| | |
|---|---|
| `game-phases` urban-canyon drift target | < 10 m |
| `geometry.ts` closure accuracy margin | 10 m |
| Cell edge | **20 m** |

A 10 m drift can move a fix at most one cell. That is exactly the displacement the New Ground dilation test in Decision 5 absorbs. A 10 m cell would make jitter span 2-3 cells and quadruple storage; a 50 m cell is wider than a street plus both pavements and would make "a patch" larger than the thing a player thinks of as a place.

**Painting.** A walk paints every cell whose *centre* lies within `PAINT_RADIUS_M = 25 m` of the walked path, with the path resampled every 5 m between GPS fixes.

Two guards on what counts as walked path, both anti-exploit and both cheap:

```
MAX_SEGMENT_M        = 60     // longer gap between fixes = signal loss, do not paint through it
MAX_SEGMENT_SPEED_MS = 4.5    // 16 km/h; faster is a bike/tram/car, not a dog walk
```

Without these, a tram ride paints a corridor across the city and a signal dropout paints a straight line through a block of flats.

### Worked examples (real output)

| | measured |
|---|---|
| A typical 1.5 km loop (750 GPS fixes) | **165 cells**, 66 000 m² |
| Cells painted per 100 m walked | 11.0 |
| Ribbon width on a straight 500 m leg | histogram `{2 cells: 14 rows, 3 cells: 13 rows}`, **mean 2.48 cells = 49.6 m** |
| "Buddy knows N streets" after that one walk | **15** |
| Storage, 3-loop-rotation walker, 1 year | 495 cells ≈ 29 KB |
| Storage, explorer with ~60 km of distinct street | 7 500 cells ≈ 439 KB |
| Storage, pathological (2 km radius fully covered) | 31 416 cells ≈ 1.8 MB |
| Full repaint of a whole 1.5 km walk | **0.50 ms** (200 runs averaged) |

The ~50 m painted ribbon is deliberately wider than a street: it covers both pavements plus the GPS error envelope, which is what makes "we know this street" true rather than "we know this exact line".

**Cost budget.** Each GPS fix triggers at most 50 centre-distance tests plus Set lookups — the incremental live cost is ~1/750th of that 0.50 ms. No database write per fix: cells are batch-written in a single transaction at walk close. Freshness is **never stored as a decaying value** and there is no background job; it is computed lazily from a timestamp at render.

### The per-cell record

```
cell = {
  ix, iy,               // int32 each
  lastRefreshed,        // ms epoch — the BLOOM clock
  lastTracked,          // ms epoch — GPS-verified only
  visits,               // int, monotonic, tracked walks only
}
```

~28 bytes of payload, ~60 B/row with SQLite overhead.

**Two clocks, not one, and this matters.** `lastRefreshed` may be pushed forward by a tracked walk, by a manual route refresh (Decision 4), or — Phase 3, deferred — by a neighbour walking your patch. `lastTracked` is written **only** by real GPS. `anti-snowball` mandates walk-frequency-based territory defence; the day that reads a freshness clock, the manual log becomes a defence exploit. Reserving `lastTracked` now costs 8 bytes and closes that whole class of bug before it can be written.

**Phase 3 hook, reserved not built.** The neighbour effect is a single write to `lastRefreshed`, and the field is shaped so a *partial* push is expressible without a schema change: `lastRefreshed = lastRefreshed + α·(now − lastRefreshed)`, `α ∈ (0, 1]`, so a neighbour can grant partial credit rather than fully resetting your patch. Nothing about that is designed here beyond leaving room for it.

**`visits`** is the ghost-trail brightness channel the concept asks for — accumulated brightness where routes overlap, instead of N separate polylines. Per `game-master`'s resolution of FLAG 1 below, its render channel (alpha/density) ships in this same change, not deferred — it's the scent-depth axis that gives the fixed-loop Phase-1-test walker a real signal Bloom alone can't provide.

---

## Decision 2 — The freshness curve: `wildness(d)`, τ = 5 days, hard ceiling at 18 days

```
wildness(d) = 0                                        for d ≤ 0
            = (1 − e^(−d/5)) / (1 − e^(−18/5))         for 0 < d < 18
            = 1                                        for d ≥ 18
```

`d` = days since that cell's `lastRefreshed`. `wildness = 0` is freshly walked; `wildness = 1` is fully wild. The renderer draws `1 − wildness` as "freshness". The division by `(1 − e^(−18/5)) = 0.97268` is what makes the curve reach *exactly* 1 at day 18 instead of asymptotically approaching it forever — that is the concept's "stops getting worse" rule (b), enforced by construction rather than by a tolerance.

### Worked examples (real output)

Colour ramp used for the measurement: fresh `#2ECC71` (the existing spring-green design token) → wild `#DCE8BE` (pale meadow), interpolated in CIE Lab. Full-ramp ΔE76 = **53.7**. ~2.3 ΔE is one just-noticeable difference; > 5 is obvious at a glance.

| day | wildness | Δ/day | ΔE vs 1 day fresher | ΔE vs fully fresh |
|---|---|---|---|---|
| 0 | 0.000 | — | — | 0.0 |
| **1** | **0.186** | **0.186** | **10.0** | **10.0** |
| 2 | 0.339 | 0.153 | 8.2 | 18.2 |
| 3 | 0.464 | 0.125 | 6.7 | 24.9 |
| 5 | 0.650 | 0.084 | 4.5 | 34.9 |
| 7 | 0.775 | 0.056 | 3.0 | 41.6 |
| 10 | 0.889 | 0.031 | 1.7 | 47.8 |
| 14 | 0.966 | 0.014 | 0.7 | 51.9 |
| **18** | **1.000** | 0.006 | 0.3 | 53.7 |
| 30 | 1.000 | 0.000 | 0.0 | 53.7 |
| 365 | 1.000 | 0.000 | 0.0 | 53.7 |

**Constraint checks, all measured:**

- **Ceiling in ~2-3 weeks** — 96.6 % of the ramp is travelled by day 14, 100 % at day 18 (2.6 weeks). ✓
- **No unbounded decay** — `wildness(30) == wildness(365) == 1.000`, bit-identical. ✓
- **Perceptible one-day shift** — a patch walked yesterday vs. today differs by **ΔE 10.0**, over four JNDs. ✓
- **Perceptible one-day shift at the fresh end is the *largest* step in the curve** (0.186), which is where it needs to be: the daily-walker end of the curve is where a player looks most often.

### Why this shape

Front-loaded exponential, because that is where the eye is: the change from "walked yesterday" to "walked the day before" needs to be the loudest step, and the change from "13 days" to "14 days" needs to be nearly silent — otherwise the mechanic keeps nagging at someone who has already been away two weeks, which is the guilt failure mode the concept forbids. The hard clamp at 18 days is what turns "gets worse forever" into "reaches a settled wild state and stays there".

### Rule (b), the visible floor: it is carried by **alpha**, not by colour

The floor is *not* implemented as a minimum on `wildness`. Wildness runs the full 0→1 range and drives **hue and saturation only**. Presence on the map is a separate constant:

```
fillAlpha = 0.6   for every Range cell, at every wildness   (raised from an original 0.28 — see below)
```

So a cell walked once, years ago, is exactly as *present* on the map as one walked this morning — just a different colour. Nothing ever fades toward the basemap, and a wild patch reads as a different kind of place rather than as a weaker version of a green one, which is what rule (c)'s "inviting, not sadder" needs. (The `visits`-driven ghost-trail brightening — well-worn cells nudging toward a more saturated fresh green, on top of their own wildness colour — ships in this change per FLAG 1's resolution below, not deferred; implemented as a colour-mix on top of the fill, not as a separate alpha channel.)

**Numeric revision, logged per project convention:** the original 0.28 constant was found too faint to read against real map tiles during on-device rendering-spike testing — raised to 0.6. This is a rendering-legibility fix, not a reconsideration of rule (b) itself (alpha is still flat across wildness, still never fades toward the basemap); the floor concept holds, only the value changed.

### Two rendering constraints the curve imposes

**Interpolate the ramp in Lab or Oklab, not sRGB.** Measured drift between the two:

| wildness | ΔE (Lab lerp) | ΔE (sRGB lerp) | drift |
|---|---|---|---|
| 0.19 | 10.0 | 7.3 | −2.6 |
| 0.34 | 18.3 | 14.5 | −3.8 |
| 0.50 | 26.9 | 23.6 | −3.3 |
| 0.78 | 41.6 | 39.7 | −2.0 |

A naive sRGB lerp costs ~26 % of the perceived one-day step — the exact step the curve was tuned to deliver.

**Render continuously; do not quantise into bands.** If a renderer must band, ≥ 24 bands (at 24 bands, one day of wilding crosses 4 bands at d0→d1; at 8 bands it crosses 1 and the daily step can vanish into a band boundary entirely).

---

## Decision 3 — Fresh Ground payout: `bloomMultiplier = 1 + 0.6 · B`, treats only

```
B = mean over the walk's painted cells of:
      wildness(now − lastRefreshed[c])   if c ∈ Range
      1.0                                 if c ∉ Range   (new ground counts as fully wild)

bloomMultiplier = 1                       if the walk painted < 25 cells
                = 1 + K · B               otherwise,   K = 0.6

treats = round( buddyTreatsPerWalk(L, sniffGardenLevel) · bloomMultiplier · dailyMultiplier )
```

Multiplicative and commutative with the shipped `DAILY_REWARD_MULTIPLIERS`; it slots into `awardWalkTreats` as a second factor alongside the existing per-day multiplier.

The 25-cell floor (≈ 200 m of walking) is a targeted instance of the qualifying-walk floor that `virtual-dog-companion/design.md` listed as an unimplemented follow-up. It exists so a 40 m GPS stub on new ground can't collect a ×1.60.

**New ground is weighted 1.0 — the same as a three-week-old patch, not more.** That keeps the multiplier bounded by a single clean number (1.60) and states a coherent rule: *anything you haven't touched in three weeks is as good as new.* New Ground's distinct payoff is the celebration beat and the streets counter, not a bigger multiplier. (Rejected alternative: `W_new = 1.4`, giving a ×1.84 ceiling. It buys drama at the cost of a second bound to reason about and a much better day for someone on holiday in a new city than for someone rediscovering their own neighbourhood — which inverts the concept's own emphasis.)

### Worked examples (real output)

| situation | B | multiplier | treats @ L1 | @ L20 | @ L50 |
|---|---|---|---|---|---|
| same loop, walked yesterday | 0.186 | ×1.112 | 56 | 157 | 801 |
| same loop, 3 days ago | 0.464 | ×1.278 | 64 | 180 | 920 |
| half daily loop / half 10-day-old | 0.538 | ×1.323 | 66 | 186 | 952 |
| a route last walked a week ago | 0.775 | ×1.465 | 73 | 207 | 1 055 |
| a route last walked 2 weeks ago | 0.966 | ×1.579 | 79 | 223 | 1 137 |
| a route 3+ weeks ago, or entirely new ground | 1.000 | **×1.600** | 80 | 226 | 1 152 |

Best-walk : routine-walk ratio = **1.439×**. In the currency the game already speaks, a full-bloom walk is worth **7.4 Buddy levels** of income — for one walk. That is a big, legible moment that a player can feel without being told a number, and it is nowhere near large enough to make the permanent level curve feel pointless.

### Why treats only, and not XP

`den-economy/spec.md` requires walk XP to be "computed only from that walk's own distance and enclosed territory area, with no dependency on Den building levels, treats spent, or Pack bonuses." Multiplying XP by the bloom would add a fourth input to a formula that spec deliberately fenced, and XP feeds Level which feeds income — so a bloom on XP would compound with itself over time. Treats are a flat, spendable, non-compounding sink. **Treats only.** Rejected: applying `bloomMultiplier` to the XP flat base as well; it gains a slightly louder level-up cadence and costs the one clean statement that makes the cap argument in Decision 7 work.

### K = 0.6 — confirmed by `game-master`, not a footnote-vs-Bloom tuning problem

| K | routine (d=1) | week-old | full bloom | best : routine |
|---|---|---|---|---|
| 0.3 | ×1.056 | ×1.232 | ×1.300 | 1.23× |
| 0.4 | ×1.075 | ×1.310 | ×1.400 | 1.30× |
| **0.6 (confirmed)** | **×1.112** | **×1.465** | **×1.600** | **1.44×** |
| 0.8 | ×1.149 | ×1.620 | ×1.800 | 1.57× |
| 1.0 | ×1.186 | ×1.775 | ×2.000 | 1.69× |

**Keep 0.6 — dialing it down would invert the game's own stated priority.** `anti-snowball/spec.md` says outright "the walk itself SHALL dominate outcomes; buildings tilt results, they do not decide them" — Bloom outweighing the Den's biggest building bonus (Decision 8) isn't a balance problem, it's that principle showing up in the math for the first time. K=0.3 gives 1.23×, which is "a slightly bigger number" — precisely the failure mode Fresh Ground exists to avoid; the whole point is that returning after two weeks away is *unmistakably* a different kind of walk, and 1.44× is about the floor of what reads that way.

The "Den reads as a footnote next to this" worry (Decision 8) is real but is a **presentation bug, not a tuning bug** — solved by never putting a Den percentage and the Fresh Ground multiplier on the same screen (see Decision 8's UI note). The Den and the Bloom aren't competitors, they're a pump and a drain: the Den is what you *spend* Bloom treats on, and a bigger Bloom pulls the next building into reach faster, it doesn't diminish it.

**UI rule, not just a tuning note:** the Fresh Ground beat (multiplier line + celebration weight) is only shown when `bloomMultiplier ≥ 1.25`. Below that, the walk-close screen shows the treats total with no multiplier line at all — not "×1.00," not a zero, nothing. See "The fixed-loop walker's dead zone" below for why this is required, not optional polish.

---

## Decision 4 — Manual-log refresh: **1 route/day, fixed ×1.112 payout, Range-extension structurally impossible**

Exact rules:

1. The refresh operates on the **cell set of a previously-completed tracked walk**, chosen from walk history. Not a drawn route, not a map pick.
2. **At most 1 route refresh per calendar day**, and at most **2 manual logs per calendar day** total (the second carries no route refresh). Both still count against the shipped `[1, 1, 1, 0.5, 0.25, 0.1]` per-day allowance.
3. A manual log earns a **fixed** `bloomMultiplier = 1 + K·wildness(1) = ×1.112`, regardless of which route is picked.
4. The refresh writes `lastRefreshed` only. It never writes `lastTracked` and never increments `visits`.

### Exploit probes (real output)

**Can route-picking be farmed?** This is the real exploit, and rule 3 is what closes it:

| | treats |
|---|---|
| honest 2-walk day, same loop | 105.6 |
| 2 manual logs with *route-dependent* bloom (always pick the wildest) | 160.0 = **152 % of an honest day, for zero walking** → rejected |
| 2 manual logs with the **fixed** ×1.112 | 111.2 = 105 % of an honest day → accepted |

A fixed ×1.112 is **not** the "reduced or unverified treatment" `walk-lifecycle/spec.md` forbids — it is *precisely* what an honest tracked walk of a routine loop earns. What a manual log cannot do is **choose** a better multiplier, because there is no GPS evidence of which ground was covered. That distinction needs writing into the spec delta rather than being left to a reader to infer.

**Is refreshing itself profitable?** No, and it is self-limiting by construction: refreshing a route *lowers* its wildness, which lowers every future bloom payout on it. A player optimising for treats would never refresh. The only reason to use the feature is honesty about a walk that really happened — which is the concept's stated purpose.

**Can a couch player tap their map green?** Simulated over 180 days: a tapper who never walks, owns N saved routes, and greedily refreshes the wildest one every day.

| saved routes | refresh cadence per route | mean map wildness after 180 d | reads as |
|---|---|---|---|
| 1 | every 1 d | 0.000 | fresh green map |
| 3 | every 3 d | 0.154 | fresh green map |
| 7 | every 7 d | 0.354 | mostly green |
| 12 | every 12 d | 0.493 | visibly mixed |
| 18 | every 18 d | 0.601 | visibly mixed |
| 30 | every 30 d | 0.728 | a wild map |

One refresh a day cannot outrun N routes wilding in parallel. Past ~7 saved routes the map sits above 0.5 wildness no matter how greedily the tapper picks. **A player with a real Range cannot tap their map green** — the cap binds exactly where it matters. Accepted residual: a 1-3-route player *can* keep their small map fresh from the couch. It is purely cosmetic (the payout is fixed), it costs 365 deliberate taps a year, and it destroys their own future bloom income. Nothing is gained but a greener picture of a route they claim they walked.

**Can a manual log extend the Range?** Structurally impossible. The refresh operates on the cell set of a completed *tracked* walk, so every cell it touches is already in the Range by definition. There is no code path from a manual log to a new cell — no rule to enforce, nothing to get wrong. This is why rule 1 is worded as a data constraint rather than a validation.

---

## Decision 5 — New Ground detection: dilated set difference, threshold **12 cells**

```
newGroundCells(painted, Range) =
  | { c ∈ painted : c ∉ Range  AND  no 8-neighbour of c ∈ Range } |

New Ground fires when newGroundCells ≥ 12.
```

`Range` is snapshotted at walk start and held in memory as a hash set; every check is O(1) against it, so the whole test costs one Set lookup per newly-painted cell — the same lookups the paint operation already does. Nothing here needs a backend, a server round-trip, or work proportional to walk history.

The **8-neighbour dilation** is the load-bearing part. Without it, GPS jitter on a *known* route paints fringe cells one cell outside the previous ribbon on every single pass, and New Ground fires constantly and means nothing.

### Worked examples (real output)

**False positives — the same 1.5 km loop re-walked 200× with Gaussian GPS jitter:**

| σ | mean new cells | max new cells | flagged New Ground (of 200) | |
|---|---|---|---|---|
| 4 m | 0.00 | 0 | 0 | PASS |
| 8 m | 0.03 | 2 | 0 | PASS |
| 12 m | 0.27 | 3 | 0 | PASS |
| 15 m | 1.01 | 6 | 0 | PASS |
| 20 m | 2.20 | 9 | 0 | PASS |

`game-phases` targets < 10 m urban-canyon drift; 15-20 m is deliberately far worse than spec, and even there the worst case (9) stays under the threshold (12).

**What the dilation buys** — the same test with a plain set difference:

| σ | mean raw-new cells | flagged |
|---|---|---|
| 8 m | 38.3 | **200 / 200** |
| 15 m | 28.2 | **200 / 200** |

Without dilation the feature is 100 % false positives at *better*-than-spec GPS accuracy.

**True positives — the same loop plus an out-and-back detour down an unwalked street:**

| detour | new cells | detected |
|---|---|---|
| 120 m | 3 | no |
| 200 m | 11 | no |
| **220 m** | **13** | **YES** |
| 300 m | 21 | YES |
| 500 m | 41 | YES |

| | |
|---|---|
| 450 m of a genuinely parallel street, one block (100 m) over | 41 new cells → YES |
| The same street only 60 m over (inside the paint ribbon's reach) | 35 new cells → YES |
| First-ever walk (empty Range) | 165 of 165 painted → YES |

So the trigger sits at roughly **a 220 m out-and-back down a street you've never walked**. A slightly different line down a known street is silent; a genuine new street fires the celebration.

**Range monotonicity** — 50 varied jittered walks: Range grows to 2 668 cells ("Buddy knows 242 streets") and never decreases at any step. ✓

### The headline stat

```
streetsKnown = max(1, floor(rangeCellCount / 11))
```

11 cells ≈ one ~90 m block at the measured 2.48-cell ribbon width. It is monotonic because `rangeCellCount` is, it is a count of things rather than a percentage of anything, and it has no denominator — so there is no finish line to imply. One 1.5 km walk yields **15 streets**; a year of varied walking in the simulations yields **36 to 264**. The divisor is a display convention; the noun is `game-master`'s call.

---

## Decision 6 — Rendering: Gaussian blur σ = 1 cell, iso-contour at 0.5 (render-only)

The model stays discrete; the *picture* is smoothed. Build an occupancy raster over the visible cells, blur with a Gaussian of σ = 1 cell (20 m), and extract the 0.5 iso-contour with marching squares for the Range outline. The Bloom fill is the `wildness` field over the same raster, bilinearly upsampled and blurred with the same kernel.

This is what replaces the hard-cornered shoelace polygon, and it comes with a free GPS-speck filter. Measured peak blurred values:

| shape | peak value | survives 0.5 contour |
|---|---|---|
| 1 stray cell | 0.159 | **no — filtered** |
| 2 stray cells | 0.256 | **no — filtered** |
| 2×2 stray block | 0.411 | **no — filtered** |
| 3×3 cluster | 0.779 | yes |
| ribbon 1 cell wide × 21 long | 0.399 | **no — filtered** |
| **ribbon 2 cells wide × 21 long** | **0.641** | **yes** |
| **ribbon 3 cells wide × 21 long** | **0.883** | **yes** |

The measured real-walk ribbon is 2-3 cells (Decision 1), so a genuine walk always survives while isolated jitter specks and 2×2 blobs vanish without any explicit filtering pass. Corners round at ~20 m radius.

Critically: **New Ground uses raw cells, not the blurred contour.** Model and render must not share a threshold, or a rendering tweak silently becomes a balance change.

**Bridge payload.** The current `SHOW_ALL_TERRITORIES` message grows without bound in walk count. Replace it with a single raster message: `{ origin: [ix0, iy0], w, h, wild: base64(Uint8Array), visits: base64(Uint8Array) }`, with `wild` quantised to 0-255 and a sentinel for "outside the Range". A 2.5 km × 2.5 km window is 125 × 125 cells = 15.6 KB per plane, ~21 KB base64 — one bounded `postMessage` regardless of whether the player has 10 walks or 10 000. Downsample to 2 cells/pixel at wide zooms.

---

## Decision 7 — This spends **0 pp** of the anti-snowball power budget, arithmetically

`anti-snowball/spec.md`'s Hard Power Gap Soft-Cap is written about the advantage a level-100 player holds over a level-1 player **"on equivalent walks."** Measured on an identical walk with identical cell freshness (7 days, ×1.465 for both players):

```
L1  / Sniff 1    :    73.2 treats
L100/ Sniff 100  : 15854.3 treats
ratio with bloom    = 216.4800
ratio without bloom = 216.4800
bloom's contribution to the L100-vs-L1 gap = 0.000000 pp
```

`bloomMultiplier` has no level term, no building term and no treat-balance term. On the equivalent walk the cap is defined over, it is the *same factor on both sides of the ratio* and cancels identically. This is a stronger claim than `virtual-dog-companion`'s Level argument, which needed a reclassification (income, not power); this one needs no reclassification at all — the contribution is arithmetically zero.

It also satisfies the standing invariant unchanged: **no bonus percentage is a function of Buddy's Level or of a treat balance.** `bloomMultiplier` is a function of walk geography and elapsed time only.

The ledger is untouched: Level 0, Sniff Garden 8, **Fresh Ground bloom 0**, Training Yard 6, Watch Tower 6, Spring Garden 3, Trophy Hall 3, Pack 4 = **+30 %**.

**Which direction does the bloom actually tilt?** A brand-new player's very first walk is 100 % new ground → **×1.600, the maximum the mechanic can ever pay.** A ten-year veteran walking their daily loop gets ×1.112. The bonus is largest for the player with the least history. It is anti-snowball by shape, not by cap.

---

## Decision 8 — Degeneracy checks

### Can walking *less* ever pay more? No — proved, not asserted

Income per 30 days ∝ `(1 + K·wildness(interval)) / interval`. The numerator is bounded above by 1.60; the denominator grows without bound. Measured at L1:

| interval | multiplier | walks/30 d | treats/30 d | vs daily |
|---|---|---|---|---|
| 0.5 d | ×1.059 | 60.0 | 3 176 | 1.904× |
| **1 d** | **×1.112** | **30.0** | **1 668** | **1.000×** |
| 3 d | ×1.278 | 10.0 | 639 | 0.383× |
| 7 d | ×1.465 | 4.3 | 314 | 0.188× |
| 14 d | ×1.579 | 2.1 | 169 | 0.101× |
| 30 d | ×1.600 | 1.0 | 80 | 0.048× |

Strictly decreasing in the interval, at every K in the sweep. **Waiting can never pay.**

### Route rotation is an incentive, not an exploit — and it is bounded

| distinct loops rotated | multiplier | vs always the same loop |
|---|---|---|
| 2 | ×1.203 | +8.2 % |
| 3 | ×1.278 | +15.0 % |
| 7 | ×1.465 | +31.7 % |
| 14 | ×1.579 | +42.1 % |
| 21+ | ×1.600 | **+43.9 % (ceiling)** |

Rewarding variety at the same effort is the concept's intent. The ceiling at +43.9 % is what keeps it from being worth contorting your life around.

### The shipped tiny-loop farm is not made worse

`virtual-dog-companion/design.md` measured "twenty 100 m loops" as the surviving exploit after the per-day multiplier shipped. Re-run with the bloom:

- A 100 m loop paints **12 cells** — under the 25-cell floor — so `bloomMultiplier` is forced to ×1.00.
- 20 loops in an hour: **263 treats** vs ~106 for an honest hour = **2.48×**, essentially identical to the 2.50× the same probe gives with no bloom at all.
- Moving each loop to a different spot changes nothing: still 12 cells each, still under the floor.
- Reaching 20 *qualifying* loops means walking 20 × 200 m = 4 km, which is a real walk.

Two independent properties do this work: the cell floor, and the fact that a repeated loop has zero wildness on every pass after the first.

### One-year simulation of six walker profiles (real output)

Buddy held at L1 throughout so the bloom effect is isolated from the level curve.

| profile | walks | mean B | mean mult | treats/yr | streets | New Ground events | |
|---|---|---|---|---|---|---|---|
| Daily, one fixed loop, 2/day | 730 | 0.10 | ×1.059 | 38 717 | 15 | 1 | |
| Daily, 3-loop rotation, 2/day | 730 | 0.22 | ×1.132 | 41 300 | 36 | 3 | |
| Daily, 7-loop rotation, 2/day | 730 | 0.41 | ×1.244 | 45 444 | 79 | 7 | |
| 3 weeks on / 2 weeks off | 450 | 0.19 | ×1.117 | 25 202 | 25 | 2 | 65 % of the daily walker's year |
| Explorer, new loop each week | 730 | 0.19 | ×1.113 | 40 778 | 264 | 30 | New Ground every 12 d |
| Weekend-only, 2 walks Sat+Sun | 210 | 0.40 | ×1.238 | 12 996 | 25 | 2 | 34 % of the daily walker's year |

The shape holds everywhere: **low-frequency players get a better *walk*, never a better *year*.** The lapsed-and-returning walker's return walks visibly pay more and they still finish the year at 65 % of the daily walker. Coming back is rewarded; leaving is not.

---

## Flags for the fun reviewer — both resolved

### FLAG 1 — RESOLVED: Dead zone, the fixed-loop twice-a-day walker gets almost no Bloom

This is exactly the persona `game-phases`' Phase 1 acceptance criterion tests ("5 dog owners walk twice a day for 5 days"). Measured:

- morning walk ×1.064, evening walk ×1.053, year average ×1.059
- every cell they own sits between wildness **0.088 and 0.107, forever**
- **ΔE across that entire range: 1.0 — below one JND. Invisible.**

By construction the Bloom has nothing to show a player who has nothing un-recently-walked. This is not fixable by retuning τ or K: any curve that gives a 12-hour gap a visible colour step also drives the whole map to full wildness in about two days, which breaks the 2-3 week ceiling the concept requires.

**Resolution (`game-master`): option (b) rejected outright — a multiplier that reads the same on every walk forever is wallpaper, and it devalues the real ×1.60 moment when it arrives. Option (a) accepted, but not as a deferral — `visits`/scent-depth SHIPS IN THE SAME RELEASE AS BLOOM, not deferred to Phase 2.** This persona isn't marginal, they're the Phase 1 acceptance-test cohort; shipping Bloom without their channel means the headline feature visibly does nothing for the people the phase is validated against — that's the test failing, not a minor gap.

Two independent, non-competing render axes, both in this change:
- **wildness → hue/saturation** (the Bloom — variety and return, the mechanism specified above)
- **`visits` → alpha/density** (scent-depth — loyalty; monotonic, never decreases, tuned slow enough that a year of daily walking still hasn't topped out — a confident, deepening vein on the walker's regular streets, "this street is ours")

`visits` is additive scope for this change, not a Phase 2 borrow-forward — see `proposal.md`'s phase note.

**Third mechanism, closes the gap cleanly: suppress the Fresh Ground beat below `bloomMultiplier ≥ 1.25`.** Below that threshold the walk-close screen shows the treats total with no multiplier line — not "×1.00," not a zero, nothing to notice as absent. A routine walk just shows its treats; there's no number sitting there quietly failing to move. See Decision 3's UI rule.

### FLAG 2 — RESOLVED: The bloom averages ~2× the entire Sniff Garden ladder

The Sniff Garden maxed at building level 100 is +8.00 % permanently. The bloom averages **+15.0 %** across the six simulated profiles and peaks at +60 % on a single walk.

**Resolution (`game-master`): keep K = 0.6, do not dial it down.** `anti-snowball/spec.md` states outright "the walk itself SHALL dominate outcomes; buildings tilt results, they do not decide them" — Bloom outweighing the Den's biggest permanent bonus is that principle appearing in the math for the first time, not a balance defect. K=0.3 (+7.5%) reads as "a slightly bigger number," precisely the failure mode Fresh Ground exists to avoid. The "Den as footnote" concern is real but is a presentation problem: solved by never showing a Den percentage and the Fresh Ground multiplier on the same screen (Den bonuses stay expressed as a baked-in concrete number, per `virtual-dog-companion`'s precedent, never a % line item next to the walk receipt). The Den and the Bloom are a pump and a drain, not competitors — a bigger Bloom means more treats to spend on the Den, it doesn't diminish the Den's own identity.

---

## Consequence that must be resolved in the technical split

`den-economy/spec.md` requires walk XP to include "a capped amount scaled by the polygon's enclosed area", and `xpAwardForWalk` implements it as `5 · min(area, 20 000)/1000`. **This change deletes the polygon**, so that term has no input.

Recommended replacement, keeping the same shape, the same cap and the same magnitude for a typical walk:

```
xpAwardForWalk = 20·baseMult + 15·km + 5 · min(cellsPainted · 400, 20 000) / 1000
```

A cell is 400 m², so `cellsPainted · 400` is the walk's real painted footprint in m² — a *more* honest measure of "ground covered" than a shoelace polygon that claims block interiors nobody entered. The 20 000 m² cap is unchanged, and it now binds at 50 painted cells (~450 m of walking), which is tighter than before — worth confirming against real walk data before it ships. This is a spec change to log, not a silent drift.

## Risks / Trade-offs

- **[Grid cells are blocky and the smoothing is render-side]** → Measured to work (Decision 6), but it means the visual quality of this feature lives entirely in the renderer. A lazy first implementation that draws raw cells will look like Minecraft and will be judged as the design failing. The blur is not optional polish.
- **[Every walk-count and cell-count figure assumes a 1.5 km loop at 1.4 m/s in Munich]** → A short-walker paints ~90 cells, a long-walker ~330. Shapes hold, absolute timings shift. Same posture as `personal-stats`' thresholds: retune once real walk data exists. `testing/munich-route*.gpx` exist and should be replayed through the grid before implementation.
- **[The 25-cell bloom floor is a second qualifying-walk threshold]** → `virtual-dog-companion/design.md` proposed a ≥200 m / ≥5 min qualifying floor that was never implemented. This adds a *different* floor for a *different* purpose. If the original floor ever ships, the two must be reconciled or a player will hit two unrelated "too short" rules with different cutoffs.
- **[Range is monotonic and unbounded]** → A player who moves city, or travels a lot, accumulates cells forever with no compaction. 31 416 cells / 1.8 MB is the pathological case measured; a genuine world traveller could exceed it. Needs a viewport-scoped query at minimum, and possibly an archival tier eventually. Not urgent, but it is the one number here with no ceiling.
- **[`lastTracked` is reserved for a Phase 3 mechanic that may never be built]** → 8 bytes per cell for a defence exploit that doesn't exist yet. Cheap insurance; delete it only deliberately.
- **[Deleting `calculatePolygonArea` breaks the XP area term]** → Called out above with a proposed replacement, but it is a real behaviour change to already-earned XP semantics and needs its own decision, not a footnote.
- **[K = 0.6 is a judgment call presented as a recommendation]** → The sweep is provided precisely so it can be bounced back. Every value 0.3-1.0 passes every degeneracy, cap and dead-zone check; only the *feel* differs, and that is not my call.

---

## Technical Split Addendum — decisions made converting this to `tasks.md`

Written by the reviewing architect (`senior-app-architect`), not `game-economist` or `game-master` — flagged separately so provenance stays honest: everything above this line was validated by `home-range-prototype.mjs`; everything below was not run through that script and is a plain engineering judgment call, offered in the same spirit as K=0.6 above — bounce it back if it's wrong.

### Split into two sequenced changes, not three

`proposal.md` and this file stay as the single shared design reference for both. Execution splits as:

- **`home-range`** (this change) — the grid model, storage, migration, painting, New Ground detection, the WebView rendering rewrite, and the XP area-term replacement. Ships a working Range/Bloom map with `visits`-driven ghost trails, replacing the polygon entirely. **No Fresh Ground treats bonus yet** — a walk paints and renders correctly but pays exactly what it pays today.
- **`home-range-rewards`** (sibling change, applied after this one archives) — `bloomMultiplier` wired into `awardWalkTreats`, the manual-log route-refresh feature, the New Ground/Fresh Ground celebration beats, the "Buddy knows N streets" stat surfaced somewhere in the UI, and the `anti-snowball`/`den-economy` spec deltas that record the 0pp-power-budget proof.

Rendering was *not* split into its own third change. Decision 6's rendering rewrite isn't an optional layer on top of the grid — a grid with no picture is strictly worse than what ships today (it paints something the player never sees), so there is no useful milestone that ships the model without the render. `home-range-rewards`, by contrast, layers cleanly on top of an already-visible, already-correct Range/Bloom without touching the model or the renderer again — same shape as this codebase's own precedent (`den-level-xp` shipped the Level/XP number standalone; `virtual-dog-companion` wired it to a payout later, as a separate archived change).

### Resolution: the loop-closure requirement is retired, and the two "floor" thresholds are reconciled

`proposal.md`'s "Why" section already implies this but doesn't say it outright, and neither doc resolves what it means for *rewards*, only for the map picture. Resolving it here:

- **Painting is decoupled from closure.** Any GPS-tracked walk paints the cells it touched — including a walk ended without returning near its start — matching `proposal.md`'s own framing ("a walk that doesn't close into a loop produces nothing to look at" implies it will, under Home Range, produce something).
- **The three-button model (Close Territory / End Walk / Cancel) collapses to two (Finish Walk / Cancel).** There is nothing left for "Close Territory" to mean once no polygon is computed — the loop-closure test existed only because the shoelace formula needs a closed ring, not for any anti-exploit reason. `canCloseWalk`, `MIN_CLOSURE_RADIUS_M`, and `CLOSURE_ACCURACY_MARGIN_M` in `geometry.ts` are deleted, not preserved as a dead gate.
- **Reward eligibility moves to Decision 3's existing 25-painted-cell (~200m) floor**, used for exactly one purpose today (suppressing `bloomMultiplier` on a stub walk). This change reuses it as the single qualifying-walk gate for the base treats/XP award too, on a live-tracked "Finish Walk": below 25 painted cells, the walk still saves and still paints (honest — the ground was real), but earns no treats/XP, the same way a sub-10-point walk earns nothing today. This is exactly the reconciliation this file's own Risks section flagged as needed ("If the original floor ever ships, the two must be reconciled") — there is now one floor, not two. Manual logs are unaffected; they already have their own today/yesterday window per `walk-lifecycle`.
- **Numeric-threshold change, logged per `CLAUDE.md` rule 6:** reward eligibility moves from "≥10 GPS points AND start↔end within ~100m" to "≥25 painted cells (~200m walked, any shape)." This drops the return-to-start requirement entirely — a straight-line 200m walk to a mailbox and back now qualifies where a 200m walk that ended three blocks from home did not before. That is a deliberate loosening (it was only ever an artifact of the polygon math, never a design intent), not an accidental one.
- **Sequencing note:** `gps-accuracy-aware-closure` (in-flight, 7/8 tasks done, refining `canCloseWalk`'s radius formula) is independently useful and nearly finished — let it land and archive on its own terms rather than blocking it on this change. `home-range` deletes `canCloseWalk` outright once it lands, superseding rather than building on that work; nothing in `gps-accuracy-aware-closure` needs to be undone first, since deletion doesn't conflict with an already-merged prior edit to the same function.

### Migration: existing walks replay into the grid once, at first load after this change ships

Per `proposal.md`'s open question: every stored `Walk` with a real `locations` trail (tracked walks, open or closed) is replayed through the same painting function a live walk uses, once, in a single batch on first app load after this change ships — using each walk's own `startTime` as the cell's initial `lastRefreshed`/`lastTracked` so a year-old walk seeds a year-old (fully wild) patch, not a freshly-painted one. Manual-log walks (`locations: []`) contribute nothing, per `design.md`'s Decision 4 ("manual logs can never discover"). This is a one-time, idempotent backfill (guarded by a flag in the same singleton row pattern `dogName`/`xp` already use), not a recurring job. No new treats/XP are awarded retroactively — this only seeds the Range/Bloom picture, since `home-range` ships before `home-range-rewards` wires any payout to it.

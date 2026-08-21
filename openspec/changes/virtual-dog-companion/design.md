## Context

`proposal.md` is a concept document — it deliberately carries no numbers. This design supplies them. It answers the four open questions that proposal parked for the technical split: the Level-to-payout curve, the milestone-title spacing, how the Den-copy reframe avoids becoming a mechanical dependency, and how all of it sits inside `anti-snowball`'s hard caps.

**What is already implemented** (`src/economy/balanceConfig.ts`, `formulas.ts`, `denEconomy.ts`) — every number below is anchored to these, not to the specs' prose:

- `awardWalkTreats` grants a **flat 50 treats per walk**. It has no distance term and no area term. This is load-bearing for the decisions below.
- `awardWalkXp` grants `20 + 15·km + 5·(min(area, 20 000)/1 000)` XP. A "typical" 1.5 km / 8 000 m² loop = **82.5 XP**. All walk-count figures below use that walk.
- `xpForNextLevel(L) = floor(100 · 1.13^(L−1))`, `maxLevel = 100`. Reaching L30 takes 314 typical walks; L50 takes 3 710; L100 takes 1 676 356.
- `storageCap = 100 + 100·doghouseLevel`; `passiveTreatsPerHour = bakeryLevel · 1`.
- `upgradeCost(b, n) = floor(costBase · costMult^(n−1))`, costMults 1.5 / 1.6 / 1.45.
- `softCapBonusPercent(L) = 50·(1 − e^(−L/25))` exists in `formulas.ts` but is **display-only** — `DenScreen.tsx` prints it as "+X% collectibles" and nothing consumes it. The Sniff Garden currently has no mechanical effect at all.
- Per `den-level-xp/design.md`, Level was deliberately given **zero percentage gameplay impact** in Phase 1: "this is a progress signal, not a power source."

Every formula here was validated by running `progression-prototype.mjs` in this folder (standalone Node, not wired into `src/`). All worked numbers quoted below are that script's real output.

## Goals / Non-Goals

**Goals:**
- A per-walk payout number that moves by a visible whole digit at *every* level-up, forever, with no exceptions and no special cases.
- Provable compliance with `anti-snowball`'s +30% combined-power ceiling, expressed as a ledger that later phases can spend against rather than a claim.
- Milestone-title spacing derived from the *already-implemented* 1.13 XP curve, not invented independently of it.
- Level 1 behaviour bit-identical to what ships today, so this is additive rather than a re-balance of existing saves.
- A keepsake clock that is provably outside every cap because it has no mechanical term at all.

**Non-Goals:**
- Not writing title copy, celebration wording, or the cliffhanger line's phrasing — that is the `game-master`'s lane; this document only says *when* each fires.
- Not building the Phase 4 buildings whose cap budget is reserved below. The ledger reserves space; it does not specify those buildings.
- Not implementing anything. This document is the numbers; wiring them into `src/economy/` is a separate change.
- Not re-deriving the XP-award formula (`20 + 15·km + 5·area/1000`) — it stays exactly as coded.

## Decisions

### The displayed number is the walk's **full treat payout**, not a level-only sub-bonus

The proposal left this open. The implemented code settles it: `awardWalkTreats` is already flat-per-walk with no distance or area term, so the total payout is *already* stable walk to walk. That means the "full total" option carries none of its usual downside — "Buddy brings home 118 treats a walk. Next level: 124" is an exact promise, not a forecast, because the walk's own size feeds XP (the level clock) and never treats (the payout clock). The two clocks the concept wanted stay genuinely separate: **walk quality → XP → Level; Level → treats.**

Rejected: showing a level-only bonus term separate from a base. It would have required inventing a split that does not exist in the code, and the smaller number would have made the whole-digit constraint harder for no benefit.

### `buddyPayout(L) = round(50 · 1.055^(L−1))` — the displayed per-walk treats

`50` is exactly today's `BALANCE.treatsPerWalk`, so a Level-1 player's experience is unchanged. `1.055` is a constant **+5.5 % per level**.

| Level | treats/walk | step | step % | walks to get there | ~elapsed @2/day |
|---|---|---|---|---|---|
| 1 | 50 | — | — | 0 | day one |
| 2 | 53 | +3 | 6.0 % | 2 | 1 day |
| 10 | 81 | +4 | 5.2 % | 19 | 10 days |
| 20 | 138 | +7 | 5.3 % | 86 | 6 weeks |
| 30 | 236 | +12 | 5.4 % | 314 | 5 months |
| 50 | 689 | +36 | 5.5 % | 3 710 | 5 years |
| 100 | 10 022 | +522 | 5.5 % | 1 676 356 | never |

The fun-floor is satisfied **by construction, not by tuning**: the raw step is `0.055 · payout ≥ 2.75` at every level, so after rounding the integer step is provably ≥ +2 and measured at +3 minimum across all 99 level-ups. Zero levels pass with the number unchanged. The step is also a *constant 5.5 % relative*, so it never crawls at the high end the way an additive curve would.

### Buddy's Level contributes **0 %** to the anti-snowball power cap — because the displayed number is income, not power

This is the resolution of the tension the concept handed over, and it needs stating plainly, because under the strict reading the constraint really is impossible. Proof, from the prototype:

- The cap allows a total multiplier of 1.30 across 99 level-ups. The largest *uniform* relative step compatible with that is `1.30^(1/99) − 1 = 0.265 % per level`.
- A 1 %/level curve reaches 2.7× at L100 — 106 % over cap. 2 %/level reaches 7.1×. 5 %/level reaches 125×.
- To get even a bare +1 whole digit at all 99 level-ups out of a 30 % budget, the Level-1 value must be ≥ `99 / 0.30 = 330`, and each step is then worth 0.30 % — a digit that technically changes but does not read as a jump.

So: **a capped power quantity cannot be the displayed number.** The way out is that treats are not a power quantity. Treats are a personal-progression currency whose only sink is a hard-capped building ladder with exponential costs; more treats buys you the *same* ceiling sooner, never a higher one. Income scales time-to-cap; it does not scale the cap. Level therefore takes 0 pp of the 30 pp budget, which is also exactly what `den-level-xp/design.md` already decided ("not a power source") — this change keeps that promise rather than breaking it.

The invariant that keeps this true forever, and which must survive into implementation:

> **No bonus percentage may ever be a function of Buddy's Level or of a player's treat balance.** Every capped bonus is a function of building level, Pack, or badges only.

### This deliberately reopens `den-level-xp`'s "zero percentage gameplay impact" Non-Goal — logged, not silently crossed

`den-level-xp/design.md` (Context, above) chose, as a matter of Phase 1 philosophy and not just cap arithmetic, that "Level was deliberately given zero percentage-based gameplay impact in Phase 1: this is a progress signal, not a power source" — and its spec delta's Requirement "Phase 1 Level Payoff Is Non-Percentage and Visually Secondary" says leveling up "SHALL NOT grant any percentage bonus to treats, XP, collectibles, or any other rate, reserving percentage-based Den Level bonuses for the Phase 4 buildings gated by it." `buddyPayout(L)` is exactly the kind of Level-derived rate that Requirement was written to forbid in Phase 1, on its literal text — the "0% of the anti-snowball power cap" argument above answers a *different* question (is this a capped power source) than the one `den-level-xp` actually gated (does Level affect any rate at all, capped or not).

This is a conscious override of that Non-Goal, not an oversight, following the same precedent `den-level-xp` itself set when it reopened `post-walk-celebration`'s "No dog XP/level display" deferral: named explicitly here rather than routed around. The distinction that makes it defensible rather than a quiet reversal: `den-level-xp` reserved *percentage-based* Level bonuses for Phase 4 specifically to keep Level out of the anti-snowball power budget — and `buddyPayout(L)` still keeps Level at 0% of that budget, by being income (a currency-earn-rate with no bonus percentage anywhere near it) rather than a bonus percentage applied to a capped quantity. The letter of `den-level-xp`'s Requirement needs updating (see the specs delta in this change), but the spirit it was actually protecting — Level never buying capped power early — holds.

The `game-phases/spec.md` Phase 1 paragraph (`den-level-xp`'s pending delta, not yet merged) that describes Level as "standalone, non-percentage... tracking" needs the same update, folded into this change's specs delta once `den-level-xp` is archived — see `tasks.md`'s sequencing note.

### Per-walk power budget ledger — sums to exactly +30 %

| Source | Budget | Phase |
|---|---|---|
| Buddy's Level | **+0 %** | — (income only) |
| Sniff Garden | +8 % | Phase 1 |
| Training Yard | +6 % | Phase 4 (reserved) |
| Watch Tower | +6 % | Phase 4 (reserved) |
| Spring Garden | +3 % | Phase 4 (reserved) |
| Trophy Hall badges | +3 % | Phase 4 (reserved) |
| Pack | +4 % | Phase 4 (reserved) |
| **Total** | **+30 %** | |

Realised L100-veteran vs L1-newcomer advantage on an equivalent walk: `1.300 / 1.0032 − 1 = **+29.59 %**` — under cap, with the margin coming from the fact that a Level-1 player already owns a Sniff Garden at level 1. Summing bonuses that act on different axes (treats vs XP vs defense) is deliberately conservative.

### `sniffGardenPct(bl) = 8 · (1 − e^(−bl/25)) / (1 − e^(−4))`, applied to treats

Reuses the `curveRate = 25` shape already coded in `softCapBonusPercent`, renormalised so building level 100 lands on exactly the 8 pp budget. Worked: bl 1 → 0.32 %, bl 10 → 2.69 %, bl 25 → 5.15 %, bl 50 → 7.05 %, bl 100 → 8.00 %. The marginal gain per level is 0.0450 pp at level 50 and 0.0432 pp at level 51, satisfying `den-economy`'s "diminishing above 50" scenario as a measured fact.

**The Sniff Garden's effect changes from "+X % collectibles" to "+X % treats found on a walk."** `den-economy/spec.md` specifies collectibles; no collectible currency exists, and the keepsakes below must stay mechanically inert, so there is nothing for a collectible percentage to attach to. Treats are the only per-walk quantity that exists. This is a spec change to log, not a silent drift.

This also delivers the concept's "the Den helps Buddy" reframe with real math behind the copy — "the Sniff Garden means Buddy comes home with 124 a walk instead of 118" is literally true — while creating **no dependency in the other direction**: Buddy's level is a pure function of XP, and no building appears anywhere in `buddyPayout`.

### Storage and passive income become denominated in walks, not in absolute treats

Two formulas break the moment income grows, and one of them is **already broken today**.

`storageCap(doghouseLevel, buddyLevel) = max( buddyPayout(L) · 4 · 1.5^(dh−1) , 1.25 · cheapest available upgrade )`

- `50 · 4 = 200`, exactly today's `100 + 100·1`. Doghouse levels 1 and 2 are numerically identical to what ships.
- `1.5` is the Doghouse's own `costMult`, so capacity and cost grow at the same rate instead of diverging linearly-vs-geometrically.
- The `1.25 × cheapest upgrade` floor is a **never-softlock guarantee**.

Why it matters: the shipped formula hard-stalls the Den. At doghouse level 10 today, storage is 1 100 while the cheapest available upgrade is 2 306 — the player can never save enough, and the Den is permanently finished. The 3-year counterfactual simulation confirms it: with today's numbers a player reaches buildings 8/6/8 and then stops forever, needing 977 treats against a 900 ceiling. With the fix, the same player reaches 24/20/25 and buys 66 upgrades. **This is a live balance defect independent of this feature**, surfaced by the prototype.

`passiveTreatsPerHour(bakeryLevel, L) = bakeryLevel · 1 · buddyPayout(L)/50` — same yardstick, identical to today at Level 1 (bl 5 → 5/hr). Without it the Bakery becomes irrelevant by roughly Level 25.

Building **costs deliberately do not scale.** Costs are the sink that absorbs income growth; scaling both would make the whole curve a no-op.

### Milestone titles at levels **2, 4, 7, 11, 16, 22, 29, 37, then every 8 thereafter**

Generated by `gap(k) = min(k, 8)` starting at level 2 — not a fixed table, so there is no final title and the ladder continues indefinitely, satisfying the "no final stage" guardrail. Validated against the real 1.13 curve:

| # | Level | walks | gap since previous | ~elapsed @2/day |
|---|---|---|---|---|
| 1 | 2 | 2 | 2 | 1 day |
| 2 | 4 | 5 | 3 | 3 days |
| 3 | 7 | 11 | 6 | 6 days |
| 4 | 11 | 23 | 12 | 12 days |
| 5 | 16 | 49 | 26 | 25 days |
| 6 | 22 | 113 | 64 | 2 months |
| 7 | 29 | 277 | 164 | 4.6 months |
| 8 | 37 | 750 | 473 | 12.5 months |
| 9 | 45 | 2 010 | 1 260 | 2.8 years |

The gap caps at 8 levels rather than growing forever (a pure triangular ladder would have kept widening on top of an already-geometric XP curve). **Ship authored copy for the first 8 titles**; anything past #8 is beyond a year of daily walking and past the horizon of Phase 1. Titles are the deliberately sparse clock — the payout clock underneath them fires far more often, which is what makes the widening gaps survivable.

### Cliffhanger fires at walk-close when `xpToNextLevel ≤ (trailing 5-walk average XP)` **and** the next level is a milestone level

Uses the player's own recent walks as the yardstick rather than a fixed constant, so a short-walker and a long-walker both get it exactly when it is true for them. Falls back to 82.5 XP before 5 walks exist. Once per level, never a notification.

Measured frequency: **8 fires over 2 000 walks (~2.7 years) — one per 250 walks.** Structurally un-spammable, because it can only fire on the 8 milestone levels reachable in that span.

### Keepsakes: `p = 0.18` per qualifying walk, hard pity at 12 walks, 2-walk cooldown after a find

Flat rate. Not modified by Level, buildings, Pack, or anything else — which is what puts keepsakes provably outside every cap: their mechanical term is zero and their *rate* is identical for a Level-1 and a Level-100 player, so they cannot be a snowball axis even in principle. Milestones widen the *pool* a keepsake is drawn from; they never change `p` and never grant one directly.

Measured over 200 000 simulated walks: mean gap **6.7 walks**, median 6, p90 12, worst case 12 (the pity timer, by construction). At 2 walks/day that is one every ~3.4 days with a worst case of 6 days — short enough that there is no stretch a player would give up over, long enough to stay unscheduled.

### Drop `treatsPerLevelUp: 25` — confirmed by `game-master`, reconciled against real tester data

Today a level-up pays a one-off 25 treats. Under this design the level-up already pays out — permanently, as a rate. `game-master`'s first pass predicted the flat 25 would be the *louder* number at low levels and drown out the rate; asked directly, the actual tester said his eye goes to the **Level number**, not the treats — he didn't register the flat bonus either way. That overturns the original premise (competing numbers) but not the conclusion: since the flat number isn't earning its place, drop it. One event, one reward: fold the rate into the Level headline itself — "Buddy reached Level 8 — he brings home 53 treats a walk now, up from 50," one bold number, no second treats figure in the box. A derived-from-the-rate one-time "first walk at the new rate" beat is optional polish, not required.

### The XP curve's `xpGrowth = 1.13` should come down to `1.10` — confirmed by `game-master`, do now not later

`1.13` was chosen in `den-level-xp` when a level-up paid out nothing, so cadence did not matter. It does now: the gap between level-ups *is* the reward cadence.

| xpGrowth | L5→6 | L10→11 | L20→21 | L30→31 | L40→41 | L50→51 | walks to L30 | walks to L50 |
|---|---|---|---|---|---|---|---|---|
| **1.13** (coded) | 2 | 4 | 13 | 42 | 142 | 484 | 314 (5 mo) | 3 710 (5.1 y) |
| 1.11 | 2 | 3 | 8 | 25 | 71 | 201 | 217 (4 mo) | 1 822 (2.5 y) |
| **1.10** (proposed) | 2 | 3 | 8 | 19 | 50 | 129 | 181 (3 mo) | 1 282 (21 mo) |
| 1.08 | 2 | 2 | 5 | 11 | 24 | 53 | 127 (2 mo) | 643 (11 mo) |

At 1.13 a one-year player waits **142 walks (over two months) between payouts**. At 1.10 they wait 50 (under a month), the first two weeks are essentially unchanged (L10 at 17 walks vs 19), and L100 stays unreachable. 1.08 was rejected as too fast — it puts L50 inside the first year and burns the horizon. Confirmed against the real tester: asked whether the XP bar currently visibly moves after a walk, the answer was yes — the dead zone this retune prevents hasn't been felt yet, which is exactly why `game-master` says to retune *now*: the first two weeks are identical under either constant, so this is the one moment a retune is free. Waiting until the dead zone is actually felt means yanking an already-experienced number sideways instead. One thing the implementation needs to handle: recomputing existing XP under the shallower curve produces a free multi-level jump for anyone already leveled — that must land as an explicit moment ("Buddy caught up — Level 14"), never a silent score change.

### Degenerate-exploit mitigations: a per-day full-value allowance and a qualifying-walk floor

The prototype found two real exploits, both of which **exist today** and both of which this feature makes materially worse by giving XP a treat value.

| Strategy | per 60 min of player time | vs. an honest walk |
|---|---|---|
| Two typical walks | 165 XP / 100 treats | 1.0× |
| One long walk | 140 XP / 50 treats | 0.8× XP, 0.5× treats |
| Twenty 100 m loops | 450 XP / 1 000 treats | **2.7× XP, 10× treats** |
| Tapping "Log a walk we missed" | 6 000 XP / 15 000 treats | **36× XP, 150× treats** |

The manual-log path is the severe one: `App.tsx`'s `logMissedWalk` has a today/yesterday date window but **no rate limit**, and it routes into the same `awardWalkRewards` as a real walk, so each tap is a free 50 treats + 20 XP. Three mitigations, all of which leave an honest owner untouched:

1. **Per-day full-value allowance** `[1, 1, 1, 0.5, 0.25, 0.1]` — walks 1–3 of a calendar day pay 100 %, walk 4 pays 50 %, walk 5 pays 25 %, walk 6+ pays 10 %. Applied to the treat payout and to the XP *flat base* (20) only; the distance and area XP terms are untouched, so a genuinely long fourth walk still earns properly. Effect: 50 tiny loops in a day drops from **25× an honest day to 4.1×**, asymptotically bounded. A three-walks-a-day owner sees multiplier 1.0 on every walk.
2. **Qualifying-walk floor** — a walk earns the flat components only at ≥ 200 m cumulative distance and ≥ 5 minutes elapsed, on top of the existing ≥10-points / <20 m closure rule in `geometry.ts`.
3. **Manual logs count against the same daily allowance and are limited to 2 per day.**

This is a distinct concern from the Buddy curve and should be its own change; it is recorded here because this feature is what makes it urgent. *The framing of (1) — a generosity ceiling, never a penalty, and never guilt copy — is `game-master`'s call.*

## Risks / Trade-offs

- **[Uncapped income is a deliberate reinterpretation of where the cap bites]** → Mitigated by the stated invariant (no bonus percentage may read Level or treats) plus the fact that every treat sink is a bounded-bonus, exponentially-priced building. If a future change ever attaches a percentage to income, the cap breaks silently — that invariant is the thing to guard in review.
- **[`anti-snowball/spec.md` names "level" as a power source; this design gives it 0 %]** → Compliant (0 ≤ 30) and consistent with `den-level-xp`, but the spec's wording should be updated so a future reader does not "fix" it by adding level power back.
- **[Den upgrade cadence still stretches badly late]** → Simulated: 1.7 walks per upgrade at week 1, 13 at month 1, 33 at month 2, 107 at month 6, 976 by year 3. This is inherent to *any* geometric cost curve and is far better than today's (which stalls to infinity at ~day 100), but 976 walks is a real year-3 dead zone in the Den specifically. Out of scope here; flagged for a Den-cost retune with its own numbers.
- **[Storage banks get very large at high Doghouse levels]** → 1.5^(dh−1) growth means a year-3 player banks millions. Cosmetically odd, and it makes `den-economy`'s treat-overflow notification rare (0 overflows in the 3-year sim). Arguably good — being away stops being punished — but it does quietly soften a spec'd re-engagement hook.
- **[Two archived decisions are being retuned: `treatsPerLevelUp` and `xpGrowth`]** → Both logged above with the numbers that motivate them, both reviewed by `game-master` and confirmed against real tester data (not changed silently) — see the "confirmed" notes in each Decision above.
- **[Every walk-count figure assumes a 1.5 km / 8 000 m² walk twice a day]** → A short-walker (0.8 km / 3 000 m², 47 XP) progresses at ~57 % of these rates, a long-walker (3 km / 15 000 m², 140 XP) at ~170 %. Shapes hold; absolute timings shift. Retune once real walk data exists, same posture as `personal-stats`' thresholds.
- **[`maxLevel = 100` is a hard stop, and the guardrails forbid a final stage]** → Reaching it needs 1 676 356 typical walks (~2 300 years), so it is a horizon in practice. Worth removing anyway if it is ever cheap to do.

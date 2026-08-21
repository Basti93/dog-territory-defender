## 0. Sequencing (do first, before anything else in this list)

- [ ] 0.1 Finish and archive `openspec/changes/den-level-xp/` (complete its outstanding task 6.2 manual verification, then `/opsx:archive`) before applying this change's own specs delta. Both changes modify `den-economy/spec.md` and `game-phases/spec.md`; this change's delta is written *against the text `den-level-xp` will merge in* (see notes atop this change's `specs/den-economy/spec.md` and `specs/game-phases/spec.md`), so applying out of order will leave those deltas targeting requirement text that doesn't exist yet. `den-level-xp`'s own spec delta had a pre-existing `openspec validate` error (a MODIFIED `game-phases` requirement was dropping an existing scenario) — already fixed as part of authoring this change, so `openspec validate den-level-xp --type change` passes now; re-run it if `den-level-xp` is touched again before archiving.
- [ ] 0.2 Re-read `design.md`'s "This deliberately reopens `den-level-xp`'s 'zero percentage gameplay impact' Non-Goal" decision before writing any economy code — it's the reason `buddyPayout(L)` is allowed to touch treats at all in Phase 1, and the invariant it states (no capped bonus percentage may ever read Buddy's Level or treat balance) is the thing every later task here must not violate.

## 1. Dog naming

- [ ] 1.1 Add a one-time text input for the dog's name, shown once at first launch (or first time the Den/celebration would otherwise need a name and none is set). No re-prompt once set; editing later is optional polish, not required.
- [ ] 1.2 Persist the name so it survives app restart. The Den-economy singleton row (`DenEconomyState` / `sqliteDenEconomyRepository.ts`) already carries two precedent columns added this way (`xp`, `level` via `ALTER TABLE` + duplicate-column try/catch) and is the natural home; a separate small repository is acceptable if it better separates "identity" from "economy state" — implementer's call, either way needs the same migration-safety treatment as the `xp`/`level` precedent (existing on-device rows must not break).
- [ ] 1.3 Until the name is set, every display location in tasks 2-5 below SHALL fall back to a generic "Your dog" / "your pup" phrasing rather than block on the input or show a placeholder like "null" or "undefined".

## 2. Level display reframe — "Buddy — Level N," not "Den Level N"

- [ ] 2.1 Update all four existing Level display locations to read as `"{dogName} — Level {N}"` (or the task-1.3 fallback): `App.tsx`'s main-screen stats row (`Lv.` readout), `DenScreen.tsx`'s level bar header, `StatsScreen.tsx`'s "Level" stat card, `CelebrationScreen.tsx`'s level-up notice. Same underlying `state.level` value everywhere — this is a copy/framing change only, not a new data source.
- [ ] 2.2 Confirm no leftover "Den Level" wording remains in player-facing copy in any of the four locations (internal code/variable names like `DenEconomyState.level` do not need renaming).

## 3. `buddyPayout(L)` wired into the actual per-walk treat award

- [ ] 3.1 Add `buddyPayout(level)` to `src/economy/formulas.ts` per `design.md`'s decision (`round(50 * 1.055^(L-1))`), with `50` and `1.055` sourced from new `BALANCE.leveling` constants (matching the existing pattern of every other tunable living in `balanceConfig.ts`, not hardcoded in the formula).
- [ ] 3.2 Add `sniffGardenPct(sniffGardenLevel)` to `formulas.ts` per `design.md`'s decision (reuses the `curveRate = 25` shape, renormalized to an 8pp budget at building level 100) — a new function, not a change to the existing `softCapBonusPercent` (which stays as-is; nothing else consumes it after task 6 below removes its DenScreen usage).
- [ ] 3.3 Introduce a single function that combines `buddyPayout(L)` and `sniffGardenPct` into the one treats-per-walk figure that is both displayed (task 4) and actually awarded (before the existing per-day diminishing-returns multiplier from `walk-reward-exploit-fix` is applied) — there must be exactly one such function, consumed by both the UI and the award path. Naming/placement (`formulas.ts` vs `denEconomy.ts`) left to the implementer.
- [ ] 3.4 Fix the existing duplication this change would otherwise make worse: `walkRewards.ts` currently recomputes `treatsAwarded` locally (`Math.round(BALANCE.treatsPerWalk * multiplier)`) independently of `denEconomy.ts`'s `awardWalkTreats`, which computes the same thing again internally to mutate `state.treats`. Change `awardWalkTreats` to return the amount it actually awarded (mirroring `awardWalkXp`'s existing `{ state, leveledUp }` return shape, e.g. `{ state, treatsAwarded }`), and have `walkRewards.ts` use that returned amount instead of recomputing it — so the treats formula exists in exactly one place and the displayed/logged/stats-recorded figure can never drift from the amount actually credited.
- [ ] 3.5 Update `passiveTreatsPerHour(bakeryLevel, level)` per `design.md`'s decision (`bakeryLevel * 1 * buddyPayout(level)/50`) so the Bakery doesn't go stale relative to the new payout curve. Update its one call site (`denEconomy.ts`'s `applyPassiveAccrual`) and its one display site (`DenScreen.tsx`'s `effectText`).
- [ ] 3.6 Confirm Level-1 behavior is bit-identical to what ships today (per `design.md`'s Goal): `buddyPayout(1) === BALANCE.treatsPerWalk` today's flat 50, `sniffGardenPct` at building level 1 is the same tiny value the current soft-cap curve already produces at level 1.

## 4. Displaying the per-walk rate concretely

- [ ] 4.1 `DenScreen.tsx`: replace the Sniff Garden card's "+X% collectibles" effect text (task 6 covers the mechanical/copy reframe) and add a visible "Buddy brings home N treats a walk" line near the Level bar, using the task-3.3 combined figure.
- [ ] 4.2 Same figure surfaces anywhere else a "what does leveling get me" question would naturally arise — at minimum the celebration screen's level-up beat (task 5). Do not introduce a second, differently-computed treats-per-walk number anywhere (task 3.4's de-duplication is what prevents this).

## 5. Level-up celebration beat

- [ ] 5.1 `CelebrationScreen.tsx`: when a level-up occurred, show the old and new per-walk treats rate together, e.g. "Buddy reached Level 8 — he's bringing home 53 treats a walk now, up from 50." One bold number, no second/competing treats figure in the box, per `design.md`'s "Drop `treatsPerLevelUp`" decision.
- [ ] 5.2 Remove the flat one-time `treatsPerLevelUp` bonus (`BALANCE.leveling.treatsPerLevelUp`, and its use in `denEconomy.ts`'s `awardWalkXp`) — the level-up now pays out permanently as a rate instead of a one-off flat amount, per `design.md`. Update/remove the `formulas.test.ts`/`denEconomy.test.ts` coverage that currently asserts the flat bonus.
- [ ] 5.3 Add milestone titles at the front-loaded, ever-widening level sequence from `design.md` (2, 4, 7, 11, 16, 22, 29, 37, then every 8 thereafter — `gap(k) = min(k, 8)` starting at level 2). Get game-master-authored copy for the first 8 titles before shipping (do not invent placeholder title copy) — ship the formula for levels beyond #8 even without authored copy yet, so the ladder is never visibly "finished."
- [ ] 5.4 Add the one-away cliffhanger line, firing at walk-close when `xpToNextLevel <= trailing 5-walk average XP` (falling back to 82.5 XP before 5 walks exist) **and** the next level is a milestone level. Once per level, never a push notification (in-app celebration copy only). Get game-master-authored copy for the exact phrasing before shipping.
- [ ] 5.5 Confirm the level-up beat and any cliffhanger line stay visually at or below the weight of the existing "Territory claimed!" headline and treats-earned line, per the existing `den-level-xp` precedent and `visual-design`'s Success Criteria — this feature does not get to become the peak-joy moment.

## 6. Sniff Garden reframe — mechanical change + copy

- [ ] 6.1 Change the Sniff Garden's actual mechanical effect from the currently-unused, display-only `softCapBonusPercent` ("+X% collectibles," which nothing consumes today) to `sniffGardenPct` (task 3.2) applied to the walk's treats payout, per `design.md`. This is a real behavior change to the building, not just a copy edit — log it as such (already captured in this change's `specs/den-economy/spec.md`).
- [ ] 6.2 Update `DenScreen.tsx`'s Sniff Garden card copy to read as helping Buddy, not an abstract base stat — e.g. "the Sniff Garden means Buddy comes home with N more a walk" — concrete numbers, not just the percentage. Exact wording is a `game-master` copy question like the others above.
- [ ] 6.3 Confirm no other code path still reads `softCapBonusPercent` as if it affects anything mechanically (it becomes purely unused after this — fine to leave as a dead export if some other display still wants a bare percentage, but nothing should assume it gates or scales real treats).

## 7. `xpGrowth` retune: 1.13 → 1.10, with an explicit "Buddy caught up" moment

- [ ] 7.1 Change `BALANCE.leveling.xpGrowth` from `1.13` to `1.10`, per `design.md`'s decision (cadence is now the reward cadence, not just a progress-bar speed).
- [ ] 7.2 Handle the recompute correctly for existing players: `DenEconomyState.level` is a value cached at award-time (set inside `awardWalkXp`), not recomputed on every read — so an existing save's stored `level` will lag behind what `levelForXp(state.xp)` now justifies under the shallower curve until it's recomputed. Implement an explicit, one-time reconciliation (on next app load or next walk close — implementer's choice) that: if `levelForXp(state.xp)` under the new curve is higher than the currently-stored `level`, surfaces a distinct "Buddy caught up — Level X" moment (not the normal per-walk level-up beat, since no walk earned this jump) before or as it persists the corrected level. This must never be a silent score change, per `design.md`'s explicit call-out.
- [ ] 7.3 Get game-master-authored copy for the "Buddy caught up" moment — it reads differently from a normal level-up (nothing was just walked for) and should not claim a treats-rate "up from X" framing that implies today's walk caused it.
- [ ] 7.4 Add/update `formulas.test.ts` coverage for the new `xpGrowth` constant's effect on `xpForNextLevel`/`cumulativeXpForLevel`/`levelForXp`, and a `denEconomy.test.ts`/integration-level test for the catch-up reconciliation path (stored `level` lower than `levelForXp(xp)` under the new curve triggers the distinct catch-up result, not a silent field update).

## 8. Storage-cap softlock fix + walks-denominated passive income

- [ ] 8.1 Change `storageCap` to `storageCap(doghouseLevel, buddyLevel) = max(buddyPayout(buddyLevel) * 4 * 1.5^(doghouseLevel-1), 1.25 * cheapest currently-available upgrade cost across all buildings)`, per `design.md`. This is a real live-bug fix (today's flat formula permanently softlocks the Den around doghouse level 10, per `design.md`'s counterfactual sim), not just new-feature scope-creep — worth calling out as such if anyone questions why a "leveling" change touches storage math.
- [ ] 8.2 The "cheapest available upgrade" term needs all three building levels, not just `doghouseLevel` — `storageCap`'s signature necessarily grows to take more than it does today (exact shape, e.g. taking the full `DenEconomyState` vs. three level numbers, left to the implementer). Update every call site: `denEconomy.ts`'s `awardWalkTreats`/`applyPassiveAccrual`/`awardWalkXp`, `DenScreen.tsx` (three call sites), and `notifications/notificationDecision.ts`'s `isOverflowing` (the overflow-notification threshold must track the same corrected cap, or the earned-trigger notification in `walk-start-notifications` silently goes stale/wrong).
- [ ] 8.3 Confirm Level-1/doghouse-level-1/2 parity with what ships today (`design.md`'s Edge Behaviour numbers: dh=1 → 200, dh=2 → 300, identical to current).
- [ ] 8.4 Update/add `formulas.test.ts` coverage: storage cap at Level 1 matches today's values; storage cap at a high doghouse level never falls below `1.25 * cheapest available upgrade` (the never-softlock guarantee itself, not just a snapshot value).

## 9. Keepsakes — explicitly out of scope for this slice

- [ ] 9.1 Do not build keepsakes (the `p = 0.18` per-walk find chance, pity timer, cooldown) in this change. `proposal.md`'s own "Deferred, not deleted" section defers the entire souvenir/keepsake/yard layer as "art-dependent and secondary... revisit only after the numbers-only version ships and if it needs more texture" — no UI surface, copy, or persisted-state shape has been designed for it (the proposal explicitly punted exactly this). `design.md`'s keepsake math is a pre-validation (proves it's compatible with the caps whenever it is built), not a build order for this change. Leave `design.md`'s keepsake decision as the reference for whoever eventually picks this up.

## 10. Automated coverage

- [ ] 10.1 Unit-test the new pure formulas (`buddyPayout`, `sniffGardenPct`, the combined per-walk-treats function, the corrected `storageCap`, `passiveTreatsPerHour`) in `formulas.test.ts` against the worked values in `design.md`'s tables (e.g. `buddyPayout(2) === 53`, `buddyPayout(100) === 10022`).
- [ ] 10.2 Extend `denEconomy.test.ts`/`walkRewards.test.ts` to cover: a level-up changes the awarded treats amount on the *next* walk (not the walk that triggered it, since the rate is looked up at award time from the post-award level — confirm which the implementer intends and test that behavior explicitly, since `design.md` doesn't pin this down); the milestone-title and cliffhanger trigger conditions; the xpGrowth catch-up reconciliation path (task 7.4); the storage-cap never-softlock guarantee under a simulated multi-upgrade sequence.
- [ ] 10.3 Do not attempt to automate on-device UI copy/animation review (level-up beat styling, milestone title display) — covered by manual verification below instead, matching this project's existing `walk-start-notifications` precedent.

## 11. Manual on-device verification

- [ ] 11.1 Fresh install: name the dog, complete several walks, confirm the per-walk treats rate visibly increases at each level-up in all four display locations, and the celebration beat shows old→new correctly.
- [ ] 11.2 Confirm an existing on-device save (predating this change) still loads correctly — migration safety for both the dog-name storage addition (task 1.2) and, separately, does not silently jump the Level number without the task-7.2 "Buddy caught up" moment firing once, on the appropriate trigger.
- [ ] 11.3 Force a Sniff Garden upgrade and confirm the Den screen's "Buddy comes home with N more a walk" copy updates correctly and matches the actual treats awarded on the next walk.
- [ ] 11.4 Force a milestone level-up and confirm the title copy and (if applicable) the cliffhanger line from the walk before it both appear correctly and don't upstage the "Territory claimed!" headline.
- [ ] 11.5 Confirm the Den-economy overflow notification (`walk-start-notifications`) still fires correctly against the corrected `storageCap` — force an overflow at a non-trivial doghouse/buddy level, not just level 1, since that's exactly the case the old flat formula got wrong.

## 12. Wrap-up

- [ ] 12.1 Apply this change's specs delta (`specs/den-economy/spec.md`, `specs/anti-snowball/spec.md`, `specs/game-phases/spec.md`) via `/opsx:apply` — after task 0.1's sequencing, not before. Do not hand-edit `openspec/specs/` directly.
- [ ] 12.2 Update `README.md`'s "What works" list / State Flow section to mention Buddy's Level now sets the per-walk treats rate (mirroring how `den-level-xp` updated the same section for Level/XP's introduction).
- [ ] 12.3 Confirm `.openspec.yaml` in this change directory does not need `skip_specs: true` — it currently has no `skip_specs` key, which already defaults to requiring specs (matching the intent here); no change needed unless the applied delta review disagrees.

## Specs-delta recommendation

Do not use `skip_specs: true`. This change alters two existing, load-bearing spec requirements with genuine behavioral consequences: `den-economy`'s Sniff Garden effect (collectibles → treats, a real mechanical change) and the anti-snowball/`den-level-xp` boundary around whether Level may affect any rate in Phase 1 (see `design.md`'s "deliberately reopens..." decision). Both need to be real, reviewable spec text, not silent drift.

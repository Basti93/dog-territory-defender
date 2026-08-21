## 0. Sequencing

- [ ] 0.1 Confirm `home-range` has archived before starting: this change assumes `HomeRangeRepository`, `paintedCells`/`wildness`/`newGroundCells` (`src/utils/grid.ts`), and the reward-eligibility floor (`walk-lifecycle`'s 25-painted-cell gate) already exist and are wired into a live walk close. Nothing here should need to touch `mapHTML.ts`/`MapView.tsx` again.

## 1. Fresh Ground payout

- [ ] 1.1 `src/economy/formulas.ts` (or `denEconomy.ts`, matching wherever `home-range`'s grid helpers ended up): `bloomMultiplier(paintedCells: Set<CellId>, range: Set<CellId>, now: number)` per `design.md` Decision 3 — `B` = mean wildness over the walk's painted cells (cells outside the Range count as `wildness = 1.0`), `bloomMultiplier = 1` below 25 painted cells, else `1 + 0.6 · B`. `K = 0.6` as a `BALANCE` constant (not hardcoded), matching this project's existing tunable-constant pattern.
- [ ] 1.2 `denEconomy.ts`'s `awardWalkTreats` gains `bloomMultiplier` as a second multiplicative factor alongside the existing per-day `multiplier` (per `design.md`: "multiplicative and commutative with the shipped `DAILY_REWARD_MULTIPLIERS`"). Update its one call site in `walkRewards.ts`'s `awardWalkRewards`, which now needs the walk's painted-cell set and the pre-walk Range snapshot (already computed by `home-range`'s New Ground detection at the same call site — reuse it, don't recompute).
- [ ] 1.3 XP is unaffected — confirm `awardWalkXp`/`xpAwardForWalk` never receives `bloomMultiplier` (per `design.md`'s "why treats only" decision; this is the thing to explicitly test, since it's the easiest place for a future edit to accidentally wire it in).
- [ ] 1.4 Unit tests against `design.md`'s worked table (Decision 3): same loop walked yesterday → ×1.112; 3+ weeks old or entirely new ground → ×1.600; below the 25-cell floor → ×1.000 regardless of wildness.

## 2. Manual-log route refresh

- [ ] 2.1 `LogMissedWalkScreen.tsx`: add an optional route picker, sourced from the player's own previously-*tracked* (not manually-logged) walk history, letting them pick a route this manual log refreshes. Picking is optional — a manual log with no route picked behaves exactly as it does today (no refresh, no bloom involvement at all).
- [ ] 2.2 The refresh operates on the cell set of the selected walk (recompute via `paintedCells` on that stored walk's `locations` — do not persist a second copy of the cell list), writing `lastRefreshed = now` to those cells via `HomeRangeRepository.paintCells(..., tracked: false)`. Never writes `lastTracked`, never increments `visits` — `design.md`'s Decision 1 "two clocks" distinction is what this enforces; confirm the `home-range` contract test from its section 2.4 already covers `tracked: false` not touching `lastTracked`/`visits`, and extend it if not.
- [ ] 2.3 Cap: at most 1 route refresh per calendar day, at most 2 manual logs per calendar day total (matching `design.md` Decision 4's exact rule) — both still subject to the existing `DAILY_REWARD_MULTIPLIERS` per-day discount, unchanged.
- [ ] 2.4 A manual log's `bloomMultiplier` is **fixed at `1 + 0.6 · wildness(1 day)` ≈ ×1.112**, regardless of which route is picked or how wild it actually was — this is the exploit-closing rule from `design.md`'s "Can route-picking be farmed?" probe; do not compute the manual log's real `B` from the picked route's actual wildness under any circumstances.
- [ ] 2.5 Unit tests: refresh caps are enforced (a second same-day refresh attempt is rejected or silently ignored — pick one behavior and test it, `design.md` doesn't pin down which); the fixed ×1.112 is applied regardless of the picked route's real wildness; a manual log with no route picked behaves identically to today.

## 3. New Ground / Fresh Ground celebration + "Buddy knows N streets"

- [ ] 3.1 `CelebrationScreen.tsx`: New Ground beat when `home-range`'s New Ground detection fired on this walk (data already computed by `home-range`'s section 6.1 — this task only adds the UI). Copy is a `game-master` question — do not invent placeholder copy beyond a structurally correct slot, matching this project's existing precedent for un-authored copy (`milestones.ts`'s `MILESTONE_TITLES`, currently empty until game-master authors it).
- [ ] 3.2 Fresh Ground beat (multiplier line) shown only when `bloomMultiplier >= 1.25`, per `design.md` Decision 3's UI rule — below that, the walk-close screen shows the treats total with no multiplier line, not "×1.00," nothing. This is the fix for the fixed-loop-walker dead zone (`design.md` FLAG 1) — do not skip it as "just a display nicety."
- [ ] 3.3 Surface `streetsKnown` (already computed by `home-range`'s section 6.2) somewhere in the UI — `DenScreen.tsx` is the natural home (matches this project's pattern of surfacing progress stats there), but placement/copy/noun ("streets," or something else) is `game-master`'s call.
- [ ] 3.4 Confirm both beats stay visually at or below the weight of the existing "Territory claimed!"/treats-earned line, per `visual-design`'s Success Criteria and this project's existing `virtual-dog-companion` precedent for not letting a secondary beat upstage the peak-joy moment.

## 4. Spec deltas

- [ ] 4.1 Apply this change's `specs/` deltas (`den-economy`, `anti-snowball`, `walk-lifecycle`) via `/opsx:apply` once sections 1-3 are implemented and verified.
- [ ] 4.2 Update `README.md` to mention Fresh Ground/manual-log refresh, mirroring how prior changes updated the same section.

## 5. Automated coverage

- [ ] 5.1 Extend `walkRewards.test.ts` to cover a full walk-close path with a non-trivial `bloomMultiplier` (not just the pure formula in isolation) — confirm the treats actually credited match `buddyTreatsPerWalk(...) * bloomMultiplier * dailyMultiplier`, rounded once, not compounded through two separate roundings.
- [ ] 5.2 Anti-snowball proof as an actual test, not just a design-doc claim: an identical walk (same painted-cell wildness) at Level 1 vs. Level 100 produces the same `bloomMultiplier` ratio with and without the bloom applied — i.e. automate `design.md` Decision 7's "0.000000 pp" check so a future change to `bloomMultiplier` that accidentally introduces a level term fails a test, not just a design review.

## 6. Manual on-device verification

**Needs a real device/emulator — left for the user to run.**

- [ ] 6.1 Walk the same route on several different simulated days; confirm the Fresh Ground beat appears only once `bloomMultiplier >= 1.25` and shows a sensible number.
- [ ] 6.2 Walk genuinely new ground; confirm the New Ground beat fires and "Buddy knows N streets" increases.
- [ ] 6.3 Log a missed walk with a picked route; confirm the map's Bloom for that route visibly refreshes and the manual log's treats match the fixed ×1.112 rate, not the route's real wildness.
- [ ] 6.4 Attempt a second same-day route refresh; confirm the cap behaves as implemented in task 2.5.

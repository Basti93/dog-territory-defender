## Status

**Concept-stage, revised.** This proposal is deliberately non-technical — it captures the player-experience design and the *why*, not the implementation. `design.md`, `specs/`, and `tasks.md` are intentionally not filled in yet. Once this concept is agreed, it should be split into one or more separate technical changes each carrying their own technical `design.md`/specs/tasks.

Drafted and revised across several `game-master` passes — see "Source" below. **This revision replaces the original "Yard Grows With You" art-driven concept** (kept below in "Superseded: The Yard Grows With You" for its still-relevant guardrail reasoning) with a numbers-only direction, for two concrete reasons: (1) the project has no artist, so any concept requiring new dog illustrations per growth stage isn't buildable; (2) the longer-term plan (Phase 3, social layer) is for players to upload a real photo of their own dog for neighbor recognition — a real photo can't be incrementally "redrawn" with accumulating details, so an illustration-based growth system was never going to survive that transition anyway.

## Why

The game already has a standalone Den Level/XP number that climbs on every walk, shown as a level + progress bar in four places. It works as a number that goes up, but it has zero identity — a bare stat, not a character — and, more importantly, **it currently gates and grants nothing.** Per `den-economy/spec.md`, Level only unlocks Den buildings 4-10, and Phase 1 only has buildings 1-3, all available from the start. So today the number climbs and literally nothing else changes. That's the real gap — not a missing illustration, a missing consequence.

The fix: the Level number *is* the dog's own level, not an abstract Den stat, and leveling up visibly makes the walk itself more rewarding — the classic cookie-clicker move of a number that makes other numbers grow faster.

## The Concept: Buddy Levels Up

No new art. The existing Level/XP number is reframed as the player's own dog's level, and made to pay out.

### The dog has a name, and the level is his
One text input at first launch (name your dog); from then on, every place the Level number already appears reads as "Buddy — Level 7," not "Den Level 7." Same mechanic, same storage, only the framing changes — ownership shifts from the base to the dog.

### The level visibly pays out
Buddy's level scales the walk reward itself (treats per walk and/or passive treat rate), and that rate is shown as its own concrete number — "Buddy brings home 14 treats a walk" — not just implied by a bigger total. This is the part that makes leveling feel like leveling instead of scorekeeping; it should not ship without this.

### A level-up beat that names the numbers
At walk-close, where the peak-joy moment already lives, a level-up shows the before/after concretely: "Buddy reached Level 8 — he's bringing home 14 treats a walk now, up from 12." Old value and new value both shown, no new art needed — this replaces a visual change with a concrete, sayable moment.

### Milestone titles, front-loaded, never final
At a front-loaded set of levels, Buddy earns a text-only title — "Neighborhood Explorer," "Trail Regular," and so on, no fixed final title, no "/100" or percentage anywhere. A title only works once the level it's attached to already pays out; a title on a level that does nothing is the shiny-number problem with better vocabulary, so titles ship alongside the payout, never instead of it.

### The Den helps the dog, narratively
Den building bonuses (passive treats/hour, etc.) get reframed as things that help Buddy, not abstract base upgrades — "the Sniff Garden means Buddy sniffs out more on every walk." Same math, no new mechanical dependency (leveling never gates on owning a specific building) — just copy that connects two systems that were already adjacent.

### Deferred, not deleted: souvenirs, keepsakes, a yard
The original concept's daily-souvenir / permanent-keepsake / milestone-place layers are real, tested ideas (see "Superseded" below for their guardrail reasoning, which still applies if any of this gets built later) — but they're art-dependent and secondary to fixing the actual motivation gap (a level that does nothing). Revisit only after the numbers-only version ships and if it needs more texture.

## Guardrails (non-negotiable, carried across every revision)

- **Bonuses only ever rise.** No decay, no regression, no "it's been a while" state — a level-up's payout never goes down.
- **No guilt, ever.** No sad, lonely, or neglected imagery or copy anywhere in this feature.
- **One dog, not two.** This is the player's own dog — never a separately named/voiced character that could read as competing for affection with the real animal on the leash.
- **No final stage.** No "/100", no percentage, no named final title, no state that forecloses future growth.
- **No fake agency.** Leveling comes only from actual walks, never from tapping the screen.
- **Stays secondary to the walk.** The peak-joy moment remains the walk-closing celebration (territory claimed); the level-up beat lives inside that same moment, not a separate one competing with it.

## Anti-Patterns Explicitly Rejected

| Pattern | Why it's rejected here |
|---|---|
| Hunger/happiness/care meters that decay over time | Turns absence into damage — the instant a bar can go down, opening the app becomes an obligation instead of a treat. |
| Sad/lonely/neglected states ("your dog misses you") | Weaponizes real affection for a real animal — the single most toxic lever available in this feature. |
| Evolution to a final "elder" stage (aging arc) | Points the emotional arc somewhere sad and puts a ceiling on what should be indefinite, gentle growth. |
| Streak framing tied to the dog's state | The player already has one non-negotiable daily bond — the real dog. A second "don't break the bond" pressure is the fastest path to resentment. |
| Stat bars, hearts, or level badges floating over the dog | Already inconsistent with this game's established "no gamey chrome" visual rule — flattens a character back into a dashboard. |
| Seasonal/limited-time cosmetics | Manufactures deadline anxiety in a feature whose whole point is a relaxing payoff; seasonal touches should just happen, never expire. |

## Open Questions for the Technical Split

- What Level-to-payout curve actually produces "leveling up feels good, never a dead stretch, never a runaway snowball" — a formula/curve question for the `game-economist` subagent to validate via standalone calculation before any implementation.
- Exact milestone-title levels and copy (front-loaded spacing, matching how the existing Level curve itself front-loads).
- How the Den-building-bonus copy reframe ("the Sniff Garden means Buddy sniffs out more") is implemented without creating a real mechanical dependency between owning a building and the dog leveling — narrative link only, per the Guardrails.
- Whether/when to revisit the deferred souvenir/keepsake/yard layer once the numbers-only version has real usage data.
- Which phase this belongs to — most likely Phase 1 alongside the existing Den/Level work, but needs confirming against `docs/specs/game-phases.md`'s phase-gating rule before implementation starts.

## Superseded: The Yard Grows With You

Kept for reference — this was the original concept before the no-artist / future-real-photo constraints (see "Status") ruled out anything requiring new dog illustrations. Its guardrail reasoning (no decay, no guilt, one dog not two, no final stage, no fake agency, stays secondary to the walk) carried forward unchanged into the current concept above, and should carry forward again if any of its accumulation layers (souvenirs, keepsakes, yard places) get revisited later.

The dog itself never changes shape, age, mood, or "state." It only ever *accumulates* — more things it loves, more places to be. Progress shows up in the yard, not on the dog's body and not on a meter.

Three payoff sizes, on three different clocks: **every walk**, a souvenir shows up when the player opens the Den (muddy paws, a daffodil, a stick refused to be put down) — ephemeral, gone by the next walk unless kept. **Every level-up**, one recent souvenir gets promoted to a permanent keepsake, worn/used by the dog in the yard from then on — player's choice or auto-pick, nothing ever lost by not choosing. **Every milestone level**, a brand new place appears in the yard (a sunny blanket, a water bowl, a digging patch, a porch step, a gate) with its own idle behaviours — milestones widen the pool the daily-souvenir layer draws from, so a milestone pays off once loudly and then keeps paying off quietly. The Level curve's existing horizon framing (no "/100", no percentage, no named final stage) extends to the yard: keepsake-promotion continues per-walk once all designed places are unlocked, so the yard never stops being able to grow even if the Level number itself slows down.

A first pass at this idea (souvenirs alone, no keepsakes/milestones) was reviewed and flagged as missing a sense of concrete progression — daily variety alone didn't feel like "leveling up." The version above was the fix for that. It's recorded here because the same failure mode (variety without accumulation, or accumulation without payout) is exactly what the current numbers-only concept had to avoid too — see "Why" above.

## Source

Drafted and revised across multiple `game-master` subagent passes (non-technical, fun-only review persona — see `.claude/agents/game-master.md`): an initial concept pass grounded in `den-economy/spec.md` and `visual-design/spec.md`; a revision pass adding the yard's level-tied milestone structure after the first pass was flagged as missing concrete progression; a pass reconsidering whether the dog's own appearance (not just the yard) should visibly grow, prompted by a Pokémon GO comparison; and a final revision pass, prompted by the no-artist constraint and the Phase 3 real-photo plan, that replaced all art-dependent growth with the numbers-only "Buddy Levels Up" concept above. Full reasoning for every pass is available in this session's transcript if any specific call needs revisiting.

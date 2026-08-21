## Status

**Concept-stage.** This proposal is deliberately non-technical — it captures the player-experience design and the *why*, not the implementation. `design.md`, `specs/`, and `tasks.md` are intentionally not filled in yet. Once this concept is agreed, it should be split into one or more separate technical changes (art/scene structure, storage of unlocked places and kept souvenirs, wiring into the existing Level system) each carrying their own technical `design.md`/specs/tasks.

Drafted with the `game-master` subagent (non-technical, fun-only reviewer) across two passes — see "Source" below.

## Why

The game already has a standalone Den Level/XP number that climbs on every walk, shown as a level + progress bar in four places. It works as a number that goes up, but it has zero visual or emotional identity — a bare stat, not a character. The Den scene itself is a static illustration (a resting dog silhouette that never changes).

There's an open opportunity here: give the abstract Level number, and the player's real walking effort, a living, lovable face. Not a second pet competing for the player's affection — the player's *own* dog, illustrated, visibly thriving because of the walks actually being taken. Right now closing a walk earns treats and a number tick; it should also earn something the player wants to go look at.

A first pass at this idea was reviewed and flagged as missing a sense of concrete progression — daily variety alone didn't feel like "leveling up." This proposal folds in a second pass that adds level-tied milestones without reintroducing the problems (guilt states, decay, a sad final stage) that the first pass was already careful to avoid.

## The Concept: "The Yard Grows With You"

The dog itself never changes shape, age, mood, or "state." It only ever *accumulates* — more things it loves, more places to be. Progress shows up in the yard, not on the dog's body and not on a meter.

Three payoff sizes, on three different clocks, all feeding from the same source (the walk you just took and the Level it feeds):

### Every walk — a souvenir
Something from the specific walk just taken shows up when the player opens the Den: muddy paws after a rainy route, a daffodil tucked behind the ear after a park loop, a stick the dog clearly refuses to put down. Ephemeral — gone by the next walk unless kept (see below). This is what makes the Den worth checking after *every* walk, not just big ones.

### Every level-up — a keepsake
One souvenir from the recent walks gets promoted from "today's" to permanent. The dog keeps it for good — it's in the yard from now on, and the dog is shown actively using/wearing it, not just parked as decor. The player can choose which recent souvenir to keep, or let it auto-pick. Nothing is ever lost by not choosing — unpicked souvenirs just don't get promoted yet, there's always another walk coming.

### Every milestone level — a new place
At a front-loaded set of levels (early ones close together, spacing out over time — matching how the existing Level curve itself front-loads early progress), a brand new place appears in the yard: a sunny blanket, a water bowl with its permanent puddle, a digging patch, a porch step, a gate to watch the street through. Each place brings its own idle behaviours that can only happen there. This is the legible "stage" a player can point to and say "my yard used to have one thing in it, now it has seven" — without the dog ever visibly aging.

### How it holds together
These aren't three separate systems — milestones widen the pool the daily-souvenir layer draws from. A new place means more things the dog could plausibly be doing tomorrow. So a milestone pays off once, loudly, and then keeps paying off quietly every day after, because there's simply more the dog can be shown doing.

### The ceiling
The Level curve already runs to 100 and is meant to be read as a horizon, never a completion bar (no "/100", no percentage, no named final stage) — this concept extends the same rule to the dog. Once the last designed milestone place is unlocked, keepsake-promotion keeps going on a per-walk basis instead of a per-level one: the Level number can slow down, but the yard never stops being able to grow. There is no "elder" stage, no aging arc, and nothing about the dog or yard ever regresses.

## Guardrails (non-negotiable, carried from both review passes)

- **Nothing ever gets worse.** No decay, no regression, no "it's been a while" state, no hunger/happiness meter of any kind.
- **No guilt, ever.** No sad, lonely, or neglected imagery or copy anywhere in this feature.
- **One dog, not two.** This is the player's own dog, illustrated — never a separately named/voiced character that could read as competing for affection with the real animal on the leash.
- **No final stage.** No aging-toward-death arc, no "elder" endpoint, no state that forecloses future growth.
- **No fake agency.** No tapping the dog to fill a bar — every reward here is earned by an actual walk, never by interacting with the screen itself.
- **Stays secondary to the walk.** The peak-joy moment remains the walk-closing celebration (territory claimed). This feature lives in the quieter moment afterward, when the player checks the Den later.

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

- What milestone-level spacing actually produces the "front-loaded, never a dead stretch" pacing this concept assumes — this is a formula/curve question, a natural next step for the `game-economist` subagent to validate against the existing Level curve before any implementation.
- How many yard "places" and idle behaviours are realistically producible as art/animation, and does that count comfortably cover the milestone levels chosen?
- Where kept keepsakes and unlocked places get stored (almost certainly alongside the existing Den economy state) — a technical proposal's job.
- Whether souvenir choice (player picks which one to keep) or auto-pick is the default — a smaller product decision that can be made during the technical proposal.
- Which phase this belongs to — most likely Phase 1 alongside the existing Den/Level work, but needs confirming against `openspec/specs/game-phases/spec.md`'s phase-gating rule before implementation starts.

## Source

Drafted from two `game-master` subagent passes (non-technical, fun-only review persona — see `.claude/agents/game-master.md`): an initial concept pass grounded in `den-economy/spec.md` and `visual-design/spec.md`, and a revision pass adding the level-tied milestone structure after the first pass was flagged as missing a sense of concrete progression. Full reasoning for both passes is available in this session's transcript if any specific call needs revisiting.

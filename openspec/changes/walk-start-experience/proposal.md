## Status

**Concept-stage.** This proposal is deliberately non-technical — it captures the player-experience design and the *why*, not the implementation. `design.md`, `specs/`, and `tasks.md` are intentionally not filled in yet. Once this concept is agreed, it should be split into one or more separate technical changes (at minimum: one for the home-screen entry point, one for retroactive walk-claiming) each carrying their own technical `design.md`/specs/tasks.

Drafted with the `game-master` subagent (non-technical, fun-only reviewer) — see "Source" below.

## Why

A dog owner walks up to 4 times a day, and most of those walks are short, routine, "just going out the door" moments — not planned outings. In that rushed moment (leash in one hand, dog already pulling), the player doesn't remember to open the app and tap "Start Walk." Once the walk has happened untracked, it's gone: no territory, no treats, no reward. Over time this erodes the habit of using the app at all, because the app only shows up in the player's life when they remember it — which is backwards.

The deeper problem isn't a missing reminder. It's that the app currently competes for attention with a dog pulling toward the door, and loses every time. The fix isn't a louder nudge — it's removing the moment where a decision has to be made at all, and making the times it's missed harmless instead of costly.

This also directly serves the standing goal (see recent Den Level/XP and personal-stats work) of a cookie-clicker-like loop that stays rewarding even for a solo player: right now the reward loop only fires when the player remembers to start tracking, which caps it at well under the ~4 real walks/day that are actually happening. Fixing the start moment is the single biggest available lever on how often the core loop fires.

## The Concept

Two parts, meant to ship together — one creates the pull, the other catches what the pull misses.

### 1. The Dog at the Door

Move the "start" action out of the app entirely and onto a home-screen/lock-screen widget: an illustrated dog, dozing through the day and perking up (ears up, tail wagging) around the player's usual walk times. One tap on the dog starts tracking — no app launch, no menu, no confirmation screen. The player isn't operating software in that rushed moment; they're greeting their dog on the way out, the same way they'd glance at the leash hook.

This turns the biggest existing asset — the dog is the star — into the actual interface for the moment that currently has the most friction.

**Non-negotiable guardrail:** the widget dog is never sad, droopy, or "it's been 2 days since your last walk." Idle state is content/dozing, at most eager around usual walk times — never guilt. This is the single most dangerous lever in this whole concept (see anti-patterns below) and must not be touched.

### 2. Nothing Was Lost

For the walks the widget still misses (it will — some real, non-trivial share of the time), losing the walk entirely is what's actually eroding the habit. Instead: when the player opens the app afterward, if it looks like an untracked walk just happened, the app gently offers to claim it retroactively — "Looks like you two were out! Want to claim it?" — with the route filled in and the same green territory-claiming payoff as a normal walk.

This turns a miss from "that walk is just gone, and by extension this app doesn't really fit how I actually live" into a small, pleasant surprise waiting for them later.

**Non-negotiable guardrail:** a retroactively-claimed walk must never be presented as lesser — no "unverified" label, no reduced treats, no different visual treatment. The instant a retro-claimed walk feels like a consolation prize, it re-creates exactly the guilt this concept exists to remove.

### Why both, not just one

The Dog at the Door is what creates *wanting* — it's the only piece of this concept that acts in the actual rushed moment and can plausibly lift the reward loop from ~1 walk/day to closer to the real ~4. But it will still miss walks sometimes, and without a safety net every miss quietly teaches the player that the app is unreliable for their real life. Nothing Was Lost is the floor under it: it doesn't create excitement on its own, but it stops the erosion.

## Guiding Principles (apply to any technical proposal built from this)

- **Zero decisions at the door.** One tap, one confirmation (a bark / a green pulse), phone back in pocket. Any second tap or choice screen at start is one too many.
- **The dog is never sad.** No decaying state, no "it's been a while," no guilt-shaped copy or imagery, anywhere in this feature.
- **A miss is a gift, not a loss.** Retroactive claiming is framed as a pleasant find, never as making up for a failure.
- **No artificial urgency.** No countdown, no expiring window, no "claim within 2 hours" — real dog walks don't run on the app's clock.
- **Numbers only ever go up.** Nothing in this feature should introduce a value that can visibly go down (a streak that snaps to zero, a counter that decays) — see the anti-patterns table below.

## Anti-Patterns Explicitly Rejected

These are proven engagement tricks from other successful apps that were considered and ruled out as clashing with this game's spring/joyful, never-guilt-driven tone:

| Pattern (source) | Why it's rejected here |
|---|---|
| Guilt mascot / "you made him sad" (Duolingo) | Weaponizes a real emotional bond with a real animal — the most powerful and most toxic lever available in this app. Never ship a sad-dog state. |
| Breakable streak counters (Snapchat Snapstreaks) | A big streak wiped by one missed day (illness, travel) punishes a life event. Any future streak reward should be a rolling bonus that happens, never a visible number that snaps to zero. |
| Time-boxed "late" submissions (BeReal) | Time-gating a real-world dog walk nudges the player to walk on the app's schedule instead of the dog's. |
| Countdown lures / limited-time spawns (Pokémon GO) | Creates pressure to go outside for the game's benefit rather than the dog's — directly against this game's Design North Star. |
| Pace/distance social comparison (Strava) | Makes a routine 5-minute pee-break walk read as a failure, when short routine walks are exactly the behavior this feature exists to capture. Keep comparison mechanics far away from the start/claim moment. |
| Loss-framed copy ("3 walks missed", "treats expiring") | Inverts a gain into a threat. Existing overflow-notification copy ("124 treats waiting!") is the right model — always a gain sitting there, never something slipping away. |

## Open Questions for the Technical Split

Deliberately left open here — each is a separate technical proposal's job to answer:

- Home-screen/lock-screen widget: what's actually feasible on iOS vs. Android, and what's the fallback on platforms/OS versions that don't support a live interactive widget?
- How is "looks like you two were out" actually inferred (motion data, background location, manual "I forgot to track" entry)? What's the accuracy/false-positive tradeoff?
- Battery and background-location cost of any "was I walking" inference — balanced against `background-location-tracking`'s existing foreground-service approach.
- Which phase this belongs to — Phase 1 (core loop) most likely for both pieces, but needs confirming against `openspec/specs/game-phases/spec.md`'s phase-gating rule before any implementation starts.
- Whether "Nothing Was Lost" needs a cap on how far back it can retroactively claim (a walk from 3 days ago vs. 20 minutes ago probably shouldn't be treated the same).

## Source

Drafted from a `game-master` subagent run (non-technical, fun-only review persona — see `.claude/agents/game-master.md`), which was given the problem statement plus explicit instruction to draw on and critique patterns from Duolingo, Snapchat, Strava, Pokémon GO, and BeReal. Full agent output available in this session's transcript if the reasoning behind any specific call needs to be revisited.

## Why

Closing a walk today just shows a plain `Alert.alert("Success!", ...)` — functional, but not the "peak-joy moment" `visual-design`'s "Territory Claimed (Post-Walk Celebration)" requirement already calls for, and doesn't fulfill "Delight Interaction Moments"' confetti requirement at all. This is the last piece of Phase 1's actual loop: walk → claim → **celebrate** → treats → tease next upgrade → walk again.

## What Changes

- Replace the `Alert.alert` in `stopWalk()`'s closing branch with a real `CelebrationScreen`: shows territory area claimed, the treats just earned, gentle confetti, and a "next upgrade" tease (reusing the same cheapest-affordable-or-cheapest-overall logic `DenScreen` already has) — then a clear CTA back to the main screen.
- Extract that tease logic into a shared, tested pure function (currently only exists inline inside `DenScreen`) so both screens use one implementation.
- Confetti: a small custom Animated-View effect (5–10 pieces, tokens' colors, brief), not a new dependency — "gentle, not aggressive" per `visual-design`'s tone rules, and this app doesn't need a general-purpose confetti library for one moment.
- **No spec changes.** `visual-design`'s "Territory Claimed" requirement also calls for showing "the dog's XP/level progress" — that system doesn't exist yet (later phase). Per `visual-design`'s own "Phase-Scoped Visual Delivery" requirement, this is a partial, phase-appropriate implementation of that requirement (substituting treats-earned + next-upgrade tease, which serves the same "momentum toward the next walk" purpose) — not a change to what the requirement eventually asks for. `skip_specs: true`.
- **Not in this change:** dog XP/level system, anything for an *open* (unclosed) walk — `walk-lifecycle` already specifies no reward/celebration for those.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none)

## Impact

- New: `src/components/CelebrationScreen.tsx`.
- `src/economy/denEconomy.ts` (or a new small module): extract `getUpgradeTease(state)` pure function, tested; `DenScreen.tsx` switches to use it instead of its current inline computation.
- `App.tsx`: `stopWalk()`'s closing branch shows `CelebrationScreen` instead of calling `Alert.alert`.

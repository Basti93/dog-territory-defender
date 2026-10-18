## Status

**Technical.** Splits off the "earned-trigger notification" + "Log a walk we missed" slice of `walk-start-experience`'s MVP Scope (decided) — see that change's `proposal.md` for the full player-experience concept, guardrails, and copy. This proposal doesn't re-argue any of that; it exists to turn the already-agreed MVP scope into an executable technical change.

## Why

`walk-start-experience/proposal.md`'s "MVP Scope (decided)" section already settled *why* and *what*: a dog owner's real walks outnumber tracked walks because starting tracking competes with a rushed, leash-in-hand moment and loses. The full fix (a home-screen widget) is deferred; this change ships the low-hanging-fruit half — a notification that only ever reports something already true and unclaimed, plus a manual way to claim a walk the app missed. See that document for the player-experience reasoning, the anti-pattern table, and the resolved copy/timing rule. Nothing here changes that reasoning.

## What Changes (technical framing of the 3 MVP bullets)

1. **Earned-trigger notification — Den-economy overflow only in this MVP.** A local (device-scheduled, not server-pushed — there's no backend) notification fires only when an existing Den-economy overflow event (treats/build) exists that hasn't been surfaced to the player yet. Delivery targets a coarse time-of-day bucket (morning/midday/evening) learned from the player's own past walk-start times, not a player-set clock. No qualifying condition on a given day means no notification that day — silence is the default. Exact accepted/rejected copy and the full timing rule are specified once, in `docs/decisions/walk-start-experience/proposal.md` under "Notification Timing (resolved)" — this change reuses those strings verbatim and must not introduce new copy.

   **Scope cut from `walk-start-experience`'s MVP bullet:** that document's "Earned-trigger notification" bullet also listed "a manually-logged missed walk sitting unclaimed" as a second trigger condition. This change drops that condition. Rationale: "Log a walk we missed" (item 2 below) awards its reward the instant the player taps it — there is no intermediate state where a manually-logged walk sits in storage unclaimed for a later notification to surface. Keeping that trigger would require redesigning the button into a two-phase flag-now/claim-later flow, which is real added scope beyond this low-hanging-fruit pass and is not needed to test the friction hypothesis this change targets. See `design.md`'s Decisions for the full reasoning.

2. **"Log a walk we missed" button.** A new in-app, manual entry point that lets the player record that an untracked walk happened, without needing a live GPS trail. It runs through the existing reward path (treats, XP, personal stats, achievements) exactly as a normally-closed walk does — no "unverified" label, no reduced reward, per `walk-start-experience`'s "Nothing Was Lost" guardrail. It is a standalone, one-step, direct-reward action in this change: no notification is tied to it (see the scope cut above).
3. **A `Walk.startSource` tag** (`'button' | 'manual-log'`), additive alongside existing fields like `Location.accuracy` (see `src/types.ts`), so tracked-vs-manually-logged walks can be told apart later when measuring whether this MVP actually moved walks/day.

## Not in this change

- **The real home/lock-screen widget** ("The Dog at the Door"). Needs `expo prebuild`/EAS and native config-plugin work outside the current dev-client workflow — a materially larger, separately-scoped investment. Follow-up change only if this MVP's data supports it.
- **The scheduled clock-fired "Start Walk" reminder notification.** A distinct hypothesis (reminder vs. friction) with its own scope (opt-in flow, player-set time picker, auto-sleep-after-3-ignores logic, 4-week kill-switch experiment) per `walk-start-experience`'s "Notification Timing (resolved)" section. Not needed to test the friction hypothesis this change targets.
- **Automatic missed-walk detection/inference.** No always-on sensing exists today — `background-location-tracking`'s foreground-service tracking (`src/utils/gps.ts`) only runs while a walk is already in flight. Automatic "was I walking" inference is new sensing with real battery/GDPR cost, explicitly deferred pending this MVP's manual-log data.
- **A notification tied to "Log a walk we missed."** Explicit scope cut from `walk-start-experience`'s original MVP bullet — see "What Changes" item 1 above. A two-phase flag-then-claim redesign that would make this reachable is a separate, later change if the overflow-only notification and the manual-log button's own data suggest it's worth it.

## Phase Gating

`docs/specs/game-phases.md` currently slots notification-based engagement generically under Phase 2 ("Repetition Reward Loop" — evening recap notification, streaks). `openspec/config.yaml` still says Phase 1 is in progress, with no formal Per-Phase Validation audit recorded for Phase 1 per `game-phases/spec.md`'s own gating rule.

**Decision (made, not re-opened here):** the user explicitly stated, in this session, "I think we are already in phase 2 now, we already tested the walk functionality and it works" — this is the explicit human call `CLAUDE.md` rule 6 ("when ambiguity arises, ask the user — don't guess") asks for, not an assumption inferred by an agent. On that basis, this earned-trigger notification is being treated as in-scope work now. This change does not itself claim a formal Per-Phase Validation audit has been run against `game-phases/spec.md`'s own process — that remains a separate, standing open item, not something this change resolves or should be read as resolving.

Separately, this specific notification reads more like Phase 1 capture (rewarding more of the already-existing core loop) than a Phase 2 retention nudge (evening recap, streaks) — the "Modified Capabilities" below proposes clarifying that distinction in `game-phases/spec.md` rather than leaving it ambiguous.

## Capabilities

### New Capabilities
- `manual-walk-logging` (or folded into `walk-lifecycle`, implementer's call at spec-delta time): a walk can be created and rewarded without a live GPS-tracked session.

### Modified Capabilities
- `game-phases`: clarify that an earned-trigger, nothing-invented notification (this change) is Phase 1-shaped core-loop capture, distinct from Phase 2's clock/streak-driven recap notification — see "Phase Gating" above.
- `walk-lifecycle`: add the manually-logged walk as a third way a `Walk` record comes to exist, alongside closed and open GPS-tracked walks, plus the `startSource` tag.
- `den-economy`: no requirement-text change — the existing overflow-notification requirement ("...the system SHALL notify the player when passive treat storage overflows") already covers this; this change is the first time that requirement gets a real push-notification delivery mechanism instead of just in-app text. See `design.md` and the specs-delta recommendation below for why this part alone doesn't need new requirement wording.

## Impact

- `package.json`: new dependency, `expo-notifications`.
- `app.json`: notification permission/config plugin entry (Android + iOS).
- `src/types.ts`: `Walk` gains `startSource`.
- `App.tsx`: the reward-awarding logic currently inline in `stopWalk`'s closure needs extracting into a shared, callable function first, so the new manual-log entry point can call the same path a tracked walk does — see `design.md` Decisions.
- `src/economy/` and `src/storage/`: existing reward path and repository layer are reused (once extracted), not replaced; some small new local persisted state is needed for notification bookkeeping (tracking whether the current Den-economy overflow has already been surfaced, and the learned time-of-day bucket) — shape left to the implementer, following the existing repository-pattern convention.
- New UI surface: the "Log a walk we missed" entry point (exact screen placement left to the implementer — `tasks.md`).
- Requires a dev-client rebuild (new native permission), same as `background-location-tracking`.

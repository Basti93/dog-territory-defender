## Status

Drafted by `senior-app-architect`, technically scoping a feature whose fun/anti-guilt guardrails were already fully designed and resolved by two prior `game-master` passes recorded in `openspec/changes/archive/2026-08-22-walk-start-experience/proposal.md`'s "Notification Timing (resolved)" section. Those guardrails are not re-litigated here — this proposal only scopes them technically, plus resolves the phase-classification question that document's own "Open Questions for the Technical Split" left open.

## Why

The founder personally forgot to start walk-tracking one day, in exactly the "leash in one hand, dog already pulling" moment `walk-start-experience` describes, and asked for a settings-based reminder. That prior concept already designed, resolved, and explicitly deferred this exact feature ("the scheduled clock-fired 'time to walk' reminder experiment... needs an opt-in flow, player-set time picker, auto-sleep logic — real scope of its own"). This proposal is that deferred follow-up, now explicitly requested.

The guardrails exist because a clock-fired "did you walk yet" nudge is the single riskiest pattern this game could ship: unlike the earned-trigger notification (which only ever reports something already true — an overflow, a claimable walk), a reminder with nothing behind it is structurally identical to the guilt-mascot/streak/urgency patterns `walk-start-experience` already catalogued and rejected. It ships anyway, but only as the fully-fenced, time-boxed experiment that document resolved: opt-in, player's own time, one per day, silent, auto-sleeping, always skipped when the day's walk is already done, one-tap-off, and measured for 4 weeks against a pre-agreed kill condition.

## What Changes

A new, off-by-default **Settings** surface (this app's first — see `design.md` Decision 1) lets the player turn on a daily walk reminder and pick their own time. Once enabled, a single local notification is scheduled for that time each day, but only on a day where no walk (tracked or manually-logged) has happened yet — if one already has, the day is silently skipped, no notification appears. If the player doesn't complete a walk on 3 consecutive days a reminder was actually scheduled and fired, the reminder silently turns itself back off — no "we noticed" message, and the Settings toggle honestly reflects that it's now off. A single tap in Settings turns it off permanently at any time, no confirmation dialog.

This reuses the existing `notifications`/`NotificationRepository` machinery this app already ships (the Den-overflow earned-trigger notification) rather than building a second, parallel notification system — see `design.md` Decisions 3-5.

## Two things this proposal does not silently assume

- **This is not Phase 1 work by analogy to the earned-trigger notification.** `game-phases/spec.md`'s own Phase 1 requirement text says an earned-trigger notification "surfaces an already-true, unclaimed core-loop event... never a clock-fired reminder invented on a schedule, which remains Phase 2's evening-recap notification, not Phase 1's," and its own scenario is titled "Earned-trigger notification distinguished from Phase 2 recap." This reminder has nothing true behind it when it fires (that's the entire point — it's a nudge, not a report) — it is structurally the exact pattern that requirement names as Phase 2's, even though its copy is a pre-walk nudge rather than an evening recap. See "Phase" below: this is scoped as Phase 2, pulled forward by an explicit founder decision, the same way `visits` was pulled forward from Phase 2 into Phase 1 by direct user decision and recorded as a named exception in `game-phases/spec.md`. It is not scoped as Phase 1.
- **The "never fires if the walk is already tracked" guardrail cannot be made airtight against a fully-killed app without a backend.** A locally-scheduled OS notification set hours ahead of time can't be pulled back at the exact moment it's about to show if the app process itself isn't alive to check "did they already walk?" one more time. See `design.md` Decision 4 for the accepted, logged tradeoff and why the alternative (an OS-level daily-repeating trigger) is actually worse on both correctness and tone grounds, not just harder to build.

## Capabilities

### New Capabilities
- `walk-reminder` — the opt-in daily reminder: settings toggle, player-set time, one-per-day cap, silent delivery, already-walked-today skip, 3-consecutive-ignore auto-sleep, one-tap permanent disable, and the local measurement counters backing its 4-week kill-condition review.

### Modified Capabilities
- `game-phases` — records this feature's Phase 2 classification and its status as a named, user-approved phase-pull-forward exception (mirroring the existing `visits` exception), analogous to how the earned-trigger notification's Phase 1 status was itself recorded there.

### Not modified
- `visual-design` — the new Settings screen is a low-key utility surface (a toggle and a time picker), not a "key screen" in the sense that spec's Key Screen Intents list captures (none of Debug Log or Log a Missed Walk got an entry there either); no new design tokens or tone rules are introduced. Considered and declined, not overlooked.
- `den-economy`/`personal-stats`/`home-range` — this feature reads `WalkRepository` only to check "did a walk happen today"; it awards no treats, XP, or achievements of its own and changes no existing formula.

## Impact

- `App.tsx`: the existing merged mount-effect (the one that already sequences the Doorstep's overflow-line claim before `checkAndScheduleEarnedTriggerNotification`, per `home-dashboard/design.md` Decision 6) gains one more sequential step, `checkAndScheduleWalkReminder`. The same check also runs immediately after a tracked walk finishes and after a walk is manually logged (`design.md` Decision 4), so a walk completed later the same day a reminder was already scheduled still cancels it without waiting for the next app open. The existing notification-tap listener (`data.type` branch, mirroring the `den-overflow` branch) gains a `walk-reminder` case that opens the Doorstep.
- New files: `src/components/SettingsScreen.tsx`, `src/notifications/walkReminderDecision.ts` (pure logic, mirroring `notificationDecision.ts`), a new exported scheduling function in `src/notifications/scheduler.ts`, a new `checkAndScheduleWalkReminder` in `src/notifications/earnedTrigger.ts` or a sibling file (implementer's call, see `tasks.md`).
- `src/storage/NotificationRepository.ts` (+ sqlite/in-memory impls): additive fields on the existing `NotificationBookkeepingState`/table — this project's first schema migration on an already-existing table (`design.md` Decision 3).
- `src/components/DoorstepMenu.tsx`: one new row, "Settings," alongside the existing Debug Log and Log a Walk We Missed rows.
- `src/components/DebugLogScreen.tsx`: a small fixed summary header showing this experiment's durable counters, above the existing scrollable log preview (`design.md` Decision 10) — no new screen for measurement.
- New native dependency: `@react-native-community/datetimepicker`, for the player's own time picker (installed via `npx expo install`, same pattern this project already documents in `README.md` for `expo-notifications`; needs a dev-client rebuild, not just `npm install`).
- No new dependency for scheduling itself — reuses `expo-notifications`, already present.

## Phase

**Phase 2, as a named phase-pull-forward exception — requires explicit founder sign-off before implementation, not an architect's assumption.** Per `game-phases/spec.md`'s own text (quoted above), a clock-fired reminder with nothing true behind it is Phase 2 scope; Phase 1 is still the active/in-progress phase per `README.md` ("Phase 1... in progress") with no recorded Per-Phase Validation audit advancing past it. Building this now, unlabeled, would be exactly the "later phase's features while an earlier phase is unvalidated" case `game-phases/spec.md`'s Phase Gating Rule prohibits.

The founder's own explicit request for this feature, plus the fact that its guardrails were already fully designed across two dedicated `game-master` passes specifically to keep it fun-safe, reads as the same kind of direct, informed decision that pulled `visits` forward from Phase 2 into Phase 1 (see `game-phases/spec.md`'s Engagement Mechanic Rollout requirement, "as the one deliberate exception to this table, decided directly by the user"). This proposal's `game-phases` spec delta records this feature as a second, analogous named exception rather than silently building it under a Phase 1 label or silently skipping the phase-gate question. **Before `senior-app-developer` starts implementation, the founder should explicitly confirm this pull-forward** — see Open Questions below.

## Open Questions — RESOLVED by user, 2026-08-22

- **Phase 2 pull-forward exception: CONFIRMED.** The founder explicitly directed this feature be built now regardless of its deferred/Phase-2 status when it was first raised. Logged here as the second named exception to the Engagement Mechanic Rollout table, alongside `visits`.
- **Killed-app scheduling tradeoff: ACCEPTED as designed** (`design.md` Decision 4) — a reminder can only ever re-fire after an app-open or walk-save in between. Simplest correct approach for a local-only, no-backend app; not worth heavier background-task engineering for a Phase-2 experiment.
- **Reminder copy: APPROVED as proposed** (`design.md` Decision 11) — *"There's a little more territory out there, whenever you two are ready for it."*

## Source

Concept and guardrails: two `game-master` subagent passes, recorded verbatim in `openspec/changes/archive/2026-08-22-walk-start-experience/proposal.md`'s "Notification Timing (resolved)" section. Technical scoping: `senior-app-architect`, grounded in `src/notifications/notificationDecision.ts`, `src/notifications/earnedTrigger.ts`, `src/notifications/scheduler.ts`, `src/storage/NotificationRepository.ts` (+ sqlite/in-memory impls), `src/storage/WalkRepository.ts`, `src/types.ts`'s `Walk.startSource`, `src/components/DoorstepMenu.tsx`, `src/components/DebugLogScreen.tsx`, `src/utils/debugLog.ts`, `src/utils/manualWalkLog.ts`, `App.tsx`'s merged mount effect and notification-tap listener, and `openspec/specs/game-phases/spec.md`.

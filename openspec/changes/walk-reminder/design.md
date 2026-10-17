## Context

This app has exactly one notification capability today: the Den-overflow earned-trigger notification (`src/notifications/notificationDecision.ts` for pure decision logic, `scheduler.ts` for the actual `expo-notifications` wiring, `earnedTrigger.ts` for the orchestration called from `App.tsx`'s merged mount effect, `NotificationRepository` for bookkeeping). It fires a one-shot local notification via `Notifications.scheduleNotificationAsync` with a `SchedulableTriggerInputTypes.DATE` trigger, computed fresh and rescheduled every time the app opens — there is no backend to wake the app while it's closed, so `earnedTrigger.ts`'s own doc comment is explicit that this is the honest limit of what's checkable. `App.tsx` has no Settings screen or navigation destination for one today; its only "tucked away" surface is `DoorstepMenu.tsx`, a two-row `Modal` bottom sheet (Debug Log, Log a Walk We Missed) with no interactive controls (switches, pickers) inside it yet.

`Walk.startSource` (`button` | `manual-log`) already distinguishes how a `Walk` came to exist; `WalkRepository.getWalks()` returns every walk regardless of source; `src/utils/manualWalkLog.ts` already exports `calendarDayKey(timestamp)`, the exact local-day-boundary helper this feature needs for "did a walk happen today."

This document assumes `proposal.md`'s scope, including its still-open Phase and killed-app-tradeoff questions, as settled enough to design against — but those two calls still need the founder's explicit confirmation before `senior-app-developer` starts (see `proposal.md`'s Open Questions).

## Goals / Non-Goals

**Goals:** reuse the existing notification bookkeeping/scheduling machinery rather than building a second, parallel system; make every guardrail in `proposal.md` (opt-in, one-per-day, silent, auto-sleep, skip-if-already-walked, one-tap-off) a structural property of the decision logic, not a convention an implementer has to remember; keep the "ignored" and "already walked" checks reusing existing, already-tested data (`WalkRepository`) rather than inventing a new signal; keep the 4-week measurement mechanism genuinely simple — durable counters and a place to read them, not a pipeline.

**Non-goals:** a real notification action button (swipe-to-dismiss from the notification itself, without opening the app) — see Decision 8; an OS-level always-recurring trigger that fires with zero app opens involved — see Decision 4; any change to how treats/XP/achievements are computed; a general-purpose Settings screen with unrelated preferences bolted on (this screen exists for exactly one feature today — see Decision 1).

## Decision 1 — A new, dedicated Settings screen, reached from the burger menu

**Add `src/components/SettingsScreen.tsx`**, reached by a new third row ("Settings") in the existing `DoorstepMenu.tsx`, alongside Debug Log and Log a Walk We Missed — no new entry-point chrome on the Doorstep itself.

**Rejected: putting the toggle/time-picker directly inside `DoorstepMenu.tsx`.** That component is a transient `Modal` whose backdrop `Pressable` closes it on any tap outside the sheet, built for one-tap navigation rows, not for hosting a `Switch` plus a native time-picker control (which, on both iOS and Android, is itself commonly presented as its own modal/popover) — nesting a picker's own modal inside a dismiss-on-outside-tap modal is a known source of RN gesture/dismissal bugs, and this project has zero prior instance of a control like this to pattern-match against. A dedicated screen is also consistent with this codebase's existing convention: every other burger-menu destination (Debug Log, Log a Walk We Missed) is its own full screen, not inline content in the menu itself.

**Why not skip a dedicated screen and reuse the Doorstep footer or the Den:** this setting has nothing to do with treats/Den economy, and putting a toggle on the Doorstep itself (the screen this whole codebase's own convention keeps deliberately free of "gamey chrome") is a worse fit than a single-purpose settings destination one tap away.

## Decision 2 — New dependency: `@react-native-community/datetimepicker`

The guardrail requires "a real time picker," not a scroll-wheel-of-hours built from scratch. RN has no built-in time picker; `@react-native-community/datetimepicker` is the standard Expo-config-plugin-compatible package for this (works in the managed/dev-client workflow this project already uses for `expo-notifications`). Install via `npx expo install @react-native-community/datetimepicker` (resolves the SDK-54-compatible version, same pattern `README.md` already documents for `expo-notifications`) and rebuild the dev client — this is a native dependency, not a pure-JS one.

**Rejected: a plain hour/minute number-stepper UI, no new dependency.** Technically avoids adding a package, but produces a materially worse, non-native-feeling control for a screen the founder will personally use, for a marginal dependency-count savings on a package that's about as standard and low-risk as they come in the Expo ecosystem.

## Decision 3 — Bookkeeping lives on the existing `NotificationRepository`, not a new repository

**Extend `NotificationBookkeepingState`** (and the sqlite/in-memory repositories implementing it) with new, flat, `walkReminder`-prefixed fields, rather than introducing a second repository for what is conceptually the same kind of thing this repository already exists for (notification bookkeeping):

```
walkReminderEnabled: boolean            // default false
walkReminderHour: number | null         // player-set, local time, default null
walkReminderMinute: number | null       // player-set, local time, default null
walkReminderConsecutiveIgnores: number  // default 0
walkReminderPendingDate: string | null  // calendarDayKey of the last day a reminder was actually scheduled and not yet reconciled; default null
walkReminderFiredCount: number          // default 0, durable measurement counter
walkReminderFollowedCount: number       // default 0, durable measurement counter
walkReminderExperimentStartedAt: number | null  // set once, the first time the toggle is ever turned on; default null
```

**Rejected: nesting these under one `walkReminder: {...}` object field.** The existing table (`sqliteNotificationRepository.ts`) is flat columns mapped 1:1 to interface fields with no JSON-blob column anywhere in this codebase's schema; introducing the first JSON-blob column for this feature alone (and needing to (de)serialize it) is more machinery than eight prefixed, individually-typed flat columns, for a readability gain that's marginal at this field count. The `walkReminder`-prefix keeps them visually grouped in the interface and the schema without needing nesting.

**Rejected: a brand-new `WalkReminderRepository`.** Would duplicate `NotificationRepository`'s existing singleton-row pattern for no reason other than these fields being newer — this repository already is "notification bookkeeping," and this feature's fields are exactly that.

**This is this project's first schema migration on an already-existing table.** `createSqliteNotificationRepository`'s current `CREATE TABLE IF NOT EXISTS` does nothing for a database file created by a version of this app that predates these columns — a fresh `ALTER TABLE notification_bookkeeping ADD COLUMN ... DEFAULT ...` step is needed for each new column, guarded so it doesn't error on a database that already has them (e.g. wrap in a `try/catch` that swallows the specific "duplicate column" error, or check `PRAGMA table_info(notification_bookkeeping)` first — implementer's call on the exact idiom, but this needs to be a real, tested migration path, not just an updated `CREATE TABLE` string that only helps a fresh install). Flagged explicitly because this codebase has had zero prior instances of this exact problem to copy from.

## Decision 4 — Scheduling mechanism: reschedule-on-app-open, not an OS-level daily-repeating trigger

**Reuse the existing pattern exactly**: `Notifications.scheduleNotificationAsync` with a one-shot `SchedulableTriggerInputTypes.DATE` trigger at the next occurrence of the player's set hour/minute, tagged `content: { body, data: { type: 'walk-reminder' } }` (no title, matching the existing overflow notification's own `content` shape exactly). Recompute and reschedule at three points, not just app-open:
1. The existing merged mount effect (`App.tsx`), right after `checkAndScheduleEarnedTriggerNotification`.
2. Immediately after a tracked walk finishes (`finishWalk`'s existing `walkRepository.saveWalk` success path).
3. Immediately after a walk is manually logged (`logMissedWalk`'s existing `walkRepository.saveWalk` success path).

Points 2 and 3 close the gap the naive "only reschedule at cold start" version would have: a player who opens the app in the morning (reminder gets scheduled for evening because no walk exists yet that day) and then finishes a walk mid-afternoon without reopening the app would otherwise still get evening's reminder even though the day's walk already happened. Rescheduling right after every walk-save closes that gap completely for any session where the app stays open or backgrounded (not killed) between those two points.

**Rejected: `SchedulableTriggerInputTypes.CALENDAR` with `repeats: true`** (a genuinely OS-level daily-repeating trigger that fires every day at the same local time indefinitely, with zero app opens required to keep it going). Rejected for two reasons, not one:
- **Correctness**: the "never fires if that day's walk is already tracked" guardrail can only be enforced by code that's actually running at the moment the notification would show. A `CALENDAR`-repeating trigger fires unconditionally at the OS level; suppressing its *content* per-day would need `Notifications.setNotificationHandler`'s async `handleNotification` callback to run a live `WalkRepository` query at fire time — which requires the JS runtime to still be alive in the background, not guaranteed once the app process has been fully killed by the OS. The reschedule-on-open/reschedule-on-save pattern, by contrast, can only ever schedule a notification once a check has already confirmed, at that exact moment, that no walk exists yet — it structurally cannot violate the guardrail for any day it actually schedules something.
- **Tone**: a trigger that keeps firing every single day forever, with or without the player ever touching the app again, is much closer to the daily-nag pattern `walk-start-experience`'s anti-pattern table already rejects (Duolingo's guilt mascot, BeReal's clock-gating) than this feature is supposed to be. The reschedule-on-open pattern is self-limiting — it can never outlive the player's own engagement by more than one day — which is a better fit for "opt-in and silent," not just simpler to build.

**Accepted, logged tradeoff (needs the founder's confirmation, see `proposal.md`'s Open Questions):** a player who enables the reminder and then never reopens the app again will receive **exactly one** reminder — for the very next occurrence of their chosen time — and then none after that, since nothing reschedules the next day's occurrence without an app-open or a walk-save event. This is a real, deliberate limitation of a no-backend, local-notification-only design, not an oversight; the alternative (make it truly recur without app opens) requires either a backend push mechanism or a background-task capability this project doesn't currently have (`expo-background-fetch`/`expo-task-manager` are not present dependencies), which is real scope growth for a 4-week, may-get-killed experiment.

## Decision 5 — Cancellation is scoped to this feature's own scheduled notification only

Before scheduling a fresh reminder (or when the toggle turns off), cancel any previously-scheduled walk-reminder notification via `Notifications.getAllScheduledNotificationsAsync()` filtered to `content.data?.type === 'walk-reminder'`, then `Notifications.cancelScheduledNotificationAsync(id)` for each match. **Never call `Notifications.cancelAllScheduledNotificationsAsync()`** — that would also cancel a still-pending Den-overflow notification scheduled by the unrelated existing feature, which shares the same `expo-notifications` scheduling queue. This is the one place these two notification features' underlying OS state could collide if not scoped carefully.

## Decision 6 — "Already walked today": reuse `calendarDayKey`, no new query

`checkAndScheduleWalkReminder` calls `walkRepository.getWalks()` (already called elsewhere in this same effect for the earned-trigger check's time-of-day learning) and checks whether any walk (either `startSource`) has `calendarDayKey(walk.startTime) === calendarDayKey(now)`. If so, skip scheduling for today entirely — no notification, and (per Decision 7) this day is not counted toward the ignore streak at all, since no reminder was ever actually presented to be ignored.

## Decision 7 — Consecutive-ignore detection: a concrete, single-slot reconciliation

**Definition of "ignored":** a calendar day on which a reminder was actually scheduled (i.e., `walkReminderPendingDate` was set to that day) and, once that day has fully passed, no walk (either `startSource`) exists with that `calendarDayKey`. A day where no reminder was scheduled at all (because a walk already existed, or the reminder was off) never counts either way.

**Rejected: literally tracking "did the player open the app in response."** The guardrail's own wording says "if the player doesn't open the app in response," but this codebase has no existing signal for "app came to foreground" at all — `App.tsx`'s mount effect runs once per cold start of the JS process, not a continuous foreground/background observer, and building one just for this counter would be a new, untested always-on listener for a nice-to-have precision gain. "Did a walk actually happen that day" is both the more meaningful signal for whether the reminder is helping (the entire point) and reuses data this app already persists and already tests (`WalkRepository`) — recommended over building new app-lifecycle instrumentation.

**Mechanism** — a single-slot reconciliation, run at the top of every `checkAndScheduleWalkReminder` call, before deciding whether to schedule today's reminder:
1. If `walkReminderPendingDate` is set and is **not** today's `calendarDayKey` (i.e., that day has fully passed):
   - Check whether any walk exists with that `calendarDayKey`.
   - If yes: reset `walkReminderConsecutiveIgnores` to 0, and increment `walkReminderFollowedCount` (Decision 10).
   - If no: increment `walkReminderConsecutiveIgnores`.
   - Clear `walkReminderPendingDate` either way (it's now resolved).
   - If `walkReminderConsecutiveIgnores` reaches 3: set `walkReminderEnabled = false` and stop — no scheduling this call, no user-facing message anywhere.
2. If still enabled after step 1, proceed to Decision 6's already-walked-today check and, if clear, schedule today's reminder and set `walkReminderPendingDate` to today's `calendarDayKey`, incrementing `walkReminderFiredCount` (Decision 10).

**Why auto-sleep flips `walkReminderEnabled` to `false`, not just a silent "stop scheduling" bypass that leaves the toggle showing on:** a Settings toggle that visually reads "on" while the feature has silently stopped doing anything is exactly the kind of hidden, undocumented state a fresh session — human or agent — would either miss entirely or mistake for a bug. Flipping the persisted flag keeps Settings honest (a player who opens it after an auto-sleep sees the toggle already off, with no special "we noticed" copy or dialog explaining why) while still satisfying "no message" literally.

## Decision 8 — One-tap permanent dismissal is satisfied via Settings only, not a notification action button

The guardrail's own wording is "from the notification itself **or** from settings" — an alternative, not a requirement for both. **This ships as a single, prominent toggle in `SettingsScreen.tsx`** with no confirmation dialog.

**Rejected: a real notification action button** (e.g. "Turn off" rendered directly on the OS notification, dismissible without opening the app at all, via `expo-notifications`' notification-category/action-identifier API). Technically possible, but adds a second, iOS/Android-divergent native surface (categories must be registered, the response listener must branch on `actionIdentifier`, and testing it needs on-device verification on both platforms) for a guardrail the settings-only path already satisfies per its own wording. Not worth the added native-testing burden for a time-boxed 4-week experiment that may be killed outright.

## Decision 9 — Tapping the reminder notification opens the Doorstep

Extend the existing `App.tsx` notification-tap listener (`addNotificationResponseReceivedListener` / `getLastNotificationResponseAsync`, both already branching on `response.notification.request.content.data?.type`) with a `'walk-reminder'` case that ensures the Doorstep is shown (`setShowDoorstep(true)`, closing whatever else might be open) — mirroring `home-dashboard/design.md` Decision 11's existing fix for the `den-overflow` case. The Doorstep, not the Den, is the right destination: it's already this app's default landing screen and its Start Walk button is the actual behavior this reminder exists to prompt.

## Decision 10 — 4-week measurement: durable counters on the same repository row, not the shared debug log alone

**Durable counters** (`walkReminderFiredCount`, `walkReminderFollowedCount`, `walkReminderExperimentStartedAt` — Decision 3) are the authoritative numbers for the kill-condition review, incremented directly by the reconciliation logic in Decision 7. **Individual per-event narrative** (each schedule/fire/auto-sleep) is additionally written to the existing `log()` (`src/utils/debugLog.ts`), matching how `scheduler.ts` already calls `log('NOTIFICATION_SCHEDULED', ...)` for the overflow notification.

**Rejected: deriving the 4-week numbers purely by parsing the existing debug log text.** `DebugLogScreen.tsx` already exposes a one-tap `clearDebugLog()` for a completely unrelated purpose (clearing general app noise); mixing this experiment's only record of its own kill-condition data into that same clearable, general-purpose log means a single unrelated "Clear Log" tap during the 4-week window could silently and permanently destroy the founder's own decision data, with no separate signal that it happened. Durable counters on `NotificationRepository`'s row are immune to that action entirely.

**Surfacing:** add a small, fixed summary block to the top of `DebugLogScreen.tsx` (e.g. "Walk Reminder — started Aug 22 · fired 12 · followed 8") reading directly from `NotificationRepository.getState()`, above its existing scrollable log preview — reusing the one screen this app already has for founder-facing internal diagnostics, rather than building a second one just for this. Shown only once `walkReminderExperimentStartedAt` is non-null (never shown, not shown as zeroes, before the player has ever turned the reminder on).

## Decision 11 — Reminder copy (new, not reused verbatim — flagged for the founder to bless)

Matching the accepted example's tone ("Looks like you two were out this morning — a walk is waiting to be claimed" — place/object-subject, optional-feeling, never "you"-as-order) but written for a walk that hasn't happened yet, not a retroactive claim:

**Proposed body:** *"There's a little more territory out there, whenever you two are ready for it."*

No title override (matches the existing overflow notification's own `content` shape, which sets `body` only and lets the OS show the app's own name as the title).

Checked against the rejected-copy table: no order ("whenever... ready," not "time for"), no guilt mascot (no dog waiting/sad framing), no loss-framed number (no days-since, no countdown), no invented urgency (no deadline). This is new copy, not a reuse of anything already resolved elsewhere in this project's decision log — flagged in `proposal.md`'s Open Questions for an explicit founder sign-off before it ships, the same way `notificationDecision.ts`'s own `overflowNotificationBody` flagged its "124 literal vs. illustrative" judgment call for its author to confirm.

## Decision 12 — Phase classification is recorded in `game-phases/spec.md`, not silently assumed

See `proposal.md`'s "Phase" section for the full argument. The `specs/game-phases/spec.md` delta below adds this feature as a second named phase-pull-forward exception, mirroring the existing `visits` exception's exact rhetorical pattern in the Engagement Mechanic Rollout requirement, on Phase 2's own requirement text this time (since this is a notification, not a Den/Pack/anti-snowball mechanic, `visits`'s own requirement isn't the right one to extend — Phase 2's requirement text, which already names the evening-recap notification as the category this belongs to, is).

## Decisions — 2026-10-18 update

- **2026-10-18: Rolling 7-day window replaces single-next-day scheduling (supersedes Decision 4's "exactly one reminder" tradeoff).** Why: the owner's core need is that reminders arrive even when the app isn't opened for days; one-shot-per-open meant a killed app got one reminder, then silence. On every app open and after every saved walk (tracked or manual), all pending reminders (`data.kind === 'walk-reminder'`, identifier `walk-reminder-YYYY-MM-DD`; never the overflow notification) are cancelled and one-shot DATE triggers are scheduled for the next `REMINDER_WINDOW_DAYS = 7` FUTURE days via the pure `planReminderDates` (today skipped if walked or time passed, and the window then extends a day so 7 reminders are always pending; local-field dates, DST-safe). What stays: opt-in/off by default, silent in-app handler, ignore-streak auto-off evaluated on open (now resolves every passed window day, fired count tallied at resolution), and auto-off cancels the whole window. Still rejected: OS-repeating CALENDAR/DAILY trigger (cannot honour skip-if-walked). Residual limit: after 7 days without opening, reminders stop; the overflow notification is still scheduled on app open only. Android: dedicated `walk-reminder` and `den-overflow` channels (importance DEFAULT) created before any permission request/schedule; Settings requests permission on toggle-on and shows a hint plus `Linking.openSettings()` when denied. No `SCHEDULE_EXACT_ALARM`: inexact delivery is accepted.


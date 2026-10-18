## 0. Sequencing and pre-flight

- [x] 0.1 Read `design.md` in full, especially Decisions 3, 4, 7, and 10 — the schema migration shape, the reschedule-on-open-and-on-save scheduling mechanism, the single-slot ignore-reconciliation logic, and the durable-counter measurement approach are all assumed settled here, not open questions.
- [x] 0.2 Confirm `proposal.md`'s Open Questions (pulled from the backlog, and the accepted killed-app scheduling tradeoff) have the founder's/user's explicit sign-off before starting section 3 onward. Sections 1-2 (pure logic, no wiring) are safe to build regardless.

## 1. Pure decision logic — lowest risk, no native dependency, buildable first

- [x] 1.1 New `src/notifications/walkReminderDecision.ts`, mirroring `notificationDecision.ts`'s style (pure functions, no `expo-notifications` import, unit-testable without a native build):
  - `hasWalkOnDay(walks: Walk[], dayKey: string): boolean` — reuses `calendarDayKey` from `src/utils/manualWalkLog.ts`, checks either `startSource`.
  - `reconcileWalkReminderIgnoreStreak(state, now, walks)`: implements `design.md` Decision 7's single-slot reconciliation exactly — resolves `walkReminderPendingDate` if it's a past day, updates `walkReminderConsecutiveIgnores`/`walkReminderFollowedCount`, auto-sleeps (`walkReminderEnabled = false`) at 3, returns the updated state.
  - `shouldScheduleWalkReminderToday(state, now, walks)`: after reconciliation, returns whether a reminder should be scheduled today (enabled, no walk yet today) per Decision 6.
  - `defaultWalkReminderFields()`: the new fields' default values, for `NotificationRepository` defaults (Decision 3).
  - Also added `recordWalkReminderScheduled(state, now)`: the pure bookkeeping update for Decision 7 step 2 (sets `walkReminderPendingDate`/increments `walkReminderFiredCount`), kept separate from the actual OS scheduling call so it stays unit-testable and is only applied after a real schedule succeeds (never speculatively) — not explicitly named in this task, but needed to unit-test firedCount without a native build (task 1.2).
- [x] 1.2 Unit tests in `src/notifications/__tests__/walkReminderDecision.test.ts` covering: the auto-sleep boundary (2 vs. 3 consecutive ignored days); a walked day resetting the streak regardless of whether the walk happened before or after the reminder's set time; a day with no reminder scheduled not counting either way; `shouldScheduleWalkReminderToday` returning false when a walk already exists today, false when disabled, true otherwise; `walkReminderFiredCount`/`walkReminderFollowedCount` incrementing correctly across a short multi-day sequence.

## 2. Storage — extend `NotificationRepository`, first schema migration in this project

- [x] 2.1 Add the new fields (`design.md` Decision 3's list) to `NotificationBookkeepingState` in `notificationDecision.ts` (interface stayed there; its 8 new fields' actual default values live in `walkReminderDecision.ts`'s `defaultWalkReminderFields()`, spread into `defaultNotificationBookkeepingState()` to keep one source of truth without a circular runtime import — `walkReminderDecision.ts` only takes a type-only import of the interface back).
- [x] 2.2 `src/storage/sqliteNotificationRepository.ts`: added the new columns to `rowToState`/the insert/update statements, and a real migration step (`ALTER TABLE notification_bookkeeping ADD COLUMN ...` per new column, guarded via catch-and-ignore on the "duplicate column name" error — mirrors `sqliteDenEconomyRepository.ts`'s own `addColumnIfMissing` idiom exactly). Verified by hand with a standalone Node script (`node:sqlite`, the same SQLite engine `expo-sqlite` wraps) simulating: (a) an old row with only the original 3 columns, confirming the migration adds the new columns with correct defaults and doesn't throw; (b) running the migration a second time against an already-migrated table, confirming the duplicate-column guard doesn't throw; (c) a fresh-install `CREATE TABLE` (already including every column) followed by the same `ALTER TABLE` calls, confirming no throw there either. Not wired into the Jest suite — this project has no `expo-sqlite` jest mock and no existing sqlite repository (including `den_economy`'s own prior migration) has automated coverage either; this matches that existing, established gap rather than introducing new test infrastructure unprompted.
- [x] 2.3 `src/storage/inMemoryNotificationRepository.ts`: no change needed — it already round-trips the whole `NotificationBookkeepingState` object rather than mapping individual fields, so the new fields pass through automatically.
- [x] 2.4 Extended `src/storage/__tests__/notificationRepository.contract.test.ts` (the existing suite, in-memory only — see task 2.2's note: no sqlite implementation in this codebase has jest coverage to extend) with tests asserting the new fields default correctly and round-trip across reads.

## 3. Scheduling — extend `scheduler.ts`, reuse the existing `expo-notifications` wiring

- [x] 3.1 `src/notifications/scheduler.ts`: added `scheduleWalkReminderNotification(hour, minute, body, now?)` — same shape as `scheduleOverflowNotification`. Generalized the existing `nextOccurrenceOfHour` to `nextOccurrenceOfTime(hour, minute, now)` and updated `scheduleOverflowNotification`'s call site to pass `0` minutes (no behavior change to the overflow path). Tags `content.data` as `WALK_REMINDER_NOTIFICATION_DATA = { type: 'walk-reminder' }`, mirroring `DEN_OVERFLOW_NOTIFICATION_DATA`.
- [x] 3.2 Added `cancelScheduledWalkReminder()` in `scheduler.ts`: `Notifications.getAllScheduledNotificationsAsync()` filtered to `content.data?.type === 'walk-reminder'`, cancels each match via `cancelScheduledNotificationAsync` — never `cancelAllScheduledNotificationsAsync()`.
- [x] 3.3 New `checkAndScheduleWalkReminder(deps, now?)` in a new sibling file `src/notifications/walkReminder.ts` (kept `earnedTrigger.ts` scoped to its own documented "Den-economy overflow only" purpose rather than overloading it) — reads `NotificationRepository` state and `WalkRepository.getWalks()`, runs `reconcileWalkReminderIgnoreStreak` then always cancels any previously-scheduled reminder, then `shouldScheduleWalkReminderToday`; only if true does it request notification permission lazily and call `scheduleWalkReminderNotification`, persisting the bookkeeping update via `recordWalkReminderScheduled`. Also emits the narrative `log()` calls for task 6.2 (scheduled/followed/ignored/auto-sleep) here, diffing before/after reconciliation state.
- [x] 3.4 New `src/notifications/__tests__/walkReminder.test.ts`, mirroring `earnedTrigger.test.ts`'s `expo-notifications` mock shape, covering: schedules when enabled and no walk today; skips silently when a walk exists today (and doesn't count it toward `walkReminderFiredCount`); skips when disabled; cancels the previously-scheduled walk-reminder notification only (an unrelated `den-overflow`-tagged one is left alone) before deciding whether to reschedule; reschedules correctly across two consecutive calls with a changed time; a walk saved mid-session after a reminder was already scheduled prevents any further scheduling that day. All 6 tests pass.

## 4. `App.tsx` wiring

- [x] 4.1 In the existing merged mount effect (right after `checkAndScheduleEarnedTriggerNotification`, per `design.md` Decision 4), added `await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) => log('WALK_REMINDER_CHECK_ERROR', { error: String(err) }))`.
- [x] 4.2 `checkAndScheduleWalkReminder` is called again immediately after `finishWalk`'s `walkRepository.saveWalk(finishedWalk)` succeeds, and immediately after `logMissedWalk`'s `walkRepository.saveWalk(manualWalk)` succeeds — per `design.md` Decision 4's gap-closing rationale.
- [x] 4.3 Extended the existing notification-tap listener (`addNotificationResponseReceivedListener` and the matching `getLastNotificationResponseAsync` check) with a `data.type === 'walk-reminder'` branch calling `setShowDen(false); setShowDoorstep(true)` — per `design.md` Decision 9.
- [x] 4.4 `npx tsc --noEmit` clean after this section (verified again at the end of the full change — see task 8.1).

## 5. Settings screen and DoorstepMenu entry point

- [x] 5.1 `npx expo install @react-native-community/datetimepicker` (new native dependency, per `design.md` Decision 2) — resolved to `8.4.4` for SDK 54. **A dev-client rebuild (`npx expo run:android` / `run:ios`) is still needed before this can be exercised on-device** — flagged for the user, same as the existing `expo-notifications` note in `README.md` (also updated, task 7.2).
- [x] 5.2 New `src/components/SettingsScreen.tsx`: a toggle for the walk reminder, and — only when on — a "Reminder time" row that opens the native time picker (Android: `DateTimePickerAndroid.open()`, the package's own documented imperative idiom to avoid a dialog reopening on every re-render; iOS: an inline spinner inside a small bottom-sheet `Modal`, mirroring `DoorstepMenu.tsx`'s existing `Modal` pattern rather than introducing a new one). Turning the toggle off requires no confirmation dialog. Takes `notificationRepository`/`walkRepository` as props from `App.tsx`, matching `LogMissedWalkScreen.tsx`'s established direct-repository-props convention (not a global singleton import).
- [x] 5.3 On confirming a time (whether turning the reminder on for the first time, or changing the time while already on), calls `checkAndScheduleWalkReminder` immediately.
- [x] 5.4 On toggling off, persists `walkReminderEnabled = false` and calls `cancelScheduledWalkReminder()` immediately.
- [x] 5.5 `src/components/DoorstepMenu.tsx`: added a third row, "Settings," alongside the existing two, wired to a new required `onOpenSettings` callback prop. `DoorstepScreen.tsx` threads this through as its own new `onOpenSettings` prop (same pattern as its existing `onOpenDebugLog`/`onOpenLogMissedWalk`).
- [x] 5.6 `App.tsx`: added `showSettings` boolean state (default `false`), wired `DoorstepScreen`'s new `onOpenSettings` prop to `setShowDoorstep(false); setShowSettings(true)`, and added a `showSettings` render branch mirroring `showDebugLog`'s, with `SettingsScreen`'s `onClose` set to `setShowSettings(false); setShowDoorstep(true)`.

## 6. Measurement surface

- [x] 6.1 `src/components/DebugLogScreen.tsx`: added a small fixed summary block above the existing scrollable log preview ("Walk Reminder — started ... · fired N · followed N"), reading `walkReminderExperimentStartedAt`/`walkReminderFiredCount`/`walkReminderFollowedCount` from `NotificationRepository.getState()` (now a required prop on this screen) — shown only when `walkReminderExperimentStartedAt` is non-null.
- [x] 6.2 Added `log()` calls in `scheduler.ts` (`WALK_REMINDER_SCHEDULED`, matching `NOTIFICATION_SCHEDULED`'s own style) and `walkReminder.ts` (`WALK_REMINDER_FOLLOWED`, `WALK_REMINDER_IGNORED`, `WALK_REMINDER_AUTO_SLEEP`, diffing before/after reconciliation state) — narrative trace, separate from and in addition to the durable counters.

## 7. Spec and README follow-up

- [ ] 7.1 Confirm this change's `specs/walk-reminder/spec.md` delta is applied via `/opsx:apply` once section 8's manual verification passes, per `CLAUDE.md`'s rule against editing `openspec/specs/` directly. **Not run by `senior-app-developer`.**
- [x] 7.2 Updated `README.md`'s "Notifications" bullet to describe both notification types, added the `@react-native-community/datetimepicker` rebuild note alongside the existing `expo-notifications` one, and added `SettingsScreen.tsx`/`walkReminderDecision.ts`/`walkReminder.ts` to the Components/Notifications folder-map bullets.
- [x] 7.3 Superseded: phase gating was removed by owner decision on 2026-10-18; `openspec/config.yaml` now points at `game-backlog`.

## 8. Automated coverage

- [x] 8.1 `npx tsc --noEmit` clean across the whole change.
- [x] 8.2 Full test suite passes: 32 suites, 383 tests, 0 failures (includes this change's 2 new test files plus the 2 new/1 updated assertion in the existing `notificationRepository.contract.test.ts`, required only because `NotificationBookkeepingState` gained new required fields).

## 9. Manual on-device verification

**Needs a real device/emulator — left for the user to run, same pattern as every prior change in this project. Notification scheduling/delivery and the native time picker are real OS behavior, not fully testable in Jest.**

- [ ] 9.1 Turn the reminder on, set a time a few minutes out, confirm it fires with OS-default sound/vibration only (no custom escalation), and confirm no notification appears at all if a walk is logged before that time arrives.
- [ ] 9.2 Confirm turning the reminder on requires setting a time via the real native time picker, and that no reminder was scheduled before a time was set.
- [ ] 9.3 Log a walk (tracked or manual) after a reminder has already been scheduled for later the same day, and confirm the scheduled notification is actually cancelled (does not fire later that day).
- [ ] 9.4 Force 3 consecutive days with a scheduled-and-fired reminder and no walk on any of them (advancing the device clock or backdating state in a debug build), and confirm the reminder turns itself off with no dialog or message, and Settings shows it off on next open.
- [ ] 9.5 Confirm a walked day resets the streak — 2 ignored days followed by a walked day followed by 2 more ignored days should NOT trigger auto-sleep (needs 3 truly consecutive).
- [ ] 9.6 Tap the reminder notification and confirm it opens the app to the Doorstep, not the Den or a crash.
- [ ] 9.7 Confirm turning the reminder off in Settings is a single tap with no confirmation dialog, and immediately cancels any pending scheduled notification.
- [ ] 9.8 Confirm the Debug Log screen's new summary block shows the correct fired/followed counts and start date after a few days of real use, and that tapping "Clear Log" does not reset them.
- [ ] 9.9 Confirm the accepted killed-app tradeoff in practice: force-quit the app (not just background it) for more than a day with the reminder enabled and confirm no more than one reminder fires until the app is reopened — this is expected behavior per `design.md` Decision 4, not a bug, but worth confirming it matches the design rather than silently misbehaving some other way.
- [ ] 9.10 Confirm the schema migration (task 2.2) works correctly against a real pre-existing install: install a build from before this change, use the app enough to create a `notification_bookkeeping` row, then update to this change's build and confirm no crash and correct defaults for the new columns.
- [ ] 9.11 Verify the 7-day window survives force-quit: enable the reminder, force-quit, confirm the reminder fires at the set time and Debug Log's "Pending reminders" list shows 7 dates after reopening (on Samsung/Xiaomi also with battery set to Unrestricted).

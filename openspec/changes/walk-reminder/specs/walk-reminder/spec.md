Note for whoever applies this delta: this is a brand-new capability — there is no existing `openspec/specs/walk-reminder/spec.md` to diff against. On apply, this becomes a new spec file; its `## Purpose` should read: "Defines the opt-in daily walk reminder — a time-boxed, player-configured local notification that nudges toward starting a walk, fenced by guardrails (opt-in, player's own time, one per day, silent, auto-sleeping, skipped whenever the day's walk is already done, one-tap permanent dismissal) designed specifically to keep a clock-fired reminder from becoming the guilt/streak/urgency mechanic this game's tone otherwise forbids. See `openspec/changes/archive/2026-08-22-walk-start-experience/proposal.md`'s 'Notification Timing (resolved)' section for the guardrails' own origin and rationale, not re-litigated here."

## ADDED Requirements

### Requirement: The Reminder Is Off by Default and Player-Enabled
The system SHALL ship the walk reminder disabled for every player until they explicitly turn it on from Settings. The system SHALL NOT enable it automatically, by default, or as a result of any other action.

#### Scenario: Fresh install has the reminder off
- **WHEN** a player opens Settings for the first time
- **THEN** the walk reminder toggle SHALL show as off, and no reminder notification SHALL be scheduled

### Requirement: The Player Sets Their Own Reminder Time
When the player enables the reminder, the system SHALL let them choose the time of day it fires via a real time picker. The system SHALL NOT choose or suggest a fixed time on the player's behalf as the only option.

#### Scenario: Enabling the reminder requires picking a time
- **WHEN** the player turns the reminder toggle on
- **THEN** the system SHALL present a time picker for the player to set their own reminder time

### Requirement: At Most One Reminder Notification Per Day
The system SHALL schedule at most one walk-reminder notification per calendar day, at the player's chosen local time.

#### Scenario: No duplicate reminder the same day
- **WHEN** the reminder is enabled and a notification has already been scheduled or fired for the current calendar day
- **THEN** the system SHALL NOT schedule a second one for that same day

### Requirement: Silent Delivery
The walk-reminder notification SHALL use standard OS default delivery only — no custom sound, no escalated vibration pattern, and no visual treatment beyond a normal local notification.

#### Scenario: Reminder delivery matches OS defaults
- **WHEN** the walk-reminder notification is scheduled
- **THEN** it SHALL specify no custom sound or vibration escalation beyond the operating system's own default notification behavior

### Requirement: The Reminder Never Fires if the Day's Walk Already Happened
Before scheduling or delivering the reminder for a given calendar day, the system SHALL check whether a walk (tracked or manually-logged, regardless of `Walk.startSource`) already exists for that day, and SHALL skip scheduling it silently if one does — with no notification, message, or visible indication that a check happened.

#### Scenario: A walk already logged today suppresses the reminder
- **WHEN** the reminder is enabled and a walk with today's calendar date already exists
- **THEN** the system SHALL NOT schedule or deliver a reminder notification for today, and SHALL show no message indicating it was skipped

#### Scenario: A walk completed after the reminder was scheduled cancels it
- **WHEN** a walk is saved (tracked walk finished, or manually logged) on a day a reminder notification is already scheduled for later that same day
- **THEN** the system SHALL cancel that day's scheduled reminder

### Requirement: Auto-Sleep After 3 Consecutive Ignored Reminders
The system SHALL count a calendar day as "ignored" only when a reminder was actually scheduled for that day and, once the day has fully passed, no walk exists for that day. When 3 such days occur consecutively (with no walk-having day resetting the count in between), the system SHALL turn the reminder off on its own, updating the same setting the player's manual toggle controls, with no notification, dialog, or copy of any kind announcing that this happened.

#### Scenario: Three ignored days in a row turns the reminder off
- **WHEN** a reminder was scheduled and fired on 3 consecutive calendar days with no walk on any of those days
- **THEN** the system SHALL turn the reminder off, and the next time Settings is opened the toggle SHALL show as off, with no message explaining why

#### Scenario: A walked day resets the ignored streak
- **WHEN** a walk exists for a calendar day a reminder was scheduled for
- **THEN** the system SHALL reset the consecutive-ignored count to zero, whether or not that walk happened before or after the reminder's scheduled time that day

#### Scenario: A day with no reminder scheduled does not count toward the streak
- **WHEN** a calendar day passes with no reminder scheduled for it (the reminder was off, or a walk already existed before scheduling was attempted)
- **THEN** that day SHALL NOT be counted as ignored or as walked for the purposes of the auto-sleep streak

### Requirement: One-Tap Permanent Dismissal
The system SHALL provide a way, reachable from Settings in exactly one tap, to turn the reminder off permanently, with no confirmation dialog.

#### Scenario: Turning the reminder off
- **WHEN** the player taps the reminder toggle in Settings while it is on
- **THEN** the system SHALL turn it off immediately, with no confirmation dialog, and cancel any currently scheduled reminder notification

### Requirement: No Guilt, Streak, or Urgency Framing in Reminder Copy
The walk-reminder notification's copy SHALL NOT include an order phrased as a command, a days-since-last-walk count or any other loss-framed number, a sad or guilt-invoking mascot reference, or an invented deadline or expiring-window claim.

#### Scenario: Reminder copy passes the anti-pattern check
- **WHEN** the walk-reminder notification's body text is composed
- **THEN** it SHALL NOT contain a command-phrased instruction, a days-since count, guilt-mascot language, or urgency/deadline language

### Requirement: A Local, Eyeball-Friendly 4-Week Measurement Record
The system SHALL maintain a durable, locally-persisted record of when the reminder experiment began, how many reminders it has fired, and how many of those were followed by a walk that same day, and SHALL make this record visible somewhere in the app for manual review, without requiring a new analytics pipeline or network call.

#### Scenario: Measurement counters survive unrelated log clearing
- **WHEN** the player clears the general-purpose debug log
- **THEN** the walk-reminder experiment's own fired/followed counters and start date SHALL be unaffected

#### Scenario: Measurement record is visible before a kill-condition decision
- **WHEN** the reminder has been enabled for any length of time
- **THEN** its fired count, followed count, and experiment start date SHALL be visible somewhere in the app without needing to inspect raw log text

## MODIFIED Requirements

(2026-10-18 update: three daily slots. These replace the same-named requirements above; the rest of the capability is unchanged.)

### Requirement: The Player Sets Their Own Reminder Time
The system SHALL offer three independent daily reminder slots (Morning, Noon, Evening), each with its own on/off switch and a real time picker. All slots SHALL be off by default, at suggested times 08:00 / 13:00 / 18:30 that the player can change. The system SHALL NOT enable any slot automatically. A pre-existing single reminder time SHALL migrate into the slot it fits (before 11:00 Morning, 11:00-15:59 Noon, otherwise Evening), keeping its enabled state.

#### Scenario: Enabling a slot
- **WHEN** the player turns a slot's switch on (asking for notification permission first if no slot was on yet)
- **THEN** the slot SHALL be scheduled at its shown time, and the player MAY tap the time to change it with a time picker

### Requirement: At Most One Reminder Notification Per Slot Per Day
The system SHALL schedule at most one walk-reminder notification per enabled slot per calendar day, at that slot's local time, for the next 7 future days.

#### Scenario: No duplicate reminder in the same slot
- **WHEN** reminders are replanned
- **THEN** each enabled slot SHALL have exactly one pending reminder per day, identified `walk-reminder-YYYY-MM-DD-<slotId>`

### Requirement: A Slot's Reminder Never Fires if Its Own Walk Already Happened
A slot's reminder on a day SHALL be skipped if a walk (tracked or manual) STARTED inside that slot's window: from the previous enabled slot's time that day (00:00 for the first enabled slot) up to this slot's time. A walk in one slot's window SHALL NOT silence the other slots.

#### Scenario: A morning walk keeps the evening reminder
- **WHEN** all three slots are on and a walk started at 07:30
- **THEN** the Morning reminder SHALL be skipped for that day and the Noon and Evening reminders SHALL still be scheduled

### Requirement: Per-Slot Auto-Sleep After 3 Consecutive Ignored Reminders
A slot SHALL turn itself off silently after 3 consecutive days on which its reminder was scheduled but no walk started in its window. A walked day SHALL reset only that slot's streak.

#### Scenario: One slot falls asleep
- **WHEN** the Evening slot goes 3 consecutive days with no walk in its window while the Morning slot is followed
- **THEN** only the Evening slot SHALL be switched off, with no message

### Requirement: Foreground Delivery
Walk reminders SHALL be shown as a banner (with the channel's sound) even while the app is open, so a reminder is never invisible to a player who has the app in front.

#### Scenario: Reminder arrives while the app is open
- **WHEN** a reminder fires while the app is in the foreground
- **THEN** a banner SHALL be shown

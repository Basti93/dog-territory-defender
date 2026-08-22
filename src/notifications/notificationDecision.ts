import { DenEconomyState } from '../economy/denEconomy';
import { storageCap } from '../economy/formulas';

// Pure decision logic for the earned-trigger notification (Den-economy
// overflow only — see openspec/changes/walk-start-notifications/proposal.md's
// scope cut). Deliberately has no dependency on `expo-notifications` so it
// stays unit-testable without a native/dev-client build.

export type TimeOfDayBucket = 'morning' | 'midday' | 'evening';

export interface NotificationBookkeepingState {
  /** Whether the current, still-active overflow has already had a notification surfaced for it. Reset to false once treats drop back below the storage cap, so the next overflow can fire again. */
  overflowSurfaced: boolean;
  /** Most recently learned coarse delivery-time bucket, cached so scheduling doesn't need to rescan WalkRepository every check. */
  learnedTimeOfDayBucket: TimeOfDayBucket | null;
}

export function defaultNotificationBookkeepingState(): NotificationBookkeepingState {
  return { overflowSurfaced: false, learnedTimeOfDayBucket: null };
}

function isOverflowing(denState: DenEconomyState): boolean {
  return denState.treats >= storageCap(denState.doghouseLevel, denState.level, denState.bakeryLevel, denState.sniffGardenLevel);
}

/**
 * Decides whether the earned-trigger notification should fire right now.
 * Fires only when treats are actually at/over the storage cap AND that
 * overflow hasn't already been surfaced — never a bare clock reminder.
 */
export function shouldFireOverflowNotification(
  denState: DenEconomyState,
  bookkeeping: NotificationBookkeepingState
): boolean {
  return isOverflowing(denState) && !bookkeeping.overflowSurfaced;
}

/**
 * Clears the "already surfaced" flag once the overflow condition itself has
 * cleared (player spent treats below the cap), so a future overflow is
 * treated as a new, unclaimed event rather than staying permanently silent.
 */
export function resetSurfacedFlagIfOverflowCleared(
  denState: DenEconomyState,
  bookkeeping: NotificationBookkeepingState
): NotificationBookkeepingState {
  if (!isOverflowing(denState) && bookkeeping.overflowSurfaced) {
    return { ...bookkeeping, overflowSurfaced: false };
  }
  return bookkeeping;
}

// Bucket hour boundaries — a first-pass numeric threshold, not empirically
// tuned. Logged per project convention in design.md's Decisions section.
// Local hour-of-day ranges, in the device's local time:
//   morning: 5:00–11:59, midday: 12:00–17:59, evening: 18:00–4:59 (wraps past midnight).
function bucketForHour(hour: number): TimeOfDayBucket {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'midday';
  return 'evening';
}

/**
 * Learns the player's coarse usual walk time from past walk start times.
 * Returns null when there's no walk history yet to learn from — callers
 * should stay silent rather than guess a delivery time.
 */
export function learnTimeOfDayBucket(pastWalkStartTimes: number[]): TimeOfDayBucket | null {
  if (pastWalkStartTimes.length === 0) return null;

  const counts: Record<TimeOfDayBucket, number> = { morning: 0, midday: 0, evening: 0 };
  for (const startTime of pastWalkStartTimes) {
    counts[bucketForHour(new Date(startTime).getHours())]++;
  }

  const buckets: TimeOfDayBucket[] = ['morning', 'midday', 'evening'];
  return buckets.reduce((best, bucket) => (counts[bucket] > counts[best] ? bucket : best), buckets[0]);
}

export interface DoorstepOverflowLineResolution {
  /** Whether the Doorstep's "The Doghouse is full" away-strip line should show right now. */
  showLine: boolean;
  /** Persist this immediately (before running checkAndScheduleEarnedTriggerNotification) whenever `showLine` is true — see the doc comment below. */
  nextBookkeeping: NotificationBookkeepingState;
}

/**
 * The Doorstep's own overflow-line resolution
 * (openspec/changes/home-dashboard/design.md Decision 6) — reuses the exact
 * same `overflowSurfaced` bookkeeping the earned-trigger push notification
 * uses (`shouldFireOverflowNotification`/`resetSurfacedFlagIfOverflowCleared`
 * above), rather than a second, parallel "have we shown this" flag. Callers
 * MUST persist `nextBookkeeping` (claiming the flag) before running
 * `checkAndScheduleEarnedTriggerNotification` — otherwise both channels can
 * race and the player gets a push notification for an overflow they're
 * already looking at on the Doorstep in the same app-open. See
 * App.tsx's merged mount effect and notifications/earnedTrigger.ts.
 */
export function resolveDoorstepOverflowLine(
  denState: DenEconomyState,
  bookkeeping: NotificationBookkeepingState
): DoorstepOverflowLineResolution {
  const cleared = resetSurfacedFlagIfOverflowCleared(denState, bookkeeping);
  const showLine = shouldFireOverflowNotification(denState, cleared);
  const nextBookkeeping = showLine ? { ...cleared, overflowSurfaced: true } : cleared;
  return { showLine, nextBookkeeping };
}

// Accepted copy, reused verbatim from
// openspec/changes/walk-start-experience/proposal.md's "Notification Timing
// (resolved)" section: "Your Treat Bakery overflowed! 124 treats waiting."
// "124" there is that document's illustrative example number, not a literal
// constant — a fixed number would misreport the player's real treats total,
// which breaks the whole feature's "only ever reports something already
// true" guardrail. This substitutes the player's real overflowed treats
// count into that exact sentence shape. Flagged as a judgment call in this
// change's implementation report — worth a quick confirm with the source
// document's author if a literal "124" was actually intended.
export function overflowNotificationBody(treatsWaiting: number): string {
  return `Your Treat Bakery overflowed! ${Math.floor(treatsWaiting)} treats waiting.`;
}

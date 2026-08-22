import { Walk } from '../../types';
import { calendarDayKey } from '../../utils/manualWalkLog';
import {
  defaultWalkReminderFields,
  hasWalkOnDay,
  reconcileWalkReminderIgnoreStreak,
  recordWalkReminderScheduled,
  shouldScheduleWalkReminderToday,
} from '../walkReminderDecision';
import { defaultNotificationBookkeepingState, NotificationBookkeepingState } from '../notificationDecision';

// Local calendar days, spaced 24h apart in the same timezone the test runner
// uses (matches manualWalkLog.ts's own local-day-boundary convention).
function atDay(dayOffset: number, hour = 12): number {
  return new Date(2026, 0, 1 + dayOffset, hour, 0, 0).getTime();
}

function walkOn(dayOffset: number, hour = 12): Walk {
  return {
    id: `walk-${dayOffset}-${hour}`,
    startTime: atDay(dayOffset, hour),
    locations: [],
    closed: true,
    startSource: 'button',
  };
}

function enabledState(overrides: Partial<NotificationBookkeepingState> = {}): NotificationBookkeepingState {
  return {
    ...defaultNotificationBookkeepingState(),
    walkReminderEnabled: true,
    walkReminderHour: 8,
    walkReminderMinute: 0,
    ...overrides,
  };
}

describe('defaultWalkReminderFields', () => {
  it('is off, unset, and zeroed by default', () => {
    const fields = defaultWalkReminderFields();
    expect(fields.walkReminderEnabled).toBe(false);
    expect(fields.walkReminderHour).toBeNull();
    expect(fields.walkReminderMinute).toBeNull();
    expect(fields.walkReminderConsecutiveIgnores).toBe(0);
    expect(fields.walkReminderPendingDate).toBeNull();
    expect(fields.walkReminderFiredCount).toBe(0);
    expect(fields.walkReminderFollowedCount).toBe(0);
    expect(fields.walkReminderExperimentStartedAt).toBeNull();
  });
});

describe('hasWalkOnDay', () => {
  it('finds a walk on the given day regardless of startSource', () => {
    const manualWalk: Walk = { ...walkOn(0), startSource: 'manual-log' };
    expect(hasWalkOnDay([manualWalk], calendarDayKey(atDay(0)))).toBe(true);
  });

  it('returns false when no walk falls on the given day', () => {
    expect(hasWalkOnDay([walkOn(0)], calendarDayKey(atDay(1)))).toBe(false);
  });
});

describe('reconcileWalkReminderIgnoreStreak — auto-sleep boundary', () => {
  it('does NOT auto-sleep at 2 consecutive ignored days', () => {
    // Day 0 pending, day 1 pending (after day 0 resolved), then check on day 2.
    let state = enabledState({ walkReminderPendingDate: dayKey(0), walkReminderConsecutiveIgnores: 1 });
    // Resolve day 0 (no walk) -> ignores becomes 2.
    state = reconcileWalkReminderIgnoreStreak(state, atDay(1), []);
    expect(state.walkReminderConsecutiveIgnores).toBe(2);
    expect(state.walkReminderEnabled).toBe(true);
  });

  it('auto-sleeps (flips walkReminderEnabled to false) at exactly 3 consecutive ignored days', () => {
    let state = enabledState({ walkReminderPendingDate: dayKey(2), walkReminderConsecutiveIgnores: 2 });
    state = reconcileWalkReminderIgnoreStreak(state, atDay(3), []);
    expect(state.walkReminderConsecutiveIgnores).toBe(3);
    expect(state.walkReminderEnabled).toBe(false);
  });

  it('a walked day resets the streak to 0 regardless of whether the walk was before or after the reminder time that day', () => {
    // Walk logged earlier than the reminder's set hour (8:00) on the pending day.
    const earlyWalkState = reconcileWalkReminderIgnoreStreak(
      enabledState({ walkReminderPendingDate: dayKey(0), walkReminderConsecutiveIgnores: 2 }),
      atDay(1),
      [walkOn(0, 6)]
    );
    expect(earlyWalkState.walkReminderConsecutiveIgnores).toBe(0);
    expect(earlyWalkState.walkReminderEnabled).toBe(true);

    // Walk logged later than the reminder's set hour (8:00) on the pending day.
    const lateWalkState = reconcileWalkReminderIgnoreStreak(
      enabledState({ walkReminderPendingDate: dayKey(0), walkReminderConsecutiveIgnores: 2 }),
      atDay(1),
      [walkOn(0, 20)]
    );
    expect(lateWalkState.walkReminderConsecutiveIgnores).toBe(0);
    expect(lateWalkState.walkReminderEnabled).toBe(true);
  });

  it('increments walkReminderFollowedCount when the pending day was walked', () => {
    const state = reconcileWalkReminderIgnoreStreak(
      enabledState({ walkReminderPendingDate: dayKey(0), walkReminderFollowedCount: 4 }),
      atDay(1),
      [walkOn(0)]
    );
    expect(state.walkReminderFollowedCount).toBe(5);
  });

  it('clears walkReminderPendingDate once the day is resolved, whether walked or not', () => {
    const walked = reconcileWalkReminderIgnoreStreak(enabledState({ walkReminderPendingDate: dayKey(0) }), atDay(1), [walkOn(0)]);
    expect(walked.walkReminderPendingDate).toBeNull();

    const ignored = reconcileWalkReminderIgnoreStreak(enabledState({ walkReminderPendingDate: dayKey(0) }), atDay(1), []);
    expect(ignored.walkReminderPendingDate).toBeNull();
  });

  it('a day with no reminder scheduled (pendingDate null) does not count toward the streak either way', () => {
    const state = enabledState({ walkReminderPendingDate: null, walkReminderConsecutiveIgnores: 1 });
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(5), []);
    expect(result).toBe(state); // untouched — no-op
  });

  it('does not resolve the pending day until it has actually fully passed', () => {
    const state = enabledState({ walkReminderPendingDate: dayKey(0) });
    // "now" is still the same calendar day the reminder was scheduled for.
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(0, 20), []);
    expect(result).toBe(state); // untouched — today isn't resolved yet
  });
});

describe('shouldScheduleWalkReminderToday', () => {
  it('is false when a walk already exists today', () => {
    const state = enabledState();
    expect(shouldScheduleWalkReminderToday(state, atDay(0), [walkOn(0)])).toBe(false);
  });

  it('is false when disabled', () => {
    const state = enabledState({ walkReminderEnabled: false });
    expect(shouldScheduleWalkReminderToday(state, atDay(0), [])).toBe(false);
  });

  it('is false when no time has been set yet, even if enabled', () => {
    const state = enabledState({ walkReminderHour: null, walkReminderMinute: null });
    expect(shouldScheduleWalkReminderToday(state, atDay(0), [])).toBe(false);
  });

  it('is true when enabled, a time is set, and no walk exists yet today', () => {
    const state = enabledState();
    expect(shouldScheduleWalkReminderToday(state, atDay(0), [])).toBe(true);
  });
});

describe('firedCount/followedCount across a short multi-day sequence', () => {
  it('tracks a schedule -> ignore -> schedule -> follow sequence correctly', () => {
    let state = enabledState();

    // Day 0: nothing pending yet, schedules and fires.
    expect(shouldScheduleWalkReminderToday(state, atDay(0), [])).toBe(true);
    state = recordWalkReminderScheduled(state, atDay(0));
    expect(state.walkReminderFiredCount).toBe(1);
    expect(state.walkReminderPendingDate).toBe(dayKey(0));

    // Day 1: reconcile day 0 (no walk on day 0 -> ignored), then schedule day 1.
    state = reconcileWalkReminderIgnoreStreak(state, atDay(1), []);
    expect(state.walkReminderConsecutiveIgnores).toBe(1);
    expect(state.walkReminderFollowedCount).toBe(0);
    expect(shouldScheduleWalkReminderToday(state, atDay(1), [])).toBe(true);
    state = recordWalkReminderScheduled(state, atDay(1));
    expect(state.walkReminderFiredCount).toBe(2);

    // Day 2: reconcile day 1 (walked on day 1 -> followed, streak resets).
    state = reconcileWalkReminderIgnoreStreak(state, atDay(2), [walkOn(1)]);
    expect(state.walkReminderConsecutiveIgnores).toBe(0);
    expect(state.walkReminderFollowedCount).toBe(1);
    expect(state.walkReminderFiredCount).toBe(2); // unchanged by reconciliation itself
  });
});

function dayKey(dayOffset: number): string {
  const d = new Date(atDay(dayOffset));
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

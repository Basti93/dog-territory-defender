import { Walk } from '../../types';
import { calendarDayKey } from '../../utils/manualWalkLog';
import {
  defaultReminderSlots,
  defaultWalkReminderFields,
  hasWalkInSlotWindow,
  hasWalkOnDay,
  migrateLegacyReminderToSlots,
  planReminderDates,
  REMINDER_WINDOW_DAYS,
  reconcileWalkReminderIgnoreStreak,
  recordWalkReminderScheduled,
  reminderIdentifier,
  ReminderSlot,
  ReminderSlotId,
} from '../walkReminderDecision';
import { defaultNotificationBookkeepingState, NotificationBookkeepingState } from '../notificationDecision';
import { setLocale } from '../../i18n';

// These tests assert English copy; pin the locale explicitly.
beforeAll(() => setLocale('en'));

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

/** Slots with only the given ids enabled (defaults: 08:00 / 13:00 / 18:30). */
function slotsOn(...ids: ReminderSlotId[]): ReminderSlot[] {
  return defaultReminderSlots().map((s) => ({ ...s, enabled: ids.includes(s.id) }));
}

function stateWith(ids: ReminderSlotId[], overrides: Partial<NotificationBookkeepingState> = {}): NotificationBookkeepingState {
  return { ...defaultNotificationBookkeepingState(), reminderSlots: slotsOn(...ids), ...overrides };
}

function slotOf(state: NotificationBookkeepingState, id: ReminderSlotId): ReminderSlot {
  return state.reminderSlots.find((s) => s.id === id)!;
}

function dayKey(dayOffset: number): string {
  const d = new Date(atDay(dayOffset));
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

describe('defaultWalkReminderFields', () => {
  it('has three slots, all off, at 08:00 / 13:00 / 18:30', () => {
    const fields = defaultWalkReminderFields();
    expect(fields.reminderSlots.map((s) => [s.id, s.enabled, s.hour, s.minute])).toEqual([
      ['morning', false, 8, 0],
      ['noon', false, 13, 0],
      ['evening', false, 18, 30],
    ]);
    expect(fields.walkReminderPendingDate).toBeNull();
    expect(fields.walkReminderFiredCount).toBe(0);
    expect(fields.walkReminderFollowedCount).toBe(0);
    expect(fields.walkReminderExperimentStartedAt).toBeNull();
  });
});

describe('migrateLegacyReminderToSlots', () => {
  it('puts an early time into morning, keeping enabled and the exact time', () => {
    const slots = migrateLegacyReminderToSlots(true, 7, 15);
    expect(slots.find((s) => s.id === 'morning')).toMatchObject({ enabled: true, hour: 7, minute: 15 });
    expect(slots.filter((s) => s.enabled)).toHaveLength(1);
  });

  it('maps 11:00-15:59 to noon and everything else to evening', () => {
    expect(migrateLegacyReminderToSlots(true, 10, 59).find((s) => s.enabled)!.id).toBe('morning');
    expect(migrateLegacyReminderToSlots(true, 11, 0).find((s) => s.enabled)!.id).toBe('noon');
    expect(migrateLegacyReminderToSlots(true, 15, 59).find((s) => s.enabled)!.id).toBe('noon');
    expect(migrateLegacyReminderToSlots(true, 16, 0).find((s) => s.enabled)!.id).toBe('evening');
  });

  it('keeps a previously disabled reminder disabled but remembers its time', () => {
    const slots = migrateLegacyReminderToSlots(false, 19, 45);
    expect(slots.some((s) => s.enabled)).toBe(false);
    expect(slots.find((s) => s.id === 'evening')).toMatchObject({ hour: 19, minute: 45 });
  });

  it('returns plain defaults when no time was ever set', () => {
    expect(migrateLegacyReminderToSlots(false, null, null)).toEqual(defaultReminderSlots());
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

describe('migrateLegacyReminderToSlots enabledSince', () => {
  it('stamps the migration day on the enabled slot only', () => {
    const slots = migrateLegacyReminderToSlots(true, 7, 15, new Date(2026, 4, 9, 12));
    expect(slots.find((s) => s.id === 'morning')!.enabledSince).toBe('2026-05-09');
    expect(slots.filter((s) => s.enabledSince)).toHaveLength(1);
    expect(migrateLegacyReminderToSlots(false, 7, 15).some((s) => s.enabledSince)).toBe(false);
  });
});

describe('hasWalkInSlotWindow', () => {
  it('credits a manual log on that day to every window', () => {
    const manual: Walk = { ...walkOn(0, 20), startSource: 'manual-log' };
    const all = slotsOn('morning', 'noon', 'evening');
    for (const id of ['morning', 'noon', 'evening'] as ReminderSlotId[]) {
      expect(hasWalkInSlotWindow([manual], all, id, new Date(atDay(0)))).toBe(true);
      expect(hasWalkInSlotWindow([manual], all, id, new Date(atDay(1)))).toBe(false);
    }
  });

  const all = slotsOn('morning', 'noon', 'evening'); // 08:00, 13:00, 18:30
  const day = new Date(atDay(0));

  it('first slot window starts at midnight and ends at the slot time', () => {
    expect(hasWalkInSlotWindow([walkOn(0, 0)], all, 'morning', day)).toBe(true);
    expect(hasWalkInSlotWindow([walkOn(0, 7)], all, 'morning', day)).toBe(true);
    expect(hasWalkInSlotWindow([walkOn(0, 8)], all, 'morning', day)).toBe(false);
  });

  it('later slots start at the previous enabled slot time', () => {
    expect(hasWalkInSlotWindow([walkOn(0, 9)], all, 'noon', day)).toBe(true);
    expect(hasWalkInSlotWindow([walkOn(0, 9)], all, 'evening', day)).toBe(false);
    expect(hasWalkInSlotWindow([walkOn(0, 15)], all, 'evening', day)).toBe(true);
  });

  it('skips disabled slots when finding the previous one', () => {
    const noMorning = slotsOn('noon', 'evening');
    expect(hasWalkInSlotWindow([walkOn(0, 6)], noMorning, 'noon', day)).toBe(true); // window is 00:00-13:00
  });

  it('is false for a disabled slot and ignores walks on other days', () => {
    expect(hasWalkInSlotWindow([walkOn(0, 7)], slotsOn('noon'), 'morning', day)).toBe(false);
    expect(hasWalkInSlotWindow([walkOn(1, 7)], all, 'morning', day)).toBe(false);
  });
});

describe('reconcileWalkReminderIgnoreStreak — per-slot auto-sleep', () => {
  it('does NOT auto-sleep a slot at 2 consecutive ignored days', () => {
    const state = stateWith(['evening'], { walkReminderPendingDate: dayKey(0) });
    state.reminderSlots = state.reminderSlots.map((s) => (s.id === 'evening' ? { ...s, consecutiveIgnores: 1 } : s));
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(1), []);
    expect(slotOf(result, 'evening').consecutiveIgnores).toBe(2);
    expect(slotOf(result, 'evening').enabled).toBe(true);
  });

  it('auto-sleeps only the ignored slot at exactly 3', () => {
    const state = stateWith(['morning', 'evening'], { walkReminderPendingDate: dayKey(2) });
    state.reminderSlots = state.reminderSlots.map((s) => ({ ...s, consecutiveIgnores: 2 }));
    // Walk at 19:00 follows the evening reminder; nothing follows the morning one.
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(3), [walkOn(2, 19)]);
    expect(slotOf(result, 'evening')).toMatchObject({ enabled: true, consecutiveIgnores: 0 });
    expect(slotOf(result, 'morning')).toMatchObject({ enabled: false, consecutiveIgnores: 3 });
  });

  it('a walk before the morning reminder means it was never scheduled: not counted, evening still ignored', () => {
    const state = stateWith(['morning', 'evening'], { walkReminderPendingDate: dayKey(0) });
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(1), [walkOn(0, 7)]);
    expect(slotOf(result, 'morning').consecutiveIgnores).toBe(0);
    expect(slotOf(result, 'evening').consecutiveIgnores).toBe(1);
    expect(result.walkReminderFiredCount).toBe(1);
    expect(result.walkReminderFollowedCount).toBe(0);
  });

  it('morning-only slot + walk at 08:30 after the 08:00 reminder = followed', () => {
    const state = stateWith(['morning'], { walkReminderPendingDate: dayKey(0) });
    state.reminderSlots = state.reminderSlots.map((s) => ({ ...s, consecutiveIgnores: 2 }));
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(1), [{ ...walkOn(0, 8), startTime: new Date(2026, 0, 1, 8, 30).getTime() }]);
    expect(slotOf(result, 'morning')).toMatchObject({ enabled: true, consecutiveIgnores: 0 });
    expect(result.walkReminderFiredCount).toBe(1);
    expect(result.walkReminderFollowedCount).toBe(1);
  });

  it('follow window ends at the next enabled slot: a walk after it follows that slot, not the earlier one', () => {
    const state = stateWith(['morning', 'noon'], { walkReminderPendingDate: dayKey(0) });
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(1), [walkOn(0, 14)]);
    expect(slotOf(result, 'morning').consecutiveIgnores).toBe(1);
    expect(slotOf(result, 'noon').consecutiveIgnores).toBe(0);
  });

  it('a walk at 23:30 follows the last slot of the day', () => {
    const state = stateWith(['evening'], { walkReminderPendingDate: dayKey(0) });
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(1), [{ ...walkOn(0, 23), startTime: new Date(2026, 0, 1, 23, 30).getTime() }]);
    expect(result.walkReminderFollowedCount).toBe(1);
  });

  it('does not count days before enabledSince', () => {
    const state = stateWith(['evening'], { walkReminderPendingDate: dayKey(0) });
    state.reminderSlots = state.reminderSlots.map((s) => ({ ...s, enabledSince: '2026-01-03' }));
    // Days 0..3 passed (today = day 4); only days 2 and 3 (Jan 3, Jan 4)... enabledSince Jan 3 = day offset 2.
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(4), []);
    expect(slotOf(result, 'evening').consecutiveIgnores).toBe(2); // Jan 3 and Jan 4
    expect(result.walkReminderFiredCount).toBe(2);
    expect(slotOf(result, 'evening').enabled).toBe(true);
  });

  it('a manual log made earlier today credits the whole day (follows every slot)', () => {
    const manual: Walk = { ...walkOn(0, 6), startSource: 'manual-log' };
    const state = stateWith(['morning', 'evening'], { walkReminderPendingDate: dayKey(0) });
    const result = reconcileWalkReminderIgnoreStreak(state, atDay(1), [manual]);
    expect(result.walkReminderFiredCount).toBe(0); // both windows already held a walk: never scheduled
    expect(slotOf(result, 'evening').consecutiveIgnores).toBe(0);
  });

  it('clears walkReminderPendingDate once the day is resolved, whether walked or not', () => {
    const walked = reconcileWalkReminderIgnoreStreak(stateWith(['evening'], { walkReminderPendingDate: dayKey(0) }), atDay(1), [walkOn(0, 12)]);
    expect(walked.walkReminderPendingDate).toBeNull();
    const ignored = reconcileWalkReminderIgnoreStreak(stateWith(['evening'], { walkReminderPendingDate: dayKey(0) }), atDay(1), []);
    expect(ignored.walkReminderPendingDate).toBeNull();
  });

  it('a day with no reminder scheduled (pendingDate null) is a no-op', () => {
    const state = stateWith(['evening']);
    expect(reconcileWalkReminderIgnoreStreak(state, atDay(5), [])).toBe(state);
  });

  it('does not resolve the pending day until it has actually fully passed', () => {
    const state = stateWith(['evening'], { walkReminderPendingDate: dayKey(0) });
    expect(reconcileWalkReminderIgnoreStreak(state, atDay(0, 20), [])).toBe(state);
  });

  it('does not resolve a pending day in the future', () => {
    const state = stateWith(['evening'], { walkReminderPendingDate: dayKey(2) });
    expect(reconcileWalkReminderIgnoreStreak(state, atDay(0), [])).toBe(state);
  });
});

describe('fired/followed counters across a short sequence', () => {
  it('tracks schedule -> ignore -> schedule -> follow', () => {
    let state = stateWith(['evening']);
    state = recordWalkReminderScheduled(state, atDay(0));
    expect(state.walkReminderFiredCount).toBe(0); // counted when the day is resolved
    expect(state.walkReminderPendingDate).toBe(dayKey(0));

    state = reconcileWalkReminderIgnoreStreak(state, atDay(1), []);
    expect(slotOf(state, 'evening').consecutiveIgnores).toBe(1);
    expect(state.walkReminderFiredCount).toBe(1);
    state = recordWalkReminderScheduled(state, atDay(1));

    // Walk at 19:00 on day 1 started after the 18:30 reminder: followed.
    state = reconcileWalkReminderIgnoreStreak(state, atDay(2), [walkOn(1, 19)]);
    expect(slotOf(state, 'evening').consecutiveIgnores).toBe(0);
    expect(state.walkReminderFollowedCount).toBe(1);
    expect(state.walkReminderFiredCount).toBe(2);
  });
});

describe('reconcile across a multi-day gap (rolling window, app closed for days)', () => {
  it('counts every passed scheduled day and auto-sleeps the slot at 3 ignores', () => {
    const result = reconcileWalkReminderIgnoreStreak(stateWith(['evening'], { walkReminderPendingDate: dayKey(0) }), atDay(5), []);
    expect(slotOf(result, 'evening').enabled).toBe(false);
    expect(slotOf(result, 'evening').consecutiveIgnores).toBe(3);
    expect(result.walkReminderFiredCount).toBe(3); // stopped counting once asleep
    expect(result.walkReminderPendingDate).toBeNull();
  });

  it('a walked day in the gap resets the streak', () => {
    const result = reconcileWalkReminderIgnoreStreak(stateWith(['evening'], { walkReminderPendingDate: dayKey(0) }), atDay(3), [walkOn(1, 19)]);
    expect(slotOf(result, 'evening')).toMatchObject({ enabled: true, consecutiveIgnores: 1 });
    expect(result.walkReminderFollowedCount).toBe(1);
    expect(result.walkReminderFiredCount).toBe(3);
  });
});

describe('planReminderDates', () => {
  it('returns 7 future days per enabled slot, ids encode day and slot', () => {
    const plan = planReminderDates(atDay(0, 6), slotsOn('morning', 'evening'), []);
    expect(plan).toHaveLength(2 * REMINDER_WINDOW_DAYS);
    expect(plan.filter((p) => p.slotId === 'morning')).toHaveLength(7);
    expect(plan.filter((p) => p.slotId === 'evening')).toHaveLength(7);
    expect(plan[0].slotId).toBe('morning');
    expect(reminderIdentifier(plan[0].date, 'morning')).toBe('walk-reminder-2026-01-01-morning');
    expect(plan.map((p) => p.date.getTime())).toEqual([...plan.map((p) => p.date.getTime())].sort((a, b) => a - b));
  });

  it('plans nothing when no slot is enabled', () => {
    expect(planReminderDates(atDay(0, 6), slotsOn(), [])).toEqual([]);
  });

  it('a morning walk silences only the morning reminder today', () => {
    const plan = planReminderDates(atDay(0, 9), slotsOn('morning', 'noon', 'evening'), [walkOn(0, 7)]);
    // 09:00 now: morning already passed anyway; use 06:00 for the real check below.
    expect(plan.filter((p) => p.slotId === 'evening')[0].date.getDate()).toBe(1);
    const early = planReminderDates(atDay(0, 6), slotsOn('morning', 'noon', 'evening'), [walkOn(0, 6)]);
    expect(early.filter((p) => p.slotId === 'morning')[0].date.getDate()).toBe(2);
    expect(early.filter((p) => p.slotId === 'morning')).toHaveLength(7);
    expect(early.filter((p) => p.slotId === 'noon')[0].date.getDate()).toBe(1);
    expect(early.filter((p) => p.slotId === 'evening')[0].date.getDate()).toBe(1);
  });

  it('a walk in the noon window silences noon but not evening', () => {
    const plan = planReminderDates(atDay(0, 10), slotsOn('morning', 'noon', 'evening'), [walkOn(0, 10)]);
    expect(plan.filter((p) => p.slotId === 'noon')[0].date.getDate()).toBe(2);
    expect(plan.filter((p) => p.slotId === 'evening')[0].date.getDate()).toBe(1);
  });

  it('a manual log earlier today silences every slot still ahead today', () => {
    const manual: Walk = { ...walkOn(0, 7), startSource: 'manual-log' };
    const plan = planReminderDates(atDay(0, 7), slotsOn('noon', 'evening'), [manual]);
    expect(plan.filter((p) => p.slotId === 'noon')[0].date.getDate()).toBe(2);
    expect(plan.filter((p) => p.slotId === 'evening')[0].date.getDate()).toBe(2);
  });

  it('skips today for a slot whose time has passed and still gives 7 days', () => {
    const plan = planReminderDates(atDay(0, 20), slotsOn('evening'), []);
    expect(plan).toHaveLength(7);
    expect(plan[0].date.getDate()).toBe(2);
    expect(plan[6].date.getDate()).toBe(8);
  });

  it('keeps the local clock time across a DST change', () => {
    for (const month of [2, 9, 10]) {
      const now = new Date(2026, month, 20, 5, 0, 0).getTime();
      planReminderDates(now, slotsOn('morning'), [], 14).forEach((p) => {
        expect(p.date.getHours()).toBe(8);
        expect(p.date.getMinutes()).toBe(0);
      });
    }
  });
});

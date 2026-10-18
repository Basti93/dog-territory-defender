import { createInMemoryNotificationRepository } from '../../storage/inMemoryNotificationRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { checkAndScheduleWalkReminder, updateReminderSlot } from '../walkReminder';
import { defaultReminderSlots, ReminderSlotId } from '../walkReminderDecision';

// Mirrors earnedTrigger.test.ts's own expo-notifications mock shape — this
// feature reuses the exact same scheduling wiring (openspec/changes/
// walk-reminder/design.md Decision 4), not a second scheduling mechanism.
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockGetAllScheduledNotificationsAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  getAllScheduledNotificationsAsync: (...args: unknown[]) => mockGetAllScheduledNotificationsAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancelScheduledNotificationAsync(...args),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(),
}));

const NOW = Date.parse('2026-08-22T09:00:00');

beforeEach(() => {
  mockGetPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  mockRequestPermissionsAsync.mockReset().mockResolvedValue({ granted: true, status: 'granted' });
  mockScheduleNotificationAsync.mockReset().mockResolvedValue('scheduled-id');
  mockGetAllScheduledNotificationsAsync.mockReset().mockResolvedValue([]);
  mockCancelScheduledNotificationAsync.mockReset().mockResolvedValue(undefined);
});

async function makeDeps() {
  return {
    walkRepository: createInMemoryWalkRepository(),
    notificationRepository: createInMemoryNotificationRepository(),
  };
}

type Deps = Awaited<ReturnType<typeof makeDeps>>;

// Enables the given slots; optional time override for one slot.
async function enableSlots(deps: Deps, ids: ReminderSlotId[], override?: { id: ReminderSlotId; hour: number; minute: number }) {
  const state = await deps.notificationRepository.getState();
  await deps.notificationRepository.saveState({
    ...state,
    reminderSlots: defaultReminderSlots().map((s) => ({
      ...s,
      enabled: ids.includes(s.id),
      ...(override && override.id === s.id ? { hour: override.hour, minute: override.minute } : {}),
    })),
  });
}

describe('checkAndScheduleWalkReminder', () => {
  it('schedules a reminder when enabled, a time is set, and no walk exists today', async () => {
    const deps = await makeDeps();
    await enableSlots(deps, ['evening'], { id: 'evening', hour: 18, minute: 0 });

    await checkAndScheduleWalkReminder(deps, NOW);

    // NOW is 09:00 and the reminder is 18:00 -> today + 6 more days.
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(7);
    const first = mockScheduleNotificationAsync.mock.calls[0][0];
    expect(first.identifier).toBe('walk-reminder-2026-08-22-evening');
    expect(first.content.title).toBe('Evening walk?');
    expect(first.trigger).toEqual({ type: 'date', date: expect.any(Date), channelId: 'walk-reminder' });
    expect(first.content.data).toEqual({ type: 'walk-reminder', kind: 'walk-reminder', day: '2026-08-22', slot: 'evening', at: expect.any(String) });
    const state = await deps.notificationRepository.getState();
    expect(state.walkReminderPendingDate).not.toBeNull();
  });

  it('skips silently when a walk already exists today, and never counts it toward the fired total', async () => {
    const deps = await makeDeps();
    await enableSlots(deps, ['evening'], { id: 'evening', hour: 18, minute: 0 });
    await deps.walkRepository.saveWalk({ id: 'w1', startTime: NOW, locations: [], closed: true, startSource: 'button' });

    await checkAndScheduleWalkReminder(deps, NOW);

    // Today is skipped; the window extends so 7 future days are still scheduled.
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(7);
    const ids = mockScheduleNotificationAsync.mock.calls.map((c) => c[0].identifier);
    expect(ids).not.toContain('walk-reminder-2026-08-22-evening');
    const state = await deps.notificationRepository.getState();
    expect(state.walkReminderFiredCount).toBe(0);
  });

  it('skips silently when the reminder is disabled', async () => {
    const deps = await makeDeps();

    await checkAndScheduleWalkReminder(deps, NOW);

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels any previously-scheduled reminder before deciding whether to schedule again', async () => {
    const deps = await makeDeps();
    await enableSlots(deps, ['evening'], { id: 'evening', hour: 18, minute: 0 });
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'stale-1', content: { data: { type: 'walk-reminder' } } },
      { identifier: 'unrelated-den-overflow', content: { data: { type: 'den-overflow' } } },
    ]);

    await checkAndScheduleWalkReminder(deps, NOW);

    // Only the walk-reminder-tagged stale notification is cancelled — the
    // unrelated den-overflow one is left untouched (design.md Decision 5).
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('stale-1');
  });

  it('reschedules correctly across two consecutive calls with different set times', async () => {
    const deps = await makeDeps();
    await enableSlots(deps, ['evening'], { id: 'evening', hour: 18, minute: 0 });

    await checkAndScheduleWalkReminder(deps, NOW);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(7);
    const firstCallDate = (mockScheduleNotificationAsync.mock.calls[0][0].trigger.date as Date).getHours();
    expect(firstCallDate).toBe(18);

    // Player changes the set time in Settings, which calls this again right
    // away (tasks.md task 5.3) — still the same calendar day, no walk yet.
    await enableSlots(deps, ['evening'], { id: 'evening', hour: 20, minute: 15 });
    await checkAndScheduleWalkReminder(deps, NOW + 1000);

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(14);
    const secondCallTrigger = mockScheduleNotificationAsync.mock.calls[7][0].trigger.date as Date;
    expect(secondCallTrigger.getHours()).toBe(20);
    expect(secondCallTrigger.getMinutes()).toBe(15);
    // Re-planning the window never inflates the fired total (counted when days are resolved).
    const finalState = await deps.notificationRepository.getState();
    expect(finalState.walkReminderFiredCount).toBe(0);
  });

  it('never fires when a walk is saved before the reminder check runs (already-walked-today guardrail holds even mid-session)', async () => {
    const deps = await makeDeps();
    await enableSlots(deps, ['evening'], { id: 'evening', hour: 18, minute: 0 });

    // App opens in the morning with no walk yet -> schedules for 18:00.
    await checkAndScheduleWalkReminder(deps, NOW);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(7);

    // Walk finishes mid-afternoon, same day -> App.tsx's finishWalk calls
    // this again right away (design.md Decision 4's gap-closing rationale).
    await deps.walkRepository.saveWalk({ id: 'w1', startTime: NOW + 6 * 60 * 60 * 1000, locations: [], closed: true, startSource: 'button' });
    await checkAndScheduleWalkReminder(deps, NOW + 6 * 60 * 60 * 1000);

    // The cancellation check ran again on the walk-save trigger (Decision 5
    // — it's the mechanism that would cancel a real stale 18:00 notification
    // in a live app; this mock has nothing pending to actually remove), and
    // nothing new was scheduled for the rest of today.
    expect(mockGetAllScheduledNotificationsAsync).toHaveBeenCalledTimes(2);
    // Replanned without today: 7 from this morning + 7 from the replan.
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(14);
    const replanIds = mockScheduleNotificationAsync.mock.calls.slice(7).map((c) => c[0].identifier);
    expect(replanIds).not.toContain('walk-reminder-2026-08-22-evening');
  });

  it('cancels reminders by kind/identifier prefix and never the overflow notification', async () => {
    const deps = await makeDeps();
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'walk-reminder-2026-08-23-evening', content: { data: { kind: 'walk-reminder', day: '2026-08-23' } } },
      { identifier: 'overflow-1', content: { data: { type: 'den-overflow' } } },
    ]);
    await checkAndScheduleWalkReminder(deps, NOW);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('walk-reminder-2026-08-23-evening');
  });

  it('schedules 7 days per enabled slot; a morning walk leaves noon and evening untouched', async () => {
    const deps = await makeDeps();
    await enableSlots(deps, ['morning', 'noon', 'evening']);
    // NOW is 09:00 (morning already passed): morning starts tomorrow.
    await checkAndScheduleWalkReminder(deps, NOW);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(21);
    const ids = mockScheduleNotificationAsync.mock.calls.map((c) => c[0].identifier);
    expect(ids).toContain('walk-reminder-2026-08-22-noon');
    expect(ids).toContain('walk-reminder-2026-08-22-evening');
    expect(ids).not.toContain('walk-reminder-2026-08-22-morning');

    // A walk started 07:30 today -> only the (already passed) morning window is affected.
    mockScheduleNotificationAsync.mockClear();
    await deps.walkRepository.saveWalk({ id: 'w1', startTime: Date.parse('2026-08-22T07:30:00'), locations: [], closed: true, startSource: 'button' });
    await checkAndScheduleWalkReminder(deps, NOW);
    const replanIds = mockScheduleNotificationAsync.mock.calls.map((c) => c[0].identifier);
    expect(replanIds).toContain('walk-reminder-2026-08-22-noon');
    expect(replanIds).toContain('walk-reminder-2026-08-22-evening');
  });

  it('disabling all slots cancels pending reminders and schedules nothing', async () => {
    const deps = await makeDeps();
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'walk-reminder-2026-08-23-noon', content: { data: { kind: 'walk-reminder' } } },
    ]);
    await enableSlots(deps, []);
    await checkAndScheduleWalkReminder(deps, NOW);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('walk-reminder-2026-08-23-noon');
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('serialized reminder operations', () => {
  it('rapid on/off toggles end with the last write winning and nothing left scheduled', async () => {
    const deps = await makeDeps();
    const scheduled: { identifier: string }[] = [];
    mockScheduleNotificationAsync.mockImplementation(async (req: { identifier: string; content: { data: object } }) => {
      scheduled.push({ identifier: req.identifier });
      return req.identifier;
    });
    mockGetAllScheduledNotificationsAsync.mockImplementation(async () =>
      scheduled.map((n) => ({ identifier: n.identifier, content: { data: { kind: 'walk-reminder' } } }))
    );
    mockCancelScheduledNotificationAsync.mockImplementation(async (id: string) => {
      const i = scheduled.findIndex((n) => n.identifier === id);
      if (i >= 0) scheduled.splice(i, 1);
    });

    await Promise.all([
      updateReminderSlot(deps, 'evening', { enabled: true }, NOW),
      updateReminderSlot(deps, 'evening', { enabled: false }, NOW),
    ]);
    expect((await deps.notificationRepository.getState()).reminderSlots.find((s) => s.id === 'evening')!.enabled).toBe(false);
    expect(scheduled).toHaveLength(0);
  });

  it('switching a slot on stamps enabledSince with today', async () => {
    const deps = await makeDeps();
    const slots = await updateReminderSlot(deps, 'evening', { enabled: true }, NOW);
    expect(slots.find((s) => s.id === 'evening')!.enabledSince).toBe('2026-08-22');
  });

  it('an extra (just-started) walk silences the slot whose window it started in', async () => {
    const deps = await makeDeps();
    await enableSlots(deps, ['evening']);
    const walk = { id: 'live', startTime: NOW, locations: [], closed: false, startSource: 'button' as const };
    await checkAndScheduleWalkReminder(deps, NOW, [walk]);
    const first = mockScheduleNotificationAsync.mock.calls[0][0];
    expect(first.identifier).toBe('walk-reminder-2026-08-23-evening');
  });
});

import { createInMemoryNotificationRepository } from '../../storage/inMemoryNotificationRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { checkAndScheduleWalkReminder } from '../walkReminder';

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

describe('checkAndScheduleWalkReminder', () => {
  it('schedules a reminder when enabled, a time is set, and no walk exists today', async () => {
    const deps = await makeDeps();
    await deps.notificationRepository.saveState({
      ...(await deps.notificationRepository.getState()),
      walkReminderEnabled: true,
      walkReminderHour: 18,
      walkReminderMinute: 0,
    });

    await checkAndScheduleWalkReminder(deps, NOW);

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const state = await deps.notificationRepository.getState();
    expect(state.walkReminderFiredCount).toBe(1);
    expect(state.walkReminderPendingDate).not.toBeNull();
  });

  it('skips silently when a walk already exists today, and never counts it toward the fired total', async () => {
    const deps = await makeDeps();
    await deps.notificationRepository.saveState({
      ...(await deps.notificationRepository.getState()),
      walkReminderEnabled: true,
      walkReminderHour: 18,
      walkReminderMinute: 0,
    });
    await deps.walkRepository.saveWalk({ id: 'w1', startTime: NOW, locations: [], closed: true, startSource: 'button' });

    await checkAndScheduleWalkReminder(deps, NOW);

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    const state = await deps.notificationRepository.getState();
    expect(state.walkReminderFiredCount).toBe(0);
    expect(state.walkReminderPendingDate).toBeNull();
  });

  it('skips silently when the reminder is disabled', async () => {
    const deps = await makeDeps();

    await checkAndScheduleWalkReminder(deps, NOW);

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels any previously-scheduled reminder before deciding whether to schedule again', async () => {
    const deps = await makeDeps();
    await deps.notificationRepository.saveState({
      ...(await deps.notificationRepository.getState()),
      walkReminderEnabled: true,
      walkReminderHour: 18,
      walkReminderMinute: 0,
    });
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
    await deps.notificationRepository.saveState({
      ...(await deps.notificationRepository.getState()),
      walkReminderEnabled: true,
      walkReminderHour: 18,
      walkReminderMinute: 0,
    });

    await checkAndScheduleWalkReminder(deps, NOW);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const firstCallDate = (mockScheduleNotificationAsync.mock.calls[0][0].trigger.date as Date).getHours();
    expect(firstCallDate).toBe(18);

    // Player changes the set time in Settings, which calls this again right
    // away (tasks.md task 5.3) — still the same calendar day, no walk yet.
    await deps.notificationRepository.saveState({
      ...(await deps.notificationRepository.getState()),
      walkReminderHour: 20,
      walkReminderMinute: 15,
    });
    await checkAndScheduleWalkReminder(deps, NOW + 1000);

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const secondCallTrigger = mockScheduleNotificationAsync.mock.calls[1][0].trigger.date as Date;
    expect(secondCallTrigger.getHours()).toBe(20);
    expect(secondCallTrigger.getMinutes()).toBe(15);
    // firedCount reflects both real schedule calls (once per call in this test, since each call's a fresh day-key checkpoint before the day has passed).
    const finalState = await deps.notificationRepository.getState();
    expect(finalState.walkReminderFiredCount).toBe(2);
  });

  it('never fires when a walk is saved before the reminder check runs (already-walked-today guardrail holds even mid-session)', async () => {
    const deps = await makeDeps();
    await deps.notificationRepository.saveState({
      ...(await deps.notificationRepository.getState()),
      walkReminderEnabled: true,
      walkReminderHour: 18,
      walkReminderMinute: 0,
    });

    // App opens in the morning with no walk yet -> schedules for 18:00.
    await checkAndScheduleWalkReminder(deps, NOW);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);

    // Walk finishes mid-afternoon, same day -> App.tsx's finishWalk calls
    // this again right away (design.md Decision 4's gap-closing rationale).
    await deps.walkRepository.saveWalk({ id: 'w1', startTime: NOW + 6 * 60 * 60 * 1000, locations: [], closed: true, startSource: 'button' });
    await checkAndScheduleWalkReminder(deps, NOW + 6 * 60 * 60 * 1000);

    // The cancellation check ran again on the walk-save trigger (Decision 5
    // — it's the mechanism that would cancel a real stale 18:00 notification
    // in a live app; this mock has nothing pending to actually remove), and
    // nothing new was scheduled for the rest of today.
    expect(mockGetAllScheduledNotificationsAsync).toHaveBeenCalledTimes(2);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1); // still just the one from this morning
  });
});

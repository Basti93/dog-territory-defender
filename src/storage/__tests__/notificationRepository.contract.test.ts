import { defaultNotificationBookkeepingState } from '../../notifications/notificationDecision';
import { createInMemoryNotificationRepository } from '../inMemoryNotificationRepository';

describe('NotificationRepository contract', () => {
  it('returns the default state on first read', async () => {
    const repo = createInMemoryNotificationRepository();

    const state = await repo.getState();

    expect(state.overflowSurfaced).toBe(false);
    expect(state.learnedTimeOfDayBucket).toBeNull();
  });

  it('persists saved state across subsequent reads', async () => {
    const repo = createInMemoryNotificationRepository();

    await repo.saveState({ ...defaultNotificationBookkeepingState(), overflowSurfaced: true, learnedTimeOfDayBucket: 'evening' });
    const reread = await repo.getState();

    expect(reread.overflowSurfaced).toBe(true);
    expect(reread.learnedTimeOfDayBucket).toBe('evening');
  });

  // Walk-reminder fields (openspec/changes/walk-reminder/design.md Decision 3)
  // — round-trip only exercised here against the in-memory implementation.
  // This project has no jest-level harness for the sqlite implementations at
  // all yet (expo-sqlite has no jest-expo mock, and no existing repository's
  // sqlite implementation — including den_economy's own prior migration — is
  // covered by an automated test); sqliteNotificationRepository.ts's own
  // migration/column-mapping code is reviewed by hand against
  // sqliteDenEconomyRepository.ts's already-proven addColumnIfMissing
  // pattern instead (see this change's implementation report).
  it('defaults every walk-reminder field to its off/unset/zeroed state on first read', async () => {
    const repo = createInMemoryNotificationRepository();

    const state = await repo.getState();

    expect(state.reminderSlots.map((s) => s.id)).toEqual(['morning', 'noon', 'evening']);
    expect(state.reminderSlots.some((s) => s.enabled)).toBe(false);
    expect(state.walkReminderPendingDate).toBeNull();
    expect(state.walkReminderFiredCount).toBe(0);
    expect(state.walkReminderFollowedCount).toBe(0);
    expect(state.walkReminderExperimentStartedAt).toBeNull();
  });

  it('round-trips every walk-reminder field across subsequent reads', async () => {
    const repo = createInMemoryNotificationRepository();
    const state = await repo.getState();

    await repo.saveState({
      ...state,
      reminderSlots: state.reminderSlots.map((s) => (s.id === 'noon' ? { ...s, enabled: true, hour: 12, minute: 30, consecutiveIgnores: 2 } : s)),
      walkReminderPendingDate: '2026-7-22',
      walkReminderFiredCount: 5,
      walkReminderFollowedCount: 3,
      walkReminderExperimentStartedAt: 1_700_000_000_000,
    });
    const reread = await repo.getState();

    expect(reread.reminderSlots.find((s) => s.id === 'noon')).toMatchObject({ enabled: true, hour: 12, minute: 30, consecutiveIgnores: 2 });
    expect(reread.reminderSlots.find((s) => s.id === 'morning')!.enabled).toBe(false);
    expect(reread.walkReminderPendingDate).toBe('2026-7-22');
    expect(reread.walkReminderFiredCount).toBe(5);
    expect(reread.walkReminderFollowedCount).toBe(3);
    expect(reread.walkReminderExperimentStartedAt).toBe(1_700_000_000_000);
  });
});

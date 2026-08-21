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

    await repo.saveState({ overflowSurfaced: true, learnedTimeOfDayBucket: 'evening' });
    const reread = await repo.getState();

    expect(reread.overflowSurfaced).toBe(true);
    expect(reread.learnedTimeOfDayBucket).toBe('evening');
  });
});

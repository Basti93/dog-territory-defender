import { notifyAutoFinishedIfBackgrounded } from '../autoFinishNotify';

jest.mock('../../notifications/scheduler', () => ({ scheduleWalkEndedNotification: jest.fn() }));

describe('notifyAutoFinishedIfBackgrounded', () => {
  it('schedules only when the app is not in front', async () => {
    const schedule = jest.fn().mockResolvedValue(true);
    expect(await notifyAutoFinishedIfBackgrounded('Rex', 'active', schedule)).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
    expect(await notifyAutoFinishedIfBackgrounded('Rex', 'background', schedule)).toBe(true);
    expect(await notifyAutoFinishedIfBackgrounded('Rex', 'inactive', schedule)).toBe(true);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledWith('Rex');
  });

  it('swallows scheduling errors', async () => {
    const schedule = jest.fn().mockRejectedValue(new Error('boom'));
    expect(await notifyAutoFinishedIfBackgrounded(null, 'background', schedule)).toBe(false);
  });
});

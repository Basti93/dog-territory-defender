import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryNotificationRepository } from '../../storage/inMemoryNotificationRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { defaultDenEconomyState } from '../../economy/denEconomy';
import { storageCap } from '../../economy/formulas';
import { resolveDoorstepOverflowLine } from '../notificationDecision';
import { checkAndScheduleEarnedTriggerNotification } from '../earnedTrigger';

// The sequencing fix (docs/decisions/home-dashboard.md Decision 6,
// tasks.md task 4.3): whichever channel resolves+claims the same overflow
// first wins. This exercises the real bug the architect flagged — a naive
// two-independent-effects version would let the Doorstep's own overflow
// line AND the earned-trigger push notification both fire for the same
// unclaimed overflow in one app-open.

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const NOW = Date.parse('2026-08-22T12:00:00Z');

beforeEach(() => {
  mockGetPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  mockRequestPermissionsAsync.mockReset().mockResolvedValue({ granted: true, status: 'granted' });
  mockScheduleNotificationAsync.mockReset().mockResolvedValue(undefined);
});

async function makeOverflowingDeps() {
  const denEconomyRepository = createInMemoryDenEconomyRepository();
  const walkRepository = createInMemoryWalkRepository();
  const notificationRepository = createInMemoryNotificationRepository();

  const overflowingState = { ...defaultDenEconomyState(NOW), treats: storageCap(1, 1, 1, 1) };
  await denEconomyRepository.saveState(overflowingState);
  // learnTimeOfDayBucket needs at least one past walk to learn a delivery
  // time from — otherwise checkAndScheduleEarnedTriggerNotification stays
  // silent regardless, which would make this test pass for the wrong reason.
  await walkRepository.saveWalk({
    id: 'w1',
    startTime: NOW - 24 * 60 * 60 * 1000,
    locations: [],
    closed: true,
    startSource: 'button',
  });

  return { denEconomyRepository, walkRepository, notificationRepository, overflowingState };
}

describe('the Doorstep/earned-trigger overflow sequencing fix', () => {
  it('control: with no Doorstep-side claim, the earned-trigger notification fires for the overflow', async () => {
    const { denEconomyRepository, walkRepository, notificationRepository } = await makeOverflowingDeps();

    await checkAndScheduleEarnedTriggerNotification({ denEconomyRepository, walkRepository, notificationRepository });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('once the Doorstep resolves+claims the overflow line first, the earned-trigger notification does NOT also fire for it', async () => {
    const { denEconomyRepository, walkRepository, notificationRepository, overflowingState } = await makeOverflowingDeps();

    // Mirrors App.tsx's merged mount effect (design.md Decision 6): resolve
    // and persist the Doorstep's own claim BEFORE running the earned-trigger
    // check, in the same sequential routine (not two independent effects).
    const bookkeepingBefore = await notificationRepository.getState();
    const { showLine, nextBookkeeping } = resolveDoorstepOverflowLine(overflowingState, bookkeepingBefore);
    await notificationRepository.saveState(nextBookkeeping);
    expect(showLine).toBe(true); // sanity: the Doorstep really did decide to show its own line

    await checkAndScheduleEarnedTriggerNotification({ denEconomyRepository, walkRepository, notificationRepository });

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

import { defaultDenEconomyState } from '../../economy/denEconomy';
import { storageCap } from '../../economy/formulas';
import {
  defaultNotificationBookkeepingState,
  learnTimeOfDayBucket,
  overflowNotificationBody,
  resetSurfacedFlagIfOverflowCleared,
  resolveDoorstepOverflowLine,
  shouldFireOverflowNotification,
} from '../notificationDecision';

const NOW = 1_700_000_000_000;

describe('shouldFireOverflowNotification', () => {
  it('fires when treats are at/over the storage cap and the overflow has not been surfaced yet', () => {
    const denState = { ...defaultDenEconomyState(NOW), treats: storageCap(1, 1, 1, 1) };
    const bookkeeping = defaultNotificationBookkeepingState();

    expect(shouldFireOverflowNotification(denState, bookkeeping)).toBe(true);
  });

  it('stays silent when treats are below the storage cap', () => {
    const denState = { ...defaultDenEconomyState(NOW), treats: storageCap(1, 1, 1, 1) - 1 };
    const bookkeeping = defaultNotificationBookkeepingState();

    expect(shouldFireOverflowNotification(denState, bookkeeping)).toBe(false);
  });

  it('stays silent when the current overflow has already been surfaced', () => {
    const denState = { ...defaultDenEconomyState(NOW), treats: storageCap(1, 1, 1, 1) };
    const bookkeeping = { ...defaultNotificationBookkeepingState(), overflowSurfaced: true };

    expect(shouldFireOverflowNotification(denState, bookkeeping)).toBe(false);
  });
});

describe('resetSurfacedFlagIfOverflowCleared', () => {
  it('clears the surfaced flag once treats drop back below the cap', () => {
    const denState = { ...defaultDenEconomyState(NOW), treats: storageCap(1, 1, 1, 1) - 5 };
    const bookkeeping = { ...defaultNotificationBookkeepingState(), overflowSurfaced: true };

    const result = resetSurfacedFlagIfOverflowCleared(denState, bookkeeping);

    expect(result.overflowSurfaced).toBe(false);
  });

  it('leaves the surfaced flag untouched while still overflowing', () => {
    const denState = { ...defaultDenEconomyState(NOW), treats: storageCap(1, 1, 1, 1) };
    const bookkeeping = { ...defaultNotificationBookkeepingState(), overflowSurfaced: true };

    const result = resetSurfacedFlagIfOverflowCleared(denState, bookkeeping);

    expect(result.overflowSurfaced).toBe(true);
  });

  it('is a no-op when the flag was already false', () => {
    const denState = { ...defaultDenEconomyState(NOW), treats: 0 };
    const bookkeeping = defaultNotificationBookkeepingState();

    const result = resetSurfacedFlagIfOverflowCleared(denState, bookkeeping);

    expect(result).toBe(bookkeeping);
  });
});

describe('resolveDoorstepOverflowLine', () => {
  it('shows the line and claims overflowSurfaced when an overflow has not been surfaced yet', () => {
    const denState = { ...defaultDenEconomyState(NOW), treats: storageCap(1, 1, 1, 1) };
    const bookkeeping = defaultNotificationBookkeepingState();

    const result = resolveDoorstepOverflowLine(denState, bookkeeping);

    expect(result.showLine).toBe(true);
    expect(result.nextBookkeeping.overflowSurfaced).toBe(true);
  });

  it('does not show the line again once the overflow has already been surfaced', () => {
    const denState = { ...defaultDenEconomyState(NOW), treats: storageCap(1, 1, 1, 1) };
    const bookkeeping = { ...defaultNotificationBookkeepingState(), overflowSurfaced: true };

    const result = resolveDoorstepOverflowLine(denState, bookkeeping);

    expect(result.showLine).toBe(false);
    expect(result.nextBookkeeping.overflowSurfaced).toBe(true);
  });

  it('does not show the line while below the storage cap, and clears a stale surfaced flag', () => {
    const denState = { ...defaultDenEconomyState(NOW), treats: storageCap(1, 1, 1, 1) - 5 };
    const bookkeeping = { ...defaultNotificationBookkeepingState(), overflowSurfaced: true };

    const result = resolveDoorstepOverflowLine(denState, bookkeeping);

    expect(result.showLine).toBe(false);
    expect(result.nextBookkeeping.overflowSurfaced).toBe(false);
  });
});

describe('learnTimeOfDayBucket', () => {
  function atHour(hour: number): number {
    return new Date(2026, 0, 1, hour, 0, 0).getTime();
  }

  it('returns null with no walk history', () => {
    expect(learnTimeOfDayBucket([])).toBeNull();
  });

  it('picks the most frequent bucket', () => {
    const walks = [atHour(7), atHour(8), atHour(9), atHour(14)]; // 3 morning, 1 midday
    expect(learnTimeOfDayBucket(walks)).toBe('morning');
  });

  it('buckets midday hours correctly', () => {
    expect(learnTimeOfDayBucket([atHour(12), atHour(16)])).toBe('midday');
  });

  it('buckets late-night hours as evening (wraps past midnight)', () => {
    expect(learnTimeOfDayBucket([atHour(23), atHour(1)])).toBe('evening');
  });
});

describe('overflowNotificationBody', () => {
  it('matches the accepted copy shape with the real overflowed treats count substituted', () => {
    expect(overflowNotificationBody(124)).toBe('Your Treat Bakery overflowed! 124 treats waiting.');
    expect(overflowNotificationBody(340)).toBe('Your Treat Bakery overflowed! 340 treats waiting.');
  });

  const rejectedPatterns = [
    'Time for your afternoon walk!',
    "Buddy's waiting by the door",
    "It's been 2 days since your last walk",
    'Claim today\'s territory before midnight!',
  ];

  it.each(rejectedPatterns)('never contains the rejected pattern %p', (pattern) => {
    expect(overflowNotificationBody(124)).not.toContain(pattern);
  });
});

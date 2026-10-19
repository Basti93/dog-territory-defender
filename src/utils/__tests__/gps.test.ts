jest.mock('expo-location', () => ({ Accuracy: { High: 4 } }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn() }));
jest.mock('../log', () => ({ log: jest.fn() }));

import { isAccurateEnough } from '../gps';

describe('isAccurateEnough', () => {
  it('accepts fixes at or under the 50m trail threshold (pocket fixes are 30-50m)', () => {
    expect(isAccurateEnough(5)).toBe(true);
    expect(isAccurateEnough(30)).toBe(true);
    expect(isAccurateEnough(48)).toBe(true);
    expect(isAccurateEnough(50)).toBe(true);
  });

  it('rejects fixes worse than 50m', () => {
    expect(isAccurateEnough(51)).toBe(false);
    expect(isAccurateEnough(205)).toBe(false);
  });
});

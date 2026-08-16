jest.mock('expo-location', () => ({ Accuracy: { High: 4 } }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn() }));
jest.mock('../log', () => ({ log: jest.fn() }));

import { isAccurateEnough } from '../gps';

describe('isAccurateEnough', () => {
  it('accepts fixes at or under the 30m threshold', () => {
    expect(isAccurateEnough(5)).toBe(true);
    expect(isAccurateEnough(30)).toBe(true);
  });

  it('rejects fixes worse than 30m', () => {
    expect(isAccurateEnough(31)).toBe(false);
    expect(isAccurateEnough(205)).toBe(false);
  });
});

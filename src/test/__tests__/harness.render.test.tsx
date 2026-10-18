// Self-test of the component-test harness: proves the leak check can fail and
// that the idle timer floor it relies on still holds.
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';

import { renderScreen, IDLE_TIMER_FLOOR, advance, unmountAndExpectNoTimers } from '../render';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

function Leaky() {
  useEffect(() => {
    setTimeout(() => {}, 5000); // never cleared
  }, []);
  return <Text>leaky</Text>;
}

describe('render harness', () => {
  it('an empty tree leaves exactly the idle timer floor', async () => {
    const view = await renderScreen(<View />);
    await view.unmount();
    await advance(100);
    expect(jest.getTimerCount()).toBe(IDLE_TIMER_FLOOR);
  });

  it('unmountAndExpectNoTimers fails for a component that leaks a timer', async () => {
    const view = await renderScreen(<Leaky />);
    await expect(unmountAndExpectNoTimers(view)).rejects.toThrow();
  });

  it('renderScreen resolves PNG assets through the jest-expo asset transform', async () => {
    const png = require('../../../assets/icon.png');
    expect(png).toBeTruthy();
  });
});

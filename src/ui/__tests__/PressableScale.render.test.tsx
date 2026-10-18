import React from 'react';
import { Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

import { advance, renderScreen, styleOf, unmountAndExpectNoTimers } from '../../test/render';
import { Button } from '../Button';
import { PressableScale, PULSE_MAX_MS } from '../PressableScale';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('PressableScale', () => {
  it('fires onPress once per press', async () => {
    const onPress = jest.fn();
    const view = await renderScreen(
      <PressableScale onPress={onPress}>
        <Text>tap me</Text>
      </PressableScale>
    );
    await fireEvent.press(screen.getByText('tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('blocks onPress when disabled and reports it to accessibility', async () => {
    const onPress = jest.fn();
    const view = await renderScreen(
      <PressableScale onPress={onPress} disabled>
        <Text>tap me</Text>
      </PressableScale>
    );
    await fireEvent.press(screen.getByText('tap me'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
    await unmountAndExpectNoTimers(view);
  });

  it('puts layout keys on the outer Pressable and visual keys on the inner box', async () => {
    const view = await renderScreen(
      <PressableScale style={{ width: 200, marginTop: 8, flex: 1, backgroundColor: 'red', borderRadius: 20 }}>
        <Text>x</Text>
      </PressableScale>
    );
    const outer = styleOf(screen.getByRole('button'));
    expect(outer).toMatchObject({ width: 200, marginTop: 8, flex: 1 });
    expect(outer.backgroundColor).toBeUndefined();
    expect(outer.borderRadius).toBeUndefined();

    // the visual keys live on a descendant
    const inner = screen.getByRole('button').queryAll((n) => styleOf(n).backgroundColor === 'red');
    expect(inner.length).toBeGreaterThan(0);
    await unmountAndExpectNoTimers(view);
  });

  it('stops its pulse after PULSE_MAX_MS and leaves no timers when unmounted mid-pulse', async () => {
    const view = await renderScreen(
      <PressableScale pulse>
        <Text>x</Text>
      </PressableScale>
    );
    await advance(PULSE_MAX_MS + 100);
    await unmountAndExpectNoTimers(view);

    const view2 = await renderScreen(
      <PressableScale pulse>
        <Text>x</Text>
      </PressableScale>
    );
    await advance(500); // still pulsing
    await unmountAndExpectNoTimers(view2);
  });
});

describe('Button', () => {
  it('shows its label, fires onPress once, and uses it as the accessible name', async () => {
    const onPress = jest.fn();
    const view = await renderScreen(<Button label="Start Walk" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Start Walk' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    const view = await renderScreen(<Button label="Start Walk" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByText('Start Walk'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start Walk' })).toBeDisabled();
    await unmountAndExpectNoTimers(view);
  });

  it('forwards layout style (alignSelf, minWidth) to the outer Pressable', async () => {
    const view = await renderScreen(<Button label="Go" style={{ alignSelf: 'stretch', minWidth: 200, marginTop: 12 }} />);
    expect(styleOf(screen.getByRole('button'))).toMatchObject({ alignSelf: 'stretch', minWidth: 200, marginTop: 12 });
    await unmountAndExpectNoTimers(view);
  });
});

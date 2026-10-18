import React from 'react';
import { screen } from '@testing-library/react-native';

import { advance, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { YardExtras } from '../den/YardExtras';
import { yardLayout } from '../den/YardScene';
import { WILD_EXTRA_IDS, WILD_EXTRA_MS } from '../den/wildExtras';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const W = 390;
const H = 400;
const layout = yardLayout(W, H, { doghouse: 300, bakery: 300, sniffGarden: 300 });

describe('YardExtras', () => {
  it.each(WILD_EXTRA_IDS)('%s mounts and leaves no timers behind when unmounted', async (id) => {
    const onDone = jest.fn();
    const view = await renderScreen(<YardExtras id={id} layout={layout} width={W} height={H} onDone={onDone} />);
    expect(screen.getByTestId(`wild-extra-${id}`)).toBeOnTheScreen();
    // (jest-expo's native-driver Animated mock finishes at once, so "mid-play" cannot be pinned here.)
    await unmountAndExpectNoTimers(view);
  });

  it.each(WILD_EXTRA_IDS)('%s reports done once after its choreography', async (id) => {
    const onDone = jest.fn();
    const view = await renderScreen(<YardExtras id={id} layout={layout} width={W} height={H} onDone={onDone} />);
    await advance(WILD_EXTRA_MS[id] + 500);
    expect(onDone).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });
});

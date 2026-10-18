import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { t } from '../../i18n';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { DoorstepScreen } from '../DoorstepScreen';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

async function setup(sessionKind: 'fresh-open' | 'same-day-reopen' = 'fresh-open') {
  const denEconomyRepository = createInMemoryDenEconomyRepository();
  const callbacks = {
    onStartWalk: jest.fn(),
    onOpenMap: jest.fn(),
    onOpenDen: jest.fn(),
    onOpenHistory: jest.fn(),
    onOpenStats: jest.fn(),
    onOpenDebugLog: jest.fn(),
    onOpenLogMissedWalk: jest.fn(),
    onOpenSettings: jest.fn(),
  };
  const view = await renderScreen(
    <DoorstepScreen
      dogName="Rex"
      treats={50}
      level={1}
      accruedDelta={0}
      pendingDenAchievements={[]}
      session={{ kind: sessionKind, greetingFlavor: sessionKind === 'fresh-open' ? 'first-open' : null }}
      greeting="Hello Rex!"
      awayStripLines={[]}
      denEconomyRepository={denEconomyRepository}
      homeRangeRepository={createInMemoryHomeRangeRepository()}
      walkRepository={createInMemoryWalkRepository()}
      buddyAppearance={defaultBuddyAppearance()}
      {...callbacks}
    />
  );
  await screen.findByRole('button', { name: t('doorstep.startWalk') }); // den state loaded
  await flush();
  return { view, ...callbacks };
}

describe('DoorstepScreen', () => {
  it('shows an enabled Start Walk button that starts the walk', async () => {
    const { view, onStartWalk } = await setup();
    const start = screen.getByRole('button', { name: t('doorstep.startWalk') });
    expect(start).toBeEnabled();
    await fireEvent.press(start);
    expect(onStartWalk).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('shows Buddy and the greeting', async () => {
    const { view } = await setup();
    expect(screen.getByLabelText('Rex')).toBeOnTheScreen();
    expect(screen.getByText('Hello Rex!')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('dozes instead of greeting on a same-day reopen', async () => {
    const { view } = await setup('same-day-reopen');
    expect(screen.queryByText('Hello Rex!')).toBeNull();
    expect(screen.getByText(/Zzz/)).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('navigation rows call their callbacks', async () => {
    const { view, onOpenHistory, onOpenStats, onOpenDen } = await setup();
    await fireEvent.press(screen.getByText(t('doorstep.pastWalks')));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText(t('doorstep.statsBadges')));
    expect(onOpenStats).toHaveBeenCalledTimes(1);
    // the Den tease card is the Den's entry point
    await fireEvent.press(screen.getByText(/treats · Upgrade for/));
    expect(onOpenDen).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('the burger menu opens Settings', async () => {
    const { view, onOpenSettings } = await setup();
    await fireEvent.press(screen.getByLabelText(t('doorstep.moreOptions')));
    await fireEvent.press(screen.getByText(t('menu.settings')));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });
});

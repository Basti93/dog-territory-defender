import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { t } from '../../i18n';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { DenScreen } from '../DenScreen';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

// Level-2 costs from balanceConfig: doghouse 60, sniff garden 72, bakery 96.
// 70 treats therefore affords exactly the doghouse upgrade.
async function setup(treats = 70) {
  const repository = createInMemoryDenEconomyRepository();
  await repository.saveState({ ...(await repository.getState()), treats, dogName: 'Rex' });
  const onTreatsChanged = jest.fn();
  const onClose = jest.fn();
  const view = await renderScreen(
    <DenScreen
      repository={repository}
      personalStatsRepository={createInMemoryPersonalStatsRepository()}
      homeRangeRepository={createInMemoryHomeRangeRepository()}
      buddyAppearance={defaultBuddyAppearance()}
      onClose={onClose}
      onTreatsChanged={onTreatsChanged}
    />
  );
  await screen.findByText(t('den.treats'));
  return { repository, onTreatsChanged, onClose, view };
}

describe('DenScreen', () => {
  it('shows three level-1 buildings in the yard and as upgrade cards', async () => {
    const { view } = await setup();
    expect(screen.getAllByText('Lv 1')).toHaveLength(3);
    for (const key of ['doghouse', 'bakery', 'sniffGarden']) {
      expect(screen.getByText(t(`den.building.${key}.name`))).toBeOnTheScreen();
    }
    await unmountAndExpectNoTimers(view);
  });

  it('shows the treat balance and storage cap in the treats pill', async () => {
    const { view } = await setup(70);
    // AnimatedNumber counts up; run its animation to the end
    await flush();
    expect(await screen.findByText(/^70 \/ \d/)).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('pressing an affordable Upgrade button saves the new level and spends the treats', async () => {
    const { repository, onTreatsChanged, view } = await setup(70);
    await fireEvent.press(screen.getByRole('button', { name: /60 treats/ }));
    await flush();
    const saved = await repository.getState();
    expect(saved.doghouseLevel).toBe(2);
    expect(saved.treats).toBe(10);
    expect(onTreatsChanged).toHaveBeenCalledWith(10);
    expect(screen.getByText('Lv 2')).toBeOnTheScreen();
    expect(screen.queryByText(t('den.notEnoughTreats'))).toBeNull();
    // Buddy's 3s excited reaction is still pending here; unmount must cancel it
    await unmountAndExpectNoTimers(view);
  });

  it('an unaffordable upgrade shows the gentle "not enough" message and changes nothing', async () => {
    const { repository, onTreatsChanged, view } = await setup(70);
    await fireEvent.press(screen.getByRole('button', { name: /96 treats/ })); // bakery
    expect(screen.getByText(t('den.notEnoughTreats'))).toBeOnTheScreen();
    const saved = await repository.getState();
    expect(saved.bakeryLevel).toBe(1);
    expect(saved.treats).toBe(70);
    expect(onTreatsChanged).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });

  it('the back button calls onClose', async () => {
    const { onClose, view } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: t('common.back') }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });
});

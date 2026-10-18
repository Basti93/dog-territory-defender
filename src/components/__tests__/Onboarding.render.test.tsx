import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { t } from '../../i18n';
import { renderScreen, styleOf, unmountAndExpectNoTimers } from '../../test/render';
import { OnboardingScreen, PermissionPrimerScreen } from '../onboarding';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

/** The active dot is the wide one (26px); the others are 10px. */
function activeDotIndex(): number {
  const dots = [0, 1, 2].map((i) => screen.getByLabelText(t('onboarding.page', { page: i + 1, total: 3 })));
  return dots.findIndex((dot) => styleOf(dot).width === 26);
}

describe('OnboardingScreen', () => {
  it('shows all three cards', async () => {
    const view = await renderScreen(<OnboardingScreen onDone={jest.fn()} />);
    for (const n of [1, 2, 3]) {
      expect(screen.getByText(t(`onboarding.card${n}.title`))).toBeOnTheScreen();
      expect(screen.getByText(t(`onboarding.card${n}.body`))).toBeOnTheScreen();
    }
    await unmountAndExpectNoTimers(view);
  });

  it('Next advances the dots and the last button calls onDone', async () => {
    const onDone = jest.fn();
    const view = await renderScreen(<OnboardingScreen onDone={onDone} />);
    expect(activeDotIndex()).toBe(0);
    await fireEvent.press(screen.getByText(t('common.next')));
    expect(activeDotIndex()).toBe(1);
    await fireEvent.press(screen.getByText(t('common.next')));
    expect(activeDotIndex()).toBe(2);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByText(t('onboarding.skip'))).toBeNull(); // no Skip on the last card
    await fireEvent.press(screen.getByText(t('onboarding.start')));
    expect(onDone).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('Skip calls onDone', async () => {
    const onDone = jest.fn();
    const view = await renderScreen(<OnboardingScreen onDone={onDone} />);
    await fireEvent.press(screen.getByText(t('onboarding.skip')));
    expect(onDone).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });
});

describe('PermissionPrimerScreen', () => {
  it('buttons call the injected request functions and show the answer', async () => {
    const onRequestLocation = jest.fn().mockResolvedValue(true);
    const onRequestReminders = jest.fn().mockResolvedValue(false);
    const onDone = jest.fn();
    const view = await renderScreen(
      <PermissionPrimerScreen onRequestLocation={onRequestLocation} onRequestReminders={onRequestReminders} onDone={onDone} />
    );

    await fireEvent.press(screen.getByText(t('primer.location.button')));
    expect(onRequestLocation).toHaveBeenCalledTimes(1);
    expect(onRequestReminders).not.toHaveBeenCalled();
    expect(await screen.findByText(t('primer.granted'))).toBeOnTheScreen();

    await fireEvent.press(screen.getByText(t('primer.reminders.button')));
    expect(onRequestReminders).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(t('primer.declined'))).toBeOnTheScreen();

    // once something is answered, "Later" turns into the start button
    expect(screen.queryByText(t('primer.later'))).toBeNull();
    await fireEvent.press(screen.getByText(t('onboarding.start')));
    expect(onDone).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('"Later" calls onDone without asking for anything', async () => {
    const onRequestLocation = jest.fn();
    const onRequestReminders = jest.fn();
    const onDone = jest.fn();
    const view = await renderScreen(
      <PermissionPrimerScreen onRequestLocation={onRequestLocation} onRequestReminders={onRequestReminders} onDone={onDone} />
    );
    await fireEvent.press(screen.getByText(t('primer.later')));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onRequestLocation).not.toHaveBeenCalled();
    expect(onRequestReminders).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });
});

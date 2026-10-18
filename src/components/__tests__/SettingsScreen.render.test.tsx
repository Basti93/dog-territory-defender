import React, { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { LocalePreference, setLocale, t } from '../../i18n';
import { createInMemoryNotificationRepository } from '../../storage/inMemoryNotificationRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { SettingsScreen } from '../SettingsScreen';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  setLocale('en');
});

/** Mirrors App.tsx: applying a preference switches the live locale. */
function Harness({ walkActive = false, onClose = () => {} }: { walkActive?: boolean; onClose?: () => void }) {
  const [pref, setPref] = useState<LocalePreference>('en');
  const [notificationRepository] = useState(createInMemoryNotificationRepository);
  const [walkRepository] = useState(createInMemoryWalkRepository);
  return (
    <SettingsScreen
      onClose={onClose}
      notificationRepository={notificationRepository}
      walkRepository={walkRepository}
      dogName="Rex"
      buddyAppearance={defaultBuddyAppearance()}
      walkActive={walkActive}
      onSaveAppearance={jest.fn()}
      localePreference={pref}
      onChangeLocalePreference={(next) => {
        setPref(next);
        if (next === 'de' || next === 'en') setLocale(next);
      }}
    />
  );
}

async function setup(props: React.ComponentProps<typeof Harness> = {}) {
  const view = await renderScreen(<Harness {...props} />);
  await screen.findByText(t('settings.reminder.title')); // repo state loaded
  await flush();
  return view;
}

describe('SettingsScreen', () => {
  it('shows the three reminder slots, each with a switch and a time', async () => {
    const view = await setup();
    for (const slot of ['morning', 'noon', 'evening']) {
      expect(screen.getByText(t(`settings.reminder.slot.${slot}`))).toBeOnTheScreen();
    }
    // 3 reminder switches + sound + haptics + music
    expect(screen.getAllByRole('switch')).toHaveLength(6);
    await unmountAndExpectNoTimers(view);
  });

  it('the language card switches the screen to German', async () => {
    const view = await setup();
    expect(screen.getByText('Settings')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Deutsch'));
    expect(await screen.findByText('Einstellungen')).toBeOnTheScreen();
    expect(screen.getByText('Morgens')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('backup buttons are enabled when no walk is running', async () => {
    const view = await setup();
    expect(screen.getByRole('button', { name: t('settings.backup.share') })).toBeEnabled();
    expect(screen.getByRole('button', { name: t('settings.backup.restore') })).toBeEnabled();
    expect(screen.queryByText(t('settings.backup.walkActive'))).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('backup buttons are disabled while a walk is active', async () => {
    const view = await setup({ walkActive: true });
    expect(screen.getByRole('button', { name: t('settings.backup.share') })).toBeDisabled();
    expect(screen.getByRole('button', { name: t('settings.backup.restore') })).toBeDisabled();
    expect(screen.getByText(t('settings.backup.walkActive'))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('the back button calls onClose', async () => {
    const onClose = jest.fn();
    const view = await setup({ onClose });
    await fireEvent.press(screen.getByRole('button', { name: t('common.back') }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });
});

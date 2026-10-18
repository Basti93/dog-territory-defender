import React, { useState } from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { LocalePreference, setLocale, t } from '../../i18n';
import { createInMemoryNotificationRepository } from '../../storage/inMemoryNotificationRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { SettingsScreen } from '../SettingsScreen';
import { resetBackActions, runBackActions } from '../../app/backStack';

beforeEach(() => {
  resetBackActions();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  setLocale('en');
});

/** Mirrors App.tsx: applying a preference switches the live locale. */
function Harness({
  walkActive = false,
  onClose = () => {},
  onOpenLogMissedWalk = () => {},
  onOpenDebugLog = () => {},
}: {
  walkActive?: boolean;
  onClose?: () => void;
  onOpenLogMissedWalk?: () => void;
  onOpenDebugLog?: () => void;
}) {
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
      onOpenLogMissedWalk={onOpenLogMissedWalk}
      onOpenDebugLog={onOpenDebugLog}
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
  await screen.findByText(t('post.reminders')); // repo state loaded
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

  it('lists the paper sections in order and opens the missed-walk and debug screens', async () => {
    const onOpenLogMissedWalk = jest.fn();
    const onOpenDebugLog = jest.fn();
    const view = await setup({ onOpenLogMissedWalk, onOpenDebugLog });
    const titles = [t('post.dog'), t('post.reminders'), t('post.sounds'), 'Language / Sprache', t('settings.backup.title'), t('menu.logMissedWalk'), t('menu.debugLog')];
    const headers = screen.getAllByRole('header').map((n) => n.props.children).filter((c) => typeof c === 'string');
    const seen = titles.filter((title) => headers.includes(title) || screen.queryByRole('button', { name: title }));
    expect(seen).toEqual(titles);
    await fireEvent.press(screen.getByRole('button', { name: t('menu.logMissedWalk') }));
    await fireEvent.press(screen.getByRole('button', { name: t('menu.debugLog') }));
    expect(onOpenLogMissedWalk).toHaveBeenCalledTimes(1);
    expect(onOpenDebugLog).toHaveBeenCalledTimes(1);
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

describe('SettingsScreen with a household', () => {
  async function setupWithEngine(joined: boolean) {
    const { makeEngine, makeRepos, IDENTITY } = require('../../test/syncHelpers');
    const repos = makeRepos();
    if (joined) await repos.settings.saveSyncIdentity(IDENTITY);
    const engine = makeEngine(repos, {});
    const view = await renderScreen(
      <SettingsScreen
        onClose={() => {}}
        notificationRepository={createInMemoryNotificationRepository()}
        walkRepository={createInMemoryWalkRepository()}
        dogName="Rex"
        buddyAppearance={defaultBuddyAppearance()}
        walkActive={false}
        onSaveAppearance={jest.fn()}
        onOpenLogMissedWalk={jest.fn()}
        onOpenDebugLog={jest.fn()}
        localePreference="en"
        onChangeLocalePreference={jest.fn()}
        syncEngine={engine}
      />
    );
    await screen.findByText(t('post.reminders'));
    await flush();
    return view;
  }

  it('disables Restore (with a hint) while joined, keeps Share backup, and shows the status line', async () => {
    const view = await setupWithEngine(true);
    expect(screen.getByRole('button', { name: t('settings.backup.restore') })).toBeDisabled();
    expect(screen.getByRole('button', { name: t('settings.backup.share') })).toBeEnabled();
    expect(screen.getByText(t('household.restoreOff'))).toBeOnTheScreen();
    expect(screen.getByText(t('household.status.connected', { player: 'Sam' }))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('household.leave.button') })).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('keeps Restore enabled and offers the join form when not joined', async () => {
    const view = await setupWithEngine(false);
    expect(screen.getByRole('button', { name: t('settings.backup.restore') })).toBeEnabled();
    expect(screen.queryByText(t('household.restoreOff'))).toBeNull();
    expect(screen.getByRole('button', { name: t('household.join.button') })).toBeDisabled(); // needs name + code
    await unmountAndExpectNoTimers(view);
  });
});

describe('SettingsScreen gifts from the neighbour dogs', () => {
  const giftOf = (over: object = {}) => ({ id: 'g1', botId: 'b1', botName: 'Pfote', cosmeticId: 'stick-oak', sprinkleTreats: 3, createdAt: 1, openedAt: null, ...over });

  // The sync engine fills the neighbourhood store; the Post list only reads it, so the gifts are seeded there.
  afterEach(() => require('../../sync/neighbourhoodStore').resetNeighbourhood());

  async function setupWithGifts(client: object, gifts: object[]) {
    const { makeEngine, makeRepos, IDENTITY } = require('../../test/syncHelpers');
    require('../../sync/neighbourhoodStore').setNeighbourhood({ gifts });
    const repos = makeRepos();
    await repos.settings.saveSyncIdentity(IDENTITY);
    const engine = makeEngine(repos, client);
    const view = await renderScreen(
      <SettingsScreen
        onClose={() => {}}
        notificationRepository={createInMemoryNotificationRepository()}
        walkRepository={createInMemoryWalkRepository()}
        dogName="Rex"
        buddyAppearance={defaultBuddyAppearance()}
        walkActive={false}
        onSaveAppearance={jest.fn()}
        onOpenLogMissedWalk={jest.fn()}
        onOpenDebugLog={jest.fn()}
        localePreference="en"
        onChangeLocalePreference={jest.fn()}
        syncEngine={engine}
      />
    );
    await screen.findByText(t('post.reminders'));
    await flush();
    return view;
  }

  it('lists wrapped gifts at the top; Open unwraps one, says the gentle line and removes the row', async () => {
    const { apiDen } = require('../../test/syncHelpers');
    const openGift = jest.fn(async (_id: string, clientId: string) => ({ clientId, ok: true, replayed: false, den: apiDen({ rev: 4 }), serverTime: 1, seq: 1 }));
    const view = await setupWithGifts({ openGift }, [giftOf(), giftOf({ id: 'g2', botName: 'Nebel', cosmeticId: 'sock-odd' })]);
    expect(await screen.findByText(t('neighbours.gift.title'))).toBeOnTheScreen();
    expect(screen.getByText('Oak stick')).toBeOnTheScreen();
    expect(screen.getByText('From Nebel')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('neighbours.gift.openLabel', { bot: 'Pfote', thing: 'Oak stick' }) }));
    await flush();
    expect(openGift).toHaveBeenCalledWith('g1', expect.any(String));
    expect(screen.getByText('Pfote left you a stick.')).toBeOnTheScreen();
    expect(screen.queryByText('Oak stick')).toBeNull();
    expect(screen.getByText('An odd sock')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('keeps the gift and says a gentle retry line when opening did not work', async () => {
    const view = await setupWithGifts(
      {
        openGift: async () => {
          throw new Error('offline');
        },
      },
      [giftOf()]
    );
    await fireEvent.press(await screen.findByRole('button', { name: t('neighbours.gift.openLabel', { bot: 'Pfote', thing: 'Oak stick' }) }));
    await flush();
    expect(screen.getByText(t('neighbours.gift.retry'))).toBeOnTheScreen();
    expect(screen.getByText('Oak stick')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('shows no Gifts section without gifts', async () => {
    const view = await setupWithGifts({}, []);
    expect(screen.queryByText(t('neighbours.gift.title'))).toBeNull();
    await unmountAndExpectNoTimers(view);
  });
});

describe('SettingsScreen hardware back', () => {
  it('closes the look picker first and leaves the screen to the next handler', async () => {
    const view = await setup();
    expect(runBackActions()).toBe(false); // nothing of its own to close on the list
    await fireEvent.press(screen.getByText(t('settings.changeLook', { dog: 'Rex' })));
    expect(screen.getByText(t('settings.lookTitle', { dog: 'Rex' }))).toBeOnTheScreen();
    await act(async () => {
      expect(runBackActions()).toBe(true);
    });
    expect(screen.queryByText(t('settings.lookTitle', { dog: 'Rex' }))).toBeNull();
    await unmountAndExpectNoTimers(view);
  });
});

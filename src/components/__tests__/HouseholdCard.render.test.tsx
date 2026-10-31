import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

import { t } from '../../i18n';
import { renderScreen } from '../../test/render';
import type { SyncEngine, SyncStatus } from '../../sync/syncEngine';
import { HouseholdCard } from '../HouseholdCard';

// A build without EXPO_PUBLIC_SERVER_URL: pinned here so a developer's own env cannot change the outcome.
jest.mock('../../sync/syncConfig', () => ({ ...jest.requireActual('../../sync/syncConfig'), DEFAULT_SERVER_URL: '' }));

const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  joined: true,
  playerName: 'Sam',
  householdName: 'Muster',
  serverUrl: 'https://x.test',
  lastSyncAt: null,
  pending: 0,
  dead: 0,
  busy: false,
  unauthorized: false,
  ...over,
});

const engineWith = (renamePlayer = jest.fn(async () => true)) => ({ renamePlayer, syncNow: jest.fn(), leave: jest.fn(), join: jest.fn() }) as unknown as SyncEngine;

describe('HouseholdCard name', () => {
  it('joined: shows the current name, saves an edited name, and keeps Save off until it changed', async () => {
    const renamePlayer = jest.fn(async () => true);
    await renderScreen(<HouseholdCard engine={engineWith(renamePlayer)} status={status()} onShareBackup={() => {}} deviceLabel="phone" />);
    const input = screen.getByLabelText(t('household.rename.label'));
    expect(input.props.value).toBe('Sam');
    const save = screen.getByText(t('household.rename.save'));
    await fireEvent.press(save);
    expect(renamePlayer).not.toHaveBeenCalled();

    await fireEvent.changeText(input, ' Sam B. ');
    await fireEvent.press(screen.getByText(t('household.rename.save')));
    expect(renamePlayer).toHaveBeenCalledWith(' Sam B. ');
    expect(await screen.findByText(t('household.rename.saved'))).toBeOnTheScreen();
  });

  it('not joined: the name field says it is the person, not the dog', async () => {
    await renderScreen(<HouseholdCard engine={engineWith()} status={status({ joined: false })} onShareBackup={() => {}} deviceLabel="phone" />);
    expect(screen.getByPlaceholderText("Your name (not the dog's)")).toBeOnTheScreen();
  });

  it('not joined, no default server: the address field is empty and joining waits until one is typed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const engine = engineWith();
    await renderScreen(<HouseholdCard engine={engine} status={status({ joined: false })} onShareBackup={() => {}} deviceLabel="phone" />);
    const address = screen.getByPlaceholderText(t('household.serverUrl'));
    expect(address.props.value).toBe('');

    await fireEvent.changeText(screen.getByPlaceholderText(t('household.playerName')), 'Sam');
    await fireEvent.changeText(screen.getByPlaceholderText(t('household.inviteCode')), 'ABCD2345');
    await fireEvent.press(screen.getByText(t('household.join.button')));
    expect(alert).not.toHaveBeenCalled();

    await fireEvent.changeText(address, 'https://typed.test');
    await fireEvent.press(screen.getByText(t('household.join.button')));
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});

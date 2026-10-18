import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { t } from '../../i18n';
import { renderScreen } from '../../test/render';
import type { SyncEngine, SyncStatus } from '../../sync/syncEngine';
import { HouseholdCard } from '../HouseholdCard';

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
});

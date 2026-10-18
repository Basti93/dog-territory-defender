import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { setLocale, t } from '../../i18n';
import { renderScreen } from '../../test/render';
import { DiscardWalkPrompt } from '../DiscardWalkPrompt';

describe('DiscardWalkPrompt', () => {
  it('asks once with Discard and Keep walking', async () => {
    setLocale('en');
    const onDiscard = jest.fn();
    const onKeepWalking = jest.fn();
    await renderScreen(<DiscardWalkPrompt visible onDiscard={onDiscard} onKeepWalking={onKeepWalking} />);
    expect(screen.getByText('Discard this walk?')).toBeOnTheScreen();
    expect(screen.getByText('This walk will not be saved.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Keep walking'));
    expect(onKeepWalking).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Discard'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while hidden', async () => {
    setLocale('en');
    await renderScreen(<DiscardWalkPrompt visible={false} onDiscard={() => {}} onKeepWalking={() => {}} />);
    expect(screen.queryByTestId('discard-walk-prompt')).toBeNull();
  });

  it('speaks German as the owner asked', () => {
    setLocale('de');
    expect(t('walk.discard.title')).toBe('Runde verwerfen?');
    expect(t('walk.discard.body')).toBe('Diese Runde wird nicht gespeichert.');
    expect(t('walk.discard.confirm')).toBe('Verwerfen');
    expect(t('walk.discard.keep')).toBe('Weiterlaufen');
  });
});

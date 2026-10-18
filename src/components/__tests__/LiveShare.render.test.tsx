import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { setLocale, t } from '../../i18n';
import { createInMemorySettingsRepository } from '../../storage/inMemorySettingsRepository';
import { renderScreen } from '../../test/render';
import { LiveSharePrompt } from '../LiveSharePrompt';
import { LiveShareSwitch } from '../LiveShareSwitch';

describe('LiveSharePrompt', () => {
  it('names the partner and answers yes or no', async () => {
    const onAnswer = jest.fn();
    await renderScreen(<LiveSharePrompt visible partnerName="Alex" onAnswer={onAnswer} />);
    expect(screen.getByText('May Alex see your walk live?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(t('liveShare.prompt.no')));
    expect(onAnswer).toHaveBeenLastCalledWith(false);
    await fireEvent.press(screen.getByText(t('liveShare.prompt.yes')));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
  });

  it('says "your household" without a partner name, in German too', async () => {
    await renderScreen(<LiveSharePrompt visible partnerName={null} onAnswer={() => {}} />);
    expect(screen.getByText('May your household see your walk live?')).toBeOnTheScreen();
    setLocale('de');
    expect(t('liveShare.prompt.title', { partner: t('liveShare.partnerFallback') })).toBe('Soll dein Haushalt deine Runde live sehen können?');
  });

  it('renders nothing while hidden', async () => {
    await renderScreen(<LiveSharePrompt visible={false} partnerName="Alex" onAnswer={() => {}} />);
    expect(screen.queryByTestId('live-share-prompt')).toBeNull();
  });
});

describe('LiveShareSwitch', () => {
  it('is off by default, shows the hint with the partner, and switching on is stored (and counts as answering the prompt)', async () => {
    const repo = createInMemorySettingsRepository();
    await renderScreen(<LiveShareSwitch settingsRepository={repo} partnerName="Alex" />);
    expect(await screen.findByText('Alex sees your path while you are out. After 6 hours it is deleted.')).toBeOnTheScreen();
    const sw = screen.getByRole('switch');
    expect(sw.props.value).toBe(false);
    await fireEvent(sw, 'valueChange', true);
    expect(await repo.getLiveShareEnabled()).toBe(true);
    expect(await repo.getLiveSharePromptShown()).toBe(true);
  });
});

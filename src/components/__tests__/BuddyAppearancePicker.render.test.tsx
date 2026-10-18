import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { buddyImageSources } from '../../buddy/imageSkinSources';
import { t } from '../../i18n';
import { imagesIn, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { BuddyAppearancePicker } from '../buddy/BuddyAppearancePicker';

const NAME = 'Rex';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

/** Image sources of the live preview Buddy (the only avatar on the screen). */
function previewSources() {
  const avatar = screen.getByLabelText(NAME);
  return imagesIn(avatar).map((image) => image.props.source);
}

describe('BuddyAppearancePicker', () => {
  it('walks the step captions in order, including Markings', async () => {
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} />);
    const captions = [
      t('buddy.step.coat', { name: NAME }),
      t('buddy.step.markings', { name: NAME }),
      t('buddy.step.ears'),
      t('buddy.step.tail', { name: NAME }),
      t('buddy.step.size'),
      t('buddy.step.done', { name: NAME }),
    ];
    for (let i = 0; i < captions.length; i++) {
      expect(screen.getByText(captions[i])).toBeOnTheScreen();
      if (i < captions.length - 1) await fireEvent.press(screen.getByText(t('common.next')));
    }
    // last step: the primary button becomes the finish button
    expect(screen.getByText(t('dogName.submit'))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('Back returns to the previous step', async () => {
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} />);
    await fireEvent.press(screen.getByText(t('common.next')));
    expect(screen.getByText(t('buddy.step.markings', { name: NAME }))).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(t('common.backButton')));
    expect(screen.getByText(t('buddy.step.coat', { name: NAME }))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('tapping a coat swatch changes the preview Buddy sources', async () => {
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} />);
    const golden = buddyImageSources(defaultBuddyAppearance());
    const ginger = buddyImageSources({ ...defaultBuddyAppearance(), coat: 'ginger' });
    expect(golden.body).not.toEqual(ginger.body);

    expect(previewSources()).toContainEqual(golden.body);
    await fireEvent.press(screen.getByLabelText(t('buddy.coat.ginger')));
    const after = previewSources();
    expect(after).toContainEqual(ginger.body);
    expect(after).not.toContainEqual(golden.body);
    await unmountAndExpectNoTimers(view);
  });

  it('onSave receives the final appearance', async () => {
    const onSave = jest.fn();
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} onSave={onSave} />);
    await fireEvent.press(screen.getByLabelText(t('buddy.coat.ginger')));
    await fireEvent.press(screen.getByText(t('common.next')));
    await fireEvent.press(screen.getByText(t('buddy.markings.patch')));
    for (let i = 0; i < 4; i++) await fireEvent.press(screen.getByText(t('common.next')));
    expect(onSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(t('dogName.submit')));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ ...defaultBuddyAppearance(), coat: 'ginger', markings: 'patch' });
    await unmountAndExpectNoTimers(view);
  });

  it('shows Skip only when onSkip is given', async () => {
    const onSkip = jest.fn();
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} onSkip={onSkip} />);
    await fireEvent.press(screen.getByText(t('buddy.skip')));
    expect(onSkip).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });
});

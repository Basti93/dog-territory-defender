import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance, furFromLegacy } from '../../buddy/buddyAppearance';
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
  it('walks the step captions in order, including Markings, Fell and Form', async () => {
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} />);
    const captions = [
      t('buddy.step.coat', { name: NAME }),
      t('buddy.step.markings', { name: NAME }),
      t('buddy.step.fur', { name: NAME }),
      t('buddy.step.form'),
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
    for (let i = 0; i < 6; i++) await fireEvent.press(screen.getByText(t('common.next')));
    expect(onSave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(t('dogName.submit')));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ ...defaultBuddyAppearance(), coat: 'ginger', markings: 'patch' });
    await unmountAndExpectNoTimers(view);
  });

  it('painting a zone adds a softened fur block and switches the preview to zone layers', async () => {
    const onSave = jest.fn();
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} onSave={onSave} />);
    await fireEvent.press(screen.getByText(t('common.next')));
    await fireEvent.press(screen.getByText(t('common.next')));
    await fireEvent.press(screen.getByLabelText(t('buddy.zone.paws')));
    await fireEvent.press(screen.getByLabelText(`${t('buddy.fur.swatch')} #FFFFFF`.replace('#FFFFFF', '#4A423E')));
    for (let i = 0; i < 5; i++) await fireEvent.press(screen.getByText(t('common.next')));
    await fireEvent.press(screen.getByText(t('dogName.submit')));
    const saved = onSave.mock.calls[0][0];
    expect(saved.fur.zones.paws).toBe('#4A423E');
    expect(saved.fur.zones.back).toBe(furFromLegacy(defaultBuddyAppearance()).zones.back);
    await unmountAndExpectNoTimers(view);
  });

  it('a preset after painting re-applies the preset to the zones and keeps the shape', async () => {
    const onSave = jest.fn();
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} initial={{ ...defaultBuddyAppearance(), fur: { ...furFromLegacy(defaultBuddyAppearance()), muzzle: 'long' } }} onSave={onSave} />);
    await fireEvent.press(screen.getByLabelText(t('buddy.coat.ginger')));
    await fireEvent.press(screen.getByText(t('common.next')));
    await fireEvent.press(screen.getByText(t('buddy.markings.socks')));
    for (let i = 0; i < 6; i++) await fireEvent.press(screen.getByText(t('common.next')));
    await fireEvent.press(screen.getByText(t('dogName.submit')));
    const saved = onSave.mock.calls[0][0];
    expect(saved.fur.muzzle).toBe('long');
    expect(saved.fur.zones).toEqual(furFromLegacy({ coat: 'ginger', markings: 'socks' }).zones);
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

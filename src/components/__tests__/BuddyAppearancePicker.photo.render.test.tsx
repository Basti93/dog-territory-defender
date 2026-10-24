import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { defaultBuddyAppearance, furFromLegacy } from '../../buddy/buddyAppearance';
import type { DogPhotoPort, DogPhotoResult } from '../../dogPhoto/dogPhoto';
import { t } from '../../i18n';
import { renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { BuddyAppearancePicker } from '../buddy/BuddyAppearancePicker';

const NAME = 'Rex';
const PROPOSAL = { ...defaultBuddyAppearance(), coat: 'ginger' as const, earStyle: 'pointy' as const, fur: { ...furFromLegacy(defaultBuddyAppearance()), muzzle: 'long' as const } };

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

function port(over: Partial<DogPhotoPort> & { result?: DogPhotoResult; consent?: boolean } = {}): DogPhotoPort & { analyze: jest.Mock; giveConsent: jest.Mock } {
  let consent = over.consent ?? false;
  return {
    pick: over.pick ?? jest.fn(async () => ['AAAA']),
    analyze: jest.fn(async () => over.result ?? { kind: 'ok', appearance: PROPOSAL }),
    hasConsent: async () => consent,
    giveConsent: jest.fn(async () => {
      consent = true;
    }),
  } as never;
}

describe('BuddyAppearancePicker photo step', () => {
  it('has no photo step without a port', async () => {
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} />);
    expect(screen.queryByText(t('buddy.photo.camera'))).toBeNull();
    expect(screen.getByText(t('buddy.step.coat', { name: NAME }))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('first use: photo -> consent -> proposal -> "Ja, passt" saves the proposal', async () => {
    const p = port();
    const onSave = jest.fn();
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} dogPhoto={p} onSave={onSave} />);
    expect(screen.queryByText(t('buddy.photo.go'))).toBeNull(); // nothing picked yet
    await fireEvent.press(screen.getByText(t('buddy.photo.camera')));
    await fireEvent.press(await screen.findByText(t('buddy.photo.go')));
    expect(p.analyze).not.toHaveBeenCalled(); // consent first
    expect(screen.getByText(t('buddy.photo.consent'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(t('buddy.photo.consentOk')));
    await waitFor(() => expect(screen.getByText(t('buddy.photo.result', { name: NAME }))).toBeOnTheScreen());
    expect(p.giveConsent).toHaveBeenCalledTimes(1);
    expect(p.analyze).toHaveBeenCalledWith(['AAAA']);
    await fireEvent.press(screen.getByText(t('buddy.photo.yes')));
    expect(onSave).toHaveBeenCalledWith(PROPOSAL);
    await unmountAndExpectNoTimers(view);
  });

  it('with consent given before, analysis starts at once; "Selbst anpassen" opens the pre-filled Fell step', async () => {
    const p = port({ consent: true });
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} dogPhoto={p} />);
    await fireEvent.press(screen.getByText(t('buddy.photo.gallery')));
    await fireEvent.press(await screen.findByText(t('buddy.photo.go')));
    await waitFor(() => expect(screen.getByText(t('buddy.photo.tweak'))).toBeOnTheScreen());
    expect(p.giveConsent).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(t('buddy.photo.tweak')));
    expect(screen.getByText(t('buddy.step.fur', { name: NAME }))).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(t('common.next')));
    expect(screen.getByText(t('buddy.step.form'))).toBeOnTheScreen();
    expect(screen.getByText(t('buddy.muzzle.long'))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('a failed or limited analysis is a calm message that leads to the manual picker', async () => {
    for (const [result, key] of [
      [{ kind: 'failed' }, 'buddy.photo.failed'],
      [{ kind: 'limit' }, 'buddy.photo.limit'],
    ] as const) {
      const view = await renderScreen(<BuddyAppearancePicker name={NAME} dogPhoto={port({ consent: true, result })} />);
      await fireEvent.press(screen.getByText(t('buddy.photo.camera')));
      await fireEvent.press(await screen.findByText(t('buddy.photo.go')));
      await waitFor(() => expect(screen.getByText(t(key))).toBeOnTheScreen());
      await fireEvent.press(screen.getByText(t('buddy.photo.continue')));
      expect(screen.getByText(t('buddy.step.coat', { name: NAME }))).toBeOnTheScreen();
      await unmountAndExpectNoTimers(view);
    }
  });

  it('"Ich suche selbst aus" skips to the coat step', async () => {
    const view = await renderScreen(<BuddyAppearancePicker name={NAME} dogPhoto={port()} />);
    await fireEvent.press(screen.getByText(t('buddy.photo.manual')));
    expect(screen.getByText(t('buddy.step.coat', { name: NAME }))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });
});

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { resetBackActions, runBackActions } from '../../app/backStack';
import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { t } from '../../i18n';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryTerritoryRepository } from '../../storage/inMemoryTerritoryRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import type { StoredWalk } from '../../storage/WalkRepository';
import { DAY_MS, manualWalk, newGroundIds, trackedWalk, TUESDAY_AFTERNOON } from '../../test/postcardFixtures';
import { advance, flush, renderScreen } from '../../test/render';
import { resetNeighbourhood } from '../../sync/neighbourhoodStore';
import { AlbumScreen } from '../AlbumScreen';
import { FLIP_HALF_MS } from '../postcards/PostcardCard';

beforeEach(() => {
  jest.useFakeTimers();
  resetBackActions();
});
afterEach(() => {
  resetNeighbourhood();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function setup(walks: StoredWalk[]) {
  const walkRepository = createInMemoryWalkRepository();
  for (const w of walks) await walkRepository.saveWalk(w);
  const onClose = jest.fn();
  const onWalkDeleted = jest.fn();
  await renderScreen(
    <AlbumScreen
      buddyAppearance={defaultBuddyAppearance()}
      walkRepository={walkRepository}
      homeRangeRepository={createInMemoryHomeRangeRepository()}
      territoryRepository={createInMemoryTerritoryRepository()}
      dogName="Rex"
      onClose={onClose}
      onWalkDeleted={onWalkDeleted}
    />
  );
  await flush();
  await flush();
  return { walkRepository, onClose, onWalkDeleted };
}

const threeWalks = () => [
  trackedWalk('w0', { startTime: TUESDAY_AFTERNOON, newGroundCellIds: newGroundIds(33) }), // Tuesday, three new streets
  trackedWalk('w1', { startTime: TUESDAY_AFTERNOON - DAY_MS }), // Monday
  trackedWalk('w2', { startTime: TUESDAY_AFTERNOON - 2 * DAY_MS }), // Sunday
];

const cardButton = (when: string) => screen.getByRole('button', { name: t('album.cardLabel', { when }) });
const flipButton = () => screen.getByRole('button', { name: t('album.flipLabel') });
const flipDone = () => advance(FLIP_HALF_MS * 2 + 50);

describe('Album', () => {
  it('lists every card newest first', async () => {
    await setup(threeWalks());
    const labels = screen.getAllByRole('button', { name: /^Postcard: / }).map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Postcard: Tuesday afternoon', 'Postcard: Monday afternoon', 'Postcard: Sunday afternoon']);
    expect(screen.queryByTestId('postcard-overlay')).toBeNull();
    expect(screen.queryByTestId('webview')).toBeNull(); // thumbnails are drawings, not maps
  });

  it('shows a warm empty state without cards', async () => {
    await setup([]);
    expect(screen.getByText(t('album.empty.title'))).toBeOnTheScreen();
  });

  it('opens a card with exactly one WebView on its front', async () => {
    await setup(threeWalks());
    await fireEvent.press(cardButton('Monday afternoon'));
    expect(screen.getByTestId('postcard-overlay')).toBeOnTheScreen();
    expect(screen.getAllByTestId('webview')).toHaveLength(1);
    expect(screen.queryByTestId('postcard-back')).toBeNull(); // front side up first
  });

  it('flips by tap to the handwritten back and keeps the map mounted underneath', async () => {
    await setup(threeWalks());
    await fireEvent.press(cardButton('Tuesday afternoon'));
    await fireEvent.press(flipButton());
    await flipDone();
    const back = screen.getByTestId('postcard-back');
    expect(back).toBeOnTheScreen();
    expect(screen.getByText('three new streets')).toBeOnTheScreen();
    expect(screen.getByText(/^0\.\d km$/)).toBeOnTheScreen();
    expect(screen.getByText('- Rex')).toBeOnTheScreen();
    expect(screen.getByTestId('postcard-postmark')).toBeOnTheScreen();
    expect(screen.getAllByTestId('webview')).toHaveLength(1); // no reload on the way back
    await fireEvent.press(flipButton());
    await flipDone();
    expect(screen.queryByTestId('postcard-back')).toBeNull();
  });

  it('leaves out the street line when there were no new streets', async () => {
    await setup(threeWalks());
    await fireEvent.press(cardButton('Monday afternoon'));
    await fireEvent.press(flipButton());
    await flipDone();
    expect(screen.queryByText(/new street/)).toBeNull();
  });

  it('back turns a flipped card face-up first, then closes the card, then is not ours anymore', async () => {
    const { onClose } = await setup(threeWalks());
    await fireEvent.press(cardButton('Tuesday afternoon'));
    await fireEvent.press(flipButton());
    await flipDone();
    expect(screen.getByTestId('postcard-back')).toBeOnTheScreen();

    await act(async () => {
      expect(runBackActions()).toBe(true);
    });
    await flipDone();
    expect(screen.queryByTestId('postcard-back')).toBeNull();
    expect(screen.getByTestId('postcard-overlay')).toBeOnTheScreen();

    await act(async () => {
      expect(runBackActions()).toBe(true);
    });
    expect(screen.queryByTestId('postcard-overlay')).toBeNull();
    expect(screen.queryByTestId('webview')).toBeNull();
    expect(onClose).not.toHaveBeenCalled(); // the Album itself is closed by the screen stack, not by this handler

    expect(runBackActions()).toBe(false);
  });

  it('shows a logged walk as the handwriting side only, without a route or a flip', async () => {
    await setup([manualWalk('m', TUESDAY_AFTERNOON), trackedWalk('t', { startTime: TUESDAY_AFTERNOON - DAY_MS })]);
    await fireEvent.press(cardButton('Tuesday'));
    expect(screen.getByTestId('postcard-back')).toBeOnTheScreen();
    expect(screen.queryByTestId('webview')).toBeNull();
    expect(screen.queryByRole('button', { name: t('album.flipLabel') })).toBeNull();
    expect(screen.getByText(t('postcard.postmark.manual'))).toBeOnTheScreen();
    expect(screen.queryByText(/ km$/)).toBeNull();
  });

  it('takes a card away after a confirmation, and tells the household', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { walkRepository, onWalkDeleted } = await setup(threeWalks());
    await fireEvent.press(cardButton('Monday afternoon'));
    await fireEvent.press(screen.getByRole('button', { name: t('album.remove') }));
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => {
      await buttons.find((b) => b.style === 'destructive')!.onPress!();
    });
    await flush();
    expect(onWalkDeleted).toHaveBeenCalledWith('w1');
    expect(await walkRepository.getWalk('w1')).toBeNull();
    expect(screen.queryByTestId('postcard-overlay')).toBeNull();
    expect(screen.queryByRole('button', { name: t('album.cardLabel', { when: 'Monday afternoon' }) })).toBeNull();
  });
});

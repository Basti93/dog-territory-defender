import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { t } from '../../i18n';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { DAY_MS, manualWalk, newGroundIds, stillWalk, trackedWalk, TUESDAY_AFTERNOON } from '../../test/postcardFixtures';
import { flush, renderScreen } from '../../test/render';
import type { StoredWalk } from '../../storage/WalkRepository';
import { WorldScene } from '../world/WorldScene';

// The cards are decoration, hidden from screen readers on purpose (the bench button carries the label).
const HIDDEN = { includeHiddenElements: true };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(walks: StoredWalk[], spy?: (repo: ReturnType<typeof createInMemoryWalkRepository>) => void) {
  const walkRepository = createInMemoryWalkRepository();
  spy?.(walkRepository);
  for (const w of walks) await walkRepository.saveWalk(w);
  const denEconomyRepository = createInMemoryDenEconomyRepository();
  await denEconomyRepository.saveState({ ...(await denEconomyRepository.getState()), treats: 10, dogName: 'Rex' });
  const onOpenHistory = jest.fn();
  await renderScreen(
    <WorldScene
      dogName="Rex"
      treats={10}
      level={1}
      pendingDenAchievements={[]}
      session={{ kind: 'fresh-open', greetingFlavor: 'first-open' }}
      greeting="Hello Rex!"
      awayStripLines={[]}
      denEconomyRepository={denEconomyRepository}
      personalStatsRepository={createInMemoryPersonalStatsRepository()}
      homeRangeRepository={createInMemoryHomeRangeRepository()}
      walkRepository={walkRepository}
      buddyAppearance={defaultBuddyAppearance()}
      onStartWalk={jest.fn()}
      onOpenMap={jest.fn()}
      onOpenHistory={onOpenHistory}
      onOpenSticks={jest.fn()}
      onOpenDiary={jest.fn()}
      onOpenSettings={jest.fn()}
      onTreatsChanged={jest.fn()}
    />
  );
  await screen.findByRole('button', { name: t('world.gateLabel') });
  await flush();
  await flush();
  return { onOpenHistory };
}

const fiveWalks = (over: Record<string, Partial<StoredWalk>> = {}) =>
  Array.from({ length: 5 }, (_, i) => trackedWalk(`w${i}`, { startTime: TUESDAY_AFTERNOON - i * DAY_MS, ...over[`w${i}`] }));

describe('postcards on the bench', () => {
  it('fans the three newest cards, not more', async () => {
    await setup(fiveWalks());
    const ids = screen.getAllByTestId(/^bench-postcard-w\d$/, HIDDEN).map((n) => n.props.testID);
    expect(ids.sort()).toEqual(['bench-postcard-w0', 'bench-postcard-w1', 'bench-postcard-w2']);
  });

  it('reads only the newest walks for the bench, never the whole walk history', async () => {
    let getWalks: jest.SpyInstance | undefined;
    await setup(fiveWalks(), (repo) => {
      getWalks = jest.spyOn(repo, 'getWalks');
    });
    expect(getWalks).not.toHaveBeenCalled();
  });

  it('leaves out walks that painted nothing, and shows a logged walk as a card too', async () => {
    await setup([stillWalk('still', TUESDAY_AFTERNOON), manualWalk('manual', TUESDAY_AFTERNOON - DAY_MS), trackedWalk('real', { startTime: TUESDAY_AFTERNOON - 2 * DAY_MS })]);
    const ids = screen.getAllByTestId(/^bench-postcard-[a-z]+$/, HIDDEN).map((n) => n.props.testID);
    expect(ids.sort()).toEqual(['bench-postcard-manual', 'bench-postcard-real']);
  });

  it('tapping the bench opens the Album', async () => {
    const { onOpenHistory } = await setup(fiveWalks());
    await fireEvent.press(screen.getByRole('button', { name: t('world.albumLabel') }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it('has no counter and no text at all on the cards', async () => {
    await setup(fiveWalks());
    const box = screen.getByTestId('bench-postcards', HIDDEN);
    expect(box.queryAll((node) => node.type === 'Text')).toHaveLength(0);
  });

  it("puts one paw stamp on Buddy's favourite when it is on the bench", async () => {
    await setup(fiveWalks({ w1: { newGroundCellIds: newGroundIds(30) }, w2: { newGroundCellIds: newGroundIds(30) } }));
    // the newest first-time place wins, once
    expect(screen.getAllByTestId(/-stamp$/, HIDDEN).map((n) => n.props.testID)).toEqual(['bench-postcard-w1-stamp']);
  });

  it('shows no stamp when the favourite is not one of the three on the bench', async () => {
    await setup(fiveWalks({ w4: { newGroundCellIds: newGroundIds(30) } }));
    expect(screen.queryAllByTestId(/-stamp$/, HIDDEN)).toHaveLength(0);
  });

  it('shows no cards on an empty bench', async () => {
    await setup([]);
    expect(screen.queryByTestId('bench-postcards', HIDDEN)).toBeNull();
    expect(screen.getByRole('button', { name: t('world.albumLabel') })).toBeOnTheScreen();
  });
});

describe('a new postcard arrives in the mailbox first', () => {
  it('stays off the bench until Buddy pulls it out, then lands on the bench with his line', async () => {
    await setup([...fiveWalks(), trackedWalk('fresh', { startTime: Date.now() + 1000 })]);
    expect(screen.queryByTestId('bench-postcard-fresh', HIDDEN)).toBeNull();
    expect(screen.getByTestId('mailbox-flag')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('mailbox'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(6000);
    });
    expect(await screen.findByText(t('inbox.postcardToBench'))).toBeOnTheScreen();
    expect(screen.getByTestId('bench-postcard-fresh', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('mailbox-flag')).toBeNull();
  });
});

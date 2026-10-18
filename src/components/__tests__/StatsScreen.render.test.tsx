import React from 'react';
import { act, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { defaultPersonalStatsState, PersonalStatsState } from '../../economy/personalStats';
import { setLocale, t } from '../../i18n';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { CELLS_PER_STREET } from '../../utils/grid';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import type { AchievementId } from '../../economy/personalStats';
import { flush, renderScreen } from '../../test/render';
import { StatsScreen } from '../StatsScreen';

const HIDDEN = { includeHiddenElements: true };
const UNLOCKED_AT = new Date(2026, 9, 13, 12).getTime();

async function setup(statsPatch: Partial<PersonalStatsState>, unlockedIds: AchievementId[], locale: 'en' | 'de' = 'en', paintedCells = 0) {
  const repository = createInMemoryPersonalStatsRepository();
  await repository.saveState({ ...defaultPersonalStatsState(), ...statsPatch });
  await repository.unlockAchievements(unlockedIds, UNLOCKED_AT);
  const homeRangeRepository = createInMemoryHomeRangeRepository();
  for (let i = 0; i < paintedCells; i++) await homeRangeRepository.paintCells([{ ix: i, iy: 0, refreshedAt: UNLOCKED_AT, tracked: true }]);
  const result = await renderScreen(
    <StatsScreen
      buddyAppearance={defaultBuddyAppearance()}
      repository={repository}
      denEconomyRepository={createInMemoryDenEconomyRepository()}
      homeRangeRepository={homeRangeRepository}
      onClose={jest.fn()}
    />
  );
  await act(async () => setLocale(locale));
  await flush();
  await flush();
  return result;
}

const earnedIds = (ids: AchievementId[]) => ids.map((id) => screen.queryByTestId(`stats-badge-${id}`, HIDDEN));

describe('StatsScreen', () => {
  it('lists earned badges as rosettes, including the territory badges that stay off the fence', async () => {
    await setup({ totalWalksClosed: 12, biggestTerritoryAreaM2: 800 }, ['first-steps', 'paws-on-the-pavement', 'ground-claimed']);
    expect(earnedIds(['first-steps', 'paws-on-the-pavement', 'ground-claimed']).every(Boolean)).toBe(true);
    expect(screen.getAllByText(/^Earned /, HIDDEN)).toHaveLength(3);
  });

  it('keeps unearned badges invisible, with no "you are at N" copy', async () => {
    await setup({ totalWalksClosed: 3 }, ['first-steps']);
    expect(screen.queryByTestId('stats-badge-paws-on-the-pavement', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('stats-badge-hundred-walks', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('stats-hook', HIDDEN)).toBeNull();
    expect(screen.queryByText(/you're at/i, { ...HIDDEN })).toBeNull();
  });

  it('shows at most one "soon" hook, from 80 percent, with no digits in it', async () => {
    // familiar-trails (25 walks) is at 21/25; the 100 km badge and the treat badges are far away.
    await setup({ totalWalksClosed: 21, lifetimeDistanceMeters: 4200 }, ['first-steps', 'paws-on-the-pavement']);
    const hook = screen.getByTestId('stats-hook', HIDDEN);
    expect(hook).toBeTruthy();
    expect(screen.queryAllByTestId('stats-hook', HIDDEN)).toHaveLength(1);
    expect(screen.getByText(t('world.fence.hookSign'), HIDDEN)).toBeTruthy();
    expect(t('world.fence.hookSign')).not.toMatch(/\d/);
    // The hook is not an earned badge.
    expect(screen.queryByTestId('stats-badge-familiar-trails', HIDDEN)).toBeNull();
  });

  it('picks only the nearest of two badges over 80 percent', async () => {
    await setup({ totalWalksClosed: 21, lifetimeDistanceMeters: 4900 }, ['first-steps', 'paws-on-the-pavement']);
    expect(screen.queryAllByTestId('stats-hook', HIDDEN)).toHaveLength(1);
  });

  it('shows no German progress copy ("du bist bei") in either language', async () => {
    await setup({ totalWalksClosed: 21 }, ['first-steps', 'paws-on-the-pavement'], 'de');
    expect(screen.queryByText(/du bist bei/i, HIDDEN)).toBeNull();
    expect(screen.getByTestId('stats-hook', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Bald: Rosette', HIDDEN)).toBeTruthy();
  });

  it('puts the lifetime numbers on signs, only the household\'s own', async () => {
    await setup({ totalWalksClosed: 19, lifetimeDistanceMeters: 1700, longestWalkDistanceM: 620 }, ['first-steps']);
    expect(screen.getByTestId('stats-sign-walks', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('stats-sign-distance', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('stats-sign-longest', HIDDEN)).toBeTruthy();
    expect(screen.getByText('19', HIDDEN)).toBeTruthy();
  });

  it('shows a friendly empty line, without emoji, before the first badge', async () => {
    await setup({}, []);
    expect(screen.getByText(t('stats.badgesEmpty'), HIDDEN)).toBeTruthy();
    expect(t('stats.badgesEmpty')).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('shows the streets sign only once the Range has cells', async () => {
    await setup({ totalWalksClosed: 1 }, ['first-steps']);
    expect(screen.queryByTestId('stats-sign-streets', HIDDEN)).toBeNull();
  });

  it('counts the streets the dog knows on a sign', async () => {
    await setup({ totalWalksClosed: 1 }, ['first-steps'], 'en', CELLS_PER_STREET * 3);
    expect(screen.getByTestId('stats-sign-streets', HIDDEN)).toBeTruthy();
    expect(screen.getByText('3', HIDDEN)).toBeTruthy();
  });
});

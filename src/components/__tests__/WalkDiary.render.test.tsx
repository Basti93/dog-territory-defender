import React from 'react';
import { screen } from '@testing-library/react-native';

import { t } from '../../i18n';
import { createInMemorySettingsRepository } from '../../storage/inMemorySettingsRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { eastwardTrail, trackedWalk } from '../../test/postcardFixtures';
import { flush, renderScreen } from '../../test/render';
import { WalkDiaryScreen } from '../WalkDiaryScreen';

async function open(minutes: number[]) {
  const walkRepository = createInMemoryWalkRepository();
  const settingsRepository = createInMemorySettingsRepository();
  for (const [i, m] of minutes.entries()) {
    const startTime = new Date(2026, 9, 1 + i, 8, 0).getTime();
    await walkRepository.saveWalk(trackedWalk(`w${i}`, { startTime, locations: eastwardTrail(startTime, m * 30 + 1) }));
  }
  await renderScreen(
    <WalkDiaryScreen walkRepository={walkRepository} settingsRepository={settingsRepository} onClose={jest.fn()} />
  );
  await flush();
  await flush();
  return settingsRepository;
}

describe('Walk diary screen', () => {
  it('shows only the teaser before three walks', async () => {
    await open([20, 30]);
    expect(screen.getByText(t('diary.teaser.one'))).toBeTruthy();
    expect(screen.queryByTestId('walk-diary')).toBeNull();
    expect(screen.getByText(t('diary.screen.title'))).toBeTruthy();
  });

  it('shows the diary with the intro once, and remembers it', async () => {
    const settings = await open([20, 30, 40]);
    expect(screen.getByTestId('walk-diary')).toBeTruthy();
    expect(screen.getByText(t('diary.intro'))).toBeTruthy();
    expect(screen.getByTestId('diary-bucket-morning')).toBeTruthy();
    expect(await settings.getDiarySeen()).toEqual({ introShown: true, longestMs: 40 * 60000 });
  });
});

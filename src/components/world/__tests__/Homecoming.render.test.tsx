import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { defaultBuddyAppearance } from '../../../buddy/buddyAppearance';
import type { WalkRewardsCelebration } from '../../../economy/walkRewards';
import { t } from '../../../i18n';
import { advance, flush, renderScreen, unmountAndExpectNoTimers } from '../../../test/render';
import * as sounds from '../../../feedback/sounds';
import { Homecoming, HomecomingProps, TAP_LOCK_MS } from '../Homecoming';
import { HomecomingWalk, partnerHomecomingWalk, resetClosingLineMemory } from '../homecomingPlan';
import { sceneLayout, worldYardLayout } from '../sceneLayout';

jest.mock('../../../feedback/sounds', () => ({
  ...jest.requireActual('../../../feedback/sounds'),
  play: jest.fn(),
  playBuddy: jest.fn(),
}));

import { ACHIEVEMENTS, AchievementId } from '../../../economy/personalStats';
const BADGE = Object.keys(ACHIEVEMENTS)[0] as AchievementId;

const rewards = (over: Partial<WalkRewardsCelebration> = {}): WalkRewardsCelebration => ({
  cellsPainted: 40,
  hasTerritory: true,
  treatsEarned: 20,
  tease: null,
  unlockedAchievements: [],
  leveledUpTo: null,
  oldTreatsPerWalk: null,
  newTreatsPerWalk: null,
  cliffhangerTitle: null,
  newGroundCellCount: 0,
  bloomMultiplier: 1,
  ...over,
});
const walk = (over: Partial<HomecomingWalk> = {}): HomecomingWalk => ({
  walkId: 'w1',
  rewards: rewards(),
  newTerritoryName: null,
  mergedTerritoryNames: null,
  territoryName: 'Park',
  distanceMeters: 2400,
  walkTime: new Date(2026, 9, 13, 19, 0).getTime(),
  manual: false,
  ...over,
});

const layout = sceneLayout(844, 390, 47);
const yard = worldYardLayout(390, layout.yardH);

async function setup(w: HomecomingWalk, extra: Partial<HomecomingProps> = {}) {
  const onCamera = jest.fn();
  const onDone = jest.fn();
  const view = await renderScreen(
    <Homecoming
      walk={w}
      walkCount={3}
      dog="Rex"
      appearance={defaultBuddyAppearance()}
      layout={layout}
      yard={yard}
      bowl={{ total: 100, cap: 200 }}
      level={1}
      levelTitle={null}
      onCamera={onCamera}
      onDone={onDone}
      {...extra}
    />
  );
  await flush();
  return { view, onCamera, onDone };
}

const tap = async () => {
  await advance(TAP_LOCK_MS + 50);
  await fireEvent.press(screen.getByTestId('homecoming-tap'));
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetClosingLineMemory();
});
afterEach(() => jest.useRealTimers());

describe('Homecoming', () => {
  it('plays patch, bowl, rest, one tap per beat, then hands back to the scene', async () => {
    const { view, onCamera, onDone } = await setup(walk());
    // Beat 1: the star.
    expect(screen.getByTestId('homecoming-number')).toBeOnTheScreen();
    expect(screen.getByText(t('homecoming.hint'))).toBeOnTheScreen();
    expect(sounds.play).toHaveBeenCalledWith('celebrate');
    await advance(200);
    expect(onCamera).toHaveBeenLastCalledWith('viertel');

    // Beat 2: treats into the bowl, hint is gone, treat sound exactly once.
    await tap();
    expect(screen.queryByTestId('homecoming-number')).toBeNull();
    expect(screen.queryByText(t('homecoming.hint'))).toBeNull();
    await advance(200);
    expect(onCamera).toHaveBeenLastCalledWith('yard');
    for (let i = 0; i < 40; i++) await advance(100);
    expect(screen.getByText(t('world.bowlSign', { count: '100', cap: '200' }))).toBeOnTheScreen();
    expect(sounds.play).toHaveBeenCalledWith('treat');
    expect((sounds.play as jest.Mock).mock.calls.filter((c) => c[0] === 'treat')).toHaveLength(1);

    // Beat 3 (rest, no extras): Buddy lies down, closing line on the note.
    await tap();
    expect(screen.getByTestId('homecoming-closing')).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();

    await tap();
    expect(onDone).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('a double tap does not skip a beat', async () => {
    const { view } = await setup(walk());
    await advance(TAP_LOCK_MS + 50);
    await fireEvent.press(screen.getByTestId('homecoming-tap'));
    await fireEvent.press(screen.getByTestId('homecoming-tap'));
    expect(screen.queryByTestId('homecoming-closing')).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('inserts the extras beat with a badge sign when a badge was earned', async () => {
    const { view } = await setup(walk({ rewards: rewards({ unlockedAchievements: [BADGE] }) }));
    await tap();
    await tap();
    expect(screen.getByTestId('homecoming-badge')).toBeOnTheScreen();
    expect(screen.queryByTestId('homecoming-closing')).toBeNull();
    await tap();
    expect(screen.getByTestId('homecoming-closing')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  describe('corner prompt (Unsere Ecken)', () => {
    const withCorner = () => walk({ corner: { id: '5,6', name: 'Ecke Lindenstraße' } });

    it('asks once in beat 3: the button names the corner, any other tap skips it for free', async () => {
      const onNameCorner = jest.fn();
      const { view, onDone } = await setup(withCorner(), { onNameCorner });
      await tap();
      await tap();
      expect(screen.getByTestId('homecoming-corner')).toBeOnTheScreen();
      expect(screen.getByText(t('corner.prompt'))).toBeOnTheScreen();
      expect(screen.getByText('Ecke Lindenstraße')).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId('homecoming-corner-name'));
      expect(onNameCorner).toHaveBeenCalledWith('5,6');
      // Still in beat 3 (the sheet opens over it); a tap elsewhere moves on to the closing line and the prompt is gone for good.
      expect(screen.queryByTestId('homecoming-closing')).toBeNull();
      await tap();
      expect(screen.queryByTestId('homecoming-corner')).toBeNull();
      expect(screen.getByTestId('homecoming-closing')).toBeOnTheScreen();
      expect(onNameCorner).toHaveBeenCalledTimes(1);
      await tap();
      expect(onDone).toHaveBeenCalledTimes(1);
      await unmountAndExpectNoTimers(view);
    });

    it('shares beat 3 with a badge (two extras), and never shows up for a walk without a new corner', async () => {
      const { view } = await setup(walk({ corner: { id: '5,6', name: 'Unsere Ecke' }, rewards: rewards({ unlockedAchievements: [BADGE] }) }));
      await tap();
      await tap();
      expect(screen.getByTestId('homecoming-corner')).toBeOnTheScreen();
      expect(screen.getByTestId('homecoming-badge')).toBeOnTheScreen();
      await unmountAndExpectNoTimers(view);

      const plain = await setup(walk({ rewards: rewards({ unlockedAchievements: [BADGE] }) }));
      await tap();
      await tap();
      expect(screen.queryByTestId('homecoming-corner')).toBeNull();
      await unmountAndExpectNoTimers(plain.view);
    });
  });

  it('the manual-log version is bowl then rest, with no camera trip to the Viertel', async () => {
    const { view, onCamera, onDone } = await setup(walk({ manual: true, territoryName: null }));
    expect(screen.queryByTestId('homecoming-number')).toBeNull();
    await advance(200);
    expect(onCamera).not.toHaveBeenCalledWith('viertel');
    await tap();
    expect(screen.getByTestId('homecoming-closing')).toBeOnTheScreen();
    await tap();
    expect(onDone).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });
});

describe('Homecoming variant Partner', () => {
  const partnerWalk = () => partnerHomecomingWalk({ walkId: 'wp', name: 'Alex', treatsEarned: 14, newGroundCellCount: 0, distanceMeters: 2100, walkTime: Date.now() });

  it('plays the star, the treats and her return line, quietly (no celebrate fanfare), and nothing more', async () => {
    const { view, onDone, onCamera } = await setup(partnerWalk());
    expect(screen.getByTestId('homecoming-number')).toBeOnTheScreen();
    expect(sounds.play).not.toHaveBeenCalledWith('celebrate');
    await advance(200);
    expect(onCamera).toHaveBeenLastCalledWith('viertel');
    await tap();
    expect(screen.queryByTestId('homecoming-number')).toBeNull();
    for (let i = 0; i < 40; i++) await advance(100);
    expect(sounds.play).toHaveBeenCalledWith('treat'); // the treats roll in, that is the sound
    await tap();
    expect(screen.getByTestId('homecoming-closing')).toBeOnTheScreen();
    expect(screen.getByText('Alex and Rex are back.')).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
    await tap();
    expect(onDone).toHaveBeenCalledTimes(1); // three beats, not four
    await unmountAndExpectNoTimers(view);
  });
});

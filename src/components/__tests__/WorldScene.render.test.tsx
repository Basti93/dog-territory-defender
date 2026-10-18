import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { t } from '../../i18n';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { advance, flush, imagesIn, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { pickSceneNotes, WorldScene, WorldSceneProps } from '../world/WorldScene';
import * as sounds from '../../feedback/sounds';

jest.mock('../../feedback/sounds', () => ({
  ...jest.requireActual('../../feedback/sounds'),
  play: jest.fn(),
  playBuddy: jest.fn(),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});

// Level-2 costs from balanceConfig: doghouse 60, sniff garden 72, bakery 96.
async function setup(extra: Partial<WorldSceneProps> = {}, treats = 70) {
  const denEconomyRepository = createInMemoryDenEconomyRepository();
  await denEconomyRepository.saveState({ ...(await denEconomyRepository.getState()), treats, dogName: 'Rex' });
  const callbacks = {
    onStartWalk: jest.fn(),
    onOpenMap: jest.fn(),
    onOpenHistory: jest.fn(),
    onOpenSettings: jest.fn(),
    onTreatsChanged: jest.fn(),
  };
  const view = await renderScreen(
    <WorldScene
      dogName="Rex"
      treats={treats}
      level={1}
      pendingDenAchievements={[]}
      session={{ kind: 'fresh-open', greetingFlavor: 'first-open' }}
      greeting="Hello Rex!"
      awayStripLines={[]}
      denEconomyRepository={denEconomyRepository}
      personalStatsRepository={createInMemoryPersonalStatsRepository()}
      homeRangeRepository={createInMemoryHomeRangeRepository()}
      walkRepository={createInMemoryWalkRepository()}
      buddyAppearance={defaultBuddyAppearance()}
      {...callbacks}
      {...extra}
    />
  );
  await screen.findByRole('button', { name: t('world.gateLabel') });
  await flush();
  return { view, denEconomyRepository, ...callbacks };
}

describe('WorldScene', () => {
  it('shows the gate sign and starts the walk after the gate swings open', async () => {
    const { view, onStartWalk } = await setup();
    expect(screen.getByText(t('world.gate'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('world.gateLabel') }));
    expect(onStartWalk).not.toHaveBeenCalled(); // the 600 ms gate beat comes first
    await advance(650);
    expect(onStartWalk).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: t('world.gateLabel') })); // closing again after the beat
    await advance(1000);
    await unmountAndExpectNoTimers(view);
  });

  it('a double tap on the gate starts only one walk', async () => {
    const { view, onStartWalk } = await setup();
    const sign = screen.getByRole('button', { name: t('world.gateLabel') });
    await fireEvent.press(sign);
    await fireEvent.press(sign);
    await advance(650);
    expect(onStartWalk).toHaveBeenCalledTimes(1);
    await advance(1000);
    await unmountAndExpectNoTimers(view);
  });

  it('pressing Buddy plays his sound and also heads for the gate', async () => {
    const { view, onStartWalk } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Rex' }));
    expect(sounds.playBuddy).toHaveBeenCalledTimes(1);
    await advance(650);
    expect(onStartWalk).toHaveBeenCalledTimes(1);
    await advance(1000);
    await unmountAndExpectNoTimers(view);
  });

  it('tapping a building folds out its sign with the real upgrade cost, and upgrading spends the treats', async () => {
    const { view, onTreatsChanged, denEconomyRepository } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: t('den.showUpgrade', { name: t('den.building.doghouse.name') }) }));
    const upgrade = screen.getByRole('button', { name: 'Upgrade for 60' });
    await fireEvent.press(upgrade);
    await flush();
    const saved = await denEconomyRepository.getState();
    expect(saved.doghouseLevel).toBe(2);
    expect(saved.treats).toBe(10);
    expect(onTreatsChanged).toHaveBeenCalledWith(10);
    await unmountAndExpectNoTimers(view);
  });

  it('an unaffordable upgrade shows the gentle message and changes nothing', async () => {
    const { view, onTreatsChanged, denEconomyRepository } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: t('den.showUpgrade', { name: t('den.building.bakery.name') }) }));
    await fireEvent.press(screen.getByRole('button', { name: 'Upgrade for 96' }));
    expect(screen.getByText(t('den.notEnoughTreats'))).toBeOnTheScreen();
    expect((await denEconomyRepository.getState()).bakeryLevel).toBe(1);
    expect(onTreatsChanged).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });

  it('the cheapest affordable building says "Upgrade possible" instead of its level', async () => {
    const { view } = await setup();
    expect(screen.getByText(t('world.upgradePossible'))).toBeOnTheScreen();
    expect(screen.getByText('Treat Bakery · Lv 1')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('bench, mailbox and the neighbourhood call their callbacks', async () => {
    const { view, onOpenHistory, onOpenSettings, onOpenMap } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: t('world.albumLabel') }));
    await fireEvent.press(screen.getByRole('button', { name: t('world.album') }));
    expect(onOpenHistory).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: t('world.postLabel') }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    // no painted ground yet: the Viertel shows its gentle empty note instead of the portrait
    expect(screen.getByText(t('doorstep.emptyRange', { dog: 'Rex' }))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('tapping the embedded Viertel opens the full map', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    await homeRangeRepository.paintCells([{ ix: 1, iy: 1, refreshedAt: Date.now(), tracked: true, territoryId: null } as never]);
    const { view, onOpenMap } = await setup({ homeRangeRepository });
    await fireEvent.press(await screen.findByRole('button', { name: t('world.neighbourhoodLabel') }));
    expect(onOpenMap).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('the bowl shows the treats sign (no action)', async () => {
    const { view } = await setup();
    expect(screen.getByText(/^70 of \d/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^Bowl: 70 of/ }));
    await advance(2500);
    await unmountAndExpectNoTimers(view);
  });

  it('the den alias opens the next-upgrade panel and reports it handled', async () => {
    const onDenPanelHandled = jest.fn();
    const { view } = await setup({ openDenPanel: true, onDenPanelHandled });
    expect(onDenPanelHandled).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /^Upgrade for / })).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('shows at most two notes and the OTA card comes first', async () => {
    const updateCard = { onApply: jest.fn(), onLater: jest.fn() };
    const { view } = await setup({
      updateCard,
      awayStripLines: [
        { text: 'Line one', kind: 'treats' },
        { text: 'Line two', kind: 'achievement' },
      ],
    });
    expect(screen.getByText(t('update.ready'))).toBeOnTheScreen();
    expect(screen.getByText('Line one')).toBeOnTheScreen();
    expect(screen.queryByText('Line two')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: t('update.now') }));
    expect(updateCard.onApply).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('every Image in the scene is inert to touches (pointerEvents none on it or an ancestor) unless inside a button', async () => {
    await setup();
    const images = imagesIn(screen.root);
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      let node: TestInstance | null = img;
      let verdict = 'reachable';
      while (node) {
        if (node.props.pointerEvents === 'none') {
          verdict = 'inert';
          break;
        }
        if (node.props.accessibilityRole === 'button') {
          verdict = 'inside-button';
          break;
        }
        node = node.parent;
      }
      expect(verdict).not.toBe('reachable');
    }
  });
});

describe('pickSceneNotes', () => {
  const lines = [
    { text: 'a', kind: 'treats' as const },
    { text: 'b', kind: 'treats' as const },
    { text: 'c', kind: 'treats' as const },
  ];
  it('caps at two, update card first', () => {
    expect(pickSceneNotes(lines, null, true, new Set()).map((n) => n.key)).toEqual(['update', 'line-0']);
    expect(pickSceneNotes(lines, null, false, new Set()).map((n) => n.key)).toEqual(['line-0', 'line-1']);
  });
  it('uses the greeting only when nothing else is there, and skips dismissed notes', () => {
    expect(pickSceneNotes([], 'Hi', false, new Set()).map((n) => n.text)).toEqual(['Hi']);
    expect(pickSceneNotes(lines, 'Hi', false, new Set(['line-0'])).map((n) => n.key)).toEqual(['line-1', 'line-2']);
  });

  it('plays the homecoming over the scene: Buddy leaves the yard, a tap moves on, the end hands back', async () => {
    const onDone = jest.fn();
    const homecoming = {
      onDone,
      walk: {
        walkId: 'w1',
        rewards: {
          cellsPainted: 40,
          hasTerritory: true,
          treatsEarned: 10,
          tease: null,
          unlockedAchievements: [],
          leveledUpTo: null,
          oldTreatsPerWalk: null,
          newTreatsPerWalk: null,
          cliffhangerTitle: null,
          newGroundCellCount: 0,
          bloomMultiplier: 1,
        },
        newTerritoryName: null,
        mergedTerritoryNames: null,
        territoryName: 'Park',
        distanceMeters: 1500,
        walkTime: Date.now(),
        manual: false,
      },
    };
    const { view, onStartWalk } = await setup({ homecoming });
    await flush();
    expect(screen.getByTestId('homecoming-number')).toBeOnTheScreen();
    await advance(500);
    for (let i = 0; i < 3; i++) {
      await fireEvent.press(screen.getByTestId('homecoming-tap'));
      await advance(500);
    }
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onStartWalk).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });
});

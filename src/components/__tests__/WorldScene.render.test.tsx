import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Dimensions, ScrollView } from 'react-native';
import type { TestInstance } from 'test-renderer';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { t } from '../../i18n';
import { DenEconomyState } from '../../economy/denEconomy';
import { passiveTreatsPerHour } from '../../economy/formulas';
import { formatRatePerHour } from '../world/bakeryRules';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { createInMemoryTerritoryRepository } from '../../storage/inMemoryTerritoryRepository';
import { cellCentre } from '../../utils/grid';
import { createInMemorySettingsRepository } from '../../storage/inMemorySettingsRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { advance, flush, imagesIn, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { pickSceneNotes, WorldScene, WorldSceneProps } from '../world/WorldScene';
import { buildingSelectOffset, buildingsLayout, sceneLayout } from '../world/sceneLayout';
import { resetBackActions, runBackActions } from '../../app/backStack';
import * as sounds from '../../feedback/sounds';
import type { ApiGift, CoopWeekResponse, NearbyItem } from '../../sync/apiContract';
import { resetNeighbourhood, setNearby, setNeighbourhood } from '../../sync/neighbourhoodStore';
import type { NeighbourhoodActions } from '../../sync/neighbourhood';
import { clearPartnerPresence, PRESENCE_STALE_MS, setPartnerPresence } from '../../sync/presenceStore';
import { partnerHomecomingWalk } from '../world/homecomingPlan';
import { ACHIEVEMENTS, AchievementId, defaultPersonalStatsState } from '../../economy/personalStats';

const { posted } = require('react-native-webview') as { posted: string[] };

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
  resetNeighbourhood();
  clearPartnerPresence();
});

// Level-2 costs from balanceConfig: doghouse 60, sniff garden 72, bakery 96.
async function setup(extra: Partial<WorldSceneProps> = {}, treats = 70, stateExtra: Partial<DenEconomyState> = {}) {
  const denEconomyRepository = createInMemoryDenEconomyRepository();
  await denEconomyRepository.saveState({ ...(await denEconomyRepository.getState()), treats, dogName: 'Rex', ...stateExtra });
  const callbacks = {
    onStartWalk: jest.fn(),
    onOpenMap: jest.fn(),
    onCancelWalk: jest.fn(),
    onOpenHistory: jest.fn(),
    onOpenSticks: jest.fn(),
    onOpenDiary: jest.fn(),
    onOpenSettings: jest.fn(),
    onOpenStats: jest.fn(),
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
  await screen.findByRole('button', { name: extra.walkActive ? t('walk.gateBackLabel') : t('world.gateLabel') });
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

  it('pressing Buddy plays his sound and does not start a walk', async () => {
    const { view, onStartWalk, onOpenMap } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Rex' }));
    expect(sounds.playBuddy).toHaveBeenCalledTimes(1);
    await advance(1500); // longer than the gate beat: nothing may start
    expect(onStartWalk).not.toHaveBeenCalled();
    expect(onOpenMap).not.toHaveBeenCalled();
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
    expect(screen.getByText('Treat Bakery · Lv\u00A01')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('every building whose next upgrade is affordable says "Upgrade possible"; pennant and sparkle stay on the cheapest', async () => {
    const a = await setup({}, 100); // doghouse 60, sniff garden 72 and bakery 96 are all affordable
    expect(screen.getAllByText(t('world.upgradePossible'))).toHaveLength(3);
    expect(screen.getAllByText(/^→ /).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByTestId('upgrade-sparkle')).toHaveLength(1);
    await unmountAndExpectNoTimers(a.view);
    const b = await setup({}, 80); // doghouse and sniff garden only
    expect(screen.getAllByText(t('world.upgradePossible'))).toHaveLength(2);
    expect(screen.getByText('Treat Bakery · Lv\u00A01')).toBeOnTheScreen();
    expect(screen.getAllByTestId('upgrade-sparkle')).toHaveLength(1);
    await unmountAndExpectNoTimers(b.view);
  });

  it('the stick pile is always there and is the one entry to the stick shelf (no "Sticks" sign); the diary prop opens the diary', async () => {
    const { view, onOpenSticks, onOpenDiary } = await setup();
    expect(screen.getByTestId('stick-pile')).toBeOnTheScreen();
    expect(screen.queryByText('Sticks')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: t('world.sticksLabel') }));
    expect(onOpenSticks).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: t('world.diaryLabel') }));
    expect(onOpenDiary).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('the bench opens the Album; the mailbox no longer opens Settings (the top bar gear does)', async () => {
    const { view, onOpenHistory, onOpenSettings } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: t('world.albumLabel') }));
    await fireEvent.press(screen.getByRole('button', { name: t('world.album') }));
    expect(onOpenHistory).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: t('world.postLabel') }));
    await advance(6000);
    expect(onOpenSettings).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: t('topBar.settingsLabel') }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    await advance(4000);
    await unmountAndExpectNoTimers(view);
  });

  it('the dog-name sign under the fence opens Stats and badges', async () => {
    const { view, onOpenStats } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: t('world.statsLabel') }));
    expect(onOpenStats).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('the Viertel band is one embedded patchwork map (WebView), not a captured portrait image', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    await homeRangeRepository.paintCells([{ ix: 1, iy: 1, refreshedAt: Date.now(), tracked: true, territoryId: null } as never]);
    posted.length = 0;
    const { view } = await setup({ homeRangeRepository });
    const band = screen.getByTestId('viertel-map');
    expect(within(band).getByTestId('webview')).toBeOnTheScreen();
    expect(screen.getAllByTestId('webview')).toHaveLength(1); // exactly one map WebView in the scene
    expect(screen.queryByText(t('portrait.gettingTerritory'))).toBeNull(); // the portrait's placeholder is gone
    expect(imagesIn(band)).toHaveLength(0);
    const types = posted.map((m) => JSON.parse(m).type);
    expect(types).toContain('SHOW_HOME_RANGE');
    expect(types).toContain('SHOW_NOTES');
    await unmountAndExpectNoTimers(view);
  });

  it('shows the numbers sign, the territory sign and the Reviere sign over the map', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    const territoryRepository = createInMemoryTerritoryRepository();
    const id = await territoryRepository.createTerritory('Hinterm Park', 1);
    const walkRepository = createInMemoryWalkRepository();
    const [latitude, longitude] = cellCentre(10, 10);
    await homeRangeRepository.paintCells([{ ix: 10, iy: 10, refreshedAt: Date.now(), tracked: true, territoryId: id }]);
    await walkRepository.saveWalk({ id: 'w1', startTime: Date.now() - 1000, locations: [{ latitude, longitude, timestamp: 1, accuracy: 5 }], closed: true, startSource: 'button' });
    const onOpenTerritories = jest.fn();
    const { view } = await setup({ homeRangeRepository, walkRepository, territoryRepository, onOpenTerritories });
    expect(await screen.findByText('Hinterm Park')).toBeOnTheScreen();
    expect(screen.getByText('1 walk')).toBeOnTheScreen();
    expect(screen.getByText('1 street')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('viertel.territoriesLabel') }));
    expect(onOpenTerritories).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('with no ground and no known position the band is linen with the chalk hint', async () => {
    const { view } = await setup();
    expect(await screen.findByText(t('viertel.note.explore'))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('tapping the embedded Viertel opens the full map', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    await homeRangeRepository.paintCells([{ ix: 1, iy: 1, refreshedAt: Date.now(), tracked: true, territoryId: null } as never]);
    const { view, onOpenMap, onStartWalk } = await setup({ homeRangeRepository });
    await fireEvent.press(await screen.findByRole('button', { name: t('world.neighbourhoodLabel') }));
    expect(onOpenMap).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(onStartWalk).not.toHaveBeenCalled(); // looking at the map is never a walk start
    await unmountAndExpectNoTimers(view);
  });

  it('with the Viertel scrolled into view a tap on the gate sign does not start a walk', async () => {
    const { view, onStartWalk } = await setup();
    await fireEvent.scroll(screen.getByTestId('world-scroll'), { nativeEvent: { contentOffset: { y: 0 } } });
    await fireEvent.press(screen.getByRole('button', { name: t('world.gateLabel') }));
    await advance(1500);
    expect(onStartWalk).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });

  it('an empty bowl only shows its sign larger when tapped (nothing to harvest)', async () => {
    const { view, onTreatsChanged } = await setup();
    expect(screen.getByText(t('world.bowlSignBaking'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('world.bowlLabelEmpty') }));
    await advance(2500);
    expect(onTreatsChanged).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });

  it('tapping the bowl harvests the pile into the bank and tells the household', async () => {
    const onHarvested = jest.fn();
    const { view, onTreatsChanged, denEconomyRepository } = await setup({ onHarvested }, 70, { pile: 40 });
    expect(screen.getByText(t('world.bowlSignReady', { count: '40' }))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('world.bowlLabel', { count: '40' }) }));
    await flush();
    expect(onTreatsChanged).toHaveBeenCalledWith(expect.closeTo(110, 0));
    const saved = await denEconomyRepository.getState();
    expect(saved.pile).toBe(0);
    expect(saved.treats).toBeCloseTo(110, 0);
    expect(onHarvested).toHaveBeenCalledTimes(1);
    await advance(2500);
    await unmountAndExpectNoTimers(view);
  });

  it('a tap on Buddy pays 1-3 treats into the bank and pops +N, while he reacts as before', async () => {
    const onBuddyTap = jest.fn();
    const { view, onTreatsChanged, denEconomyRepository } = await setup({ onBuddyTap }, 70);
    await fireEvent.press(screen.getByRole('button', { name: 'Rex' }));
    await flush();
    const paid = onBuddyTap.mock.calls[0][0] as number;
    expect(paid).toBeGreaterThanOrEqual(1);
    expect(paid).toBeLessThanOrEqual(3);
    expect(onTreatsChanged).toHaveBeenCalledWith(70 + paid);
    expect((await denEconomyRepository.getState()).tapCount).toBe(1);
    expect(screen.getByText(`+${paid}`)).toBeOnTheScreen();
    await advance(2500);
    await unmountAndExpectNoTimers(view);
  });

  it('counts Buddy taps on the household day key it is given', async () => {
    const { view, denEconomyRepository } = await setup({ getDayKey: async () => '2026-10-24' }, 70);
    await fireEvent.press(screen.getByRole('button', { name: 'Rex' }));
    await flush();
    expect(await denEconomyRepository.getState()).toMatchObject({ tapDayKey: '2026-10-24', tapCount: 1 });
    await advance(2500);
    await unmountAndExpectNoTimers(view);
  });

  it('a leftover pile under 1 that fills the Doghouse can still be harvested', async () => {
    const { view, denEconomyRepository } = await setup({}, 199.6, { pile: 0.4 });
    await fireEvent.press(screen.getByRole('button', { name: t('world.bowlLabelEmpty') }));
    await flush();
    const saved = await denEconomyRepository.getState();
    expect(saved.pile).toBe(0);
    expect(saved.treats).toBeCloseTo(200, 6);
    await advance(2500);
    await unmountAndExpectNoTimers(view);
  });

  it('no Buddy bonus (and no pop) when bank and pile fill the Doghouse', async () => {
    const onBuddyTap = jest.fn();
    const { view, denEconomyRepository } = await setup({ onBuddyTap }, 200);
    await fireEvent.press(screen.getByRole('button', { name: 'Rex' }));
    await flush();
    expect(onBuddyTap).not.toHaveBeenCalled();
    expect((await denEconomyRepository.getState()).tapCount).toBe(0);
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

describe('WorldScene bakery life', () => {
  it('shows the passive rate under the bowl number', async () => {
    const { view } = await setup();
    expect(screen.getByText(t('world.ratePerHour', { rate: formatRatePerHour(passiveTreatsPerHour(1, 1)) }))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('adds the territory income to the rate and shows the fence sign only once the reveal flag is set', async () => {
    const a = await setup({ territoryIncomeRate: 12.4 }, 70, { territoryIncomeRevealed: true });
    expect(screen.getByText(t('world.territorySign', { n: '12' }))).toBeOnTheScreen();
    expect(screen.getByText(t('world.ratePerHour', { rate: formatRatePerHour(passiveTreatsPerHour(1, 1) + 12.4) }))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(a.view);
    const b = await setup({ territoryIncomeRate: 12.4 }, 70, { territoryIncomeRevealed: false });
    expect(screen.queryByText(t('world.territorySign', { n: '12' }))).toBeNull();
    await unmountAndExpectNoTimers(b.view);
  });

  it('lays an extra bone next to the bowl at storage cap, and not below it', async () => {
    const full = await setup({}, 150, { pile: 50 }); // bank + pile = cap 200
    expect(screen.getByTestId('bowl-bone')).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^bowl-pile-/).length).toBe(5);
    await unmountAndExpectNoTimers(full.view);
    const some = await setup({}, 100, { pile: 10 });
    expect(screen.queryByTestId('bowl-bone')).toBeNull();
    await unmountAndExpectNoTimers(some.view);
  });

  it('the welcome-back bubble replaces the away-strip treats line and plays once per launch', async () => {
    const session = { kind: 'fresh-open' as const, greetingFlavor: 'first-open' as const };
    const props = { session, accruedDelta: 12, awayStripLines: [{ text: 'The Treat Bakery baked 12 treats.', kind: 'treats' as const }] };
    const first = await setup(props);
    expect(screen.getByText(t('world.welcomeBack', { n: '12' }))).toBeOnTheScreen();
    expect(screen.queryByText('The Treat Bakery baked 12 treats.')).toBeNull();
    await advance(2000);
    await unmountAndExpectNoTimers(first.view);
    // Same launch, scene mounted again (back from a walk): no second burst, the old line is back as before.
    const second = await setup(props);
    expect(screen.queryByText(t('world.welcomeBack', { n: '12' }))).toBeNull();
    await unmountAndExpectNoTimers(second.view);
  });

  it('no welcome-back when nothing accrued', async () => {
    const { view } = await setup({ accruedDelta: 0 });
    expect(screen.queryByText(/fresh from the oven/)).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('sparkles only on the affordable building and says what the next level gives', async () => {
    const a = await setup({}, 70);
    expect(screen.getAllByTestId('upgrade-sparkle').length).toBe(1);
    expect(screen.getByText(t('world.upgradePossible'))).toBeOnTheScreen();
    expect(screen.getByText(/^→ room for /)).toBeOnTheScreen();
    await unmountAndExpectNoTimers(a.view);
    const b = await setup({}, 10);
    expect(screen.queryByTestId('upgrade-sparkle')).toBeNull();
    expect(screen.queryByText(t('world.upgradePossible'))).toBeNull();
    await unmountAndExpectNoTimers(b.view);
  });

  it('a treat leaves the bakery every few seconds and lands; never more than six in the air', async () => {
    const { view } = await setup({}, 70);
    expect(screen.queryAllByTestId('treat-flight').length).toBe(0);
    await advance(1600); // first emission comes after at most 1.5 s
    expect(screen.queryAllByTestId('treat-flight').length).toBe(1);
    await advance(30000);
    expect(screen.queryAllByTestId('treat-flight').length).toBeLessThanOrEqual(6);
    await unmountAndExpectNoTimers(view);
  });

  it('a harvest sends at most eight sprites from the bowl to the pill and is over within a few seconds', async () => {
    const { view } = await setup({}, 70, { pile: 50 });
    await fireEvent.press(screen.getByRole('button', { name: t('world.bowlLabel', { count: '50' }) }));
    await flush();
    await advance(300);
    const inAir = screen.queryAllByTestId('treat-flight').length;
    expect(inAir).toBeGreaterThanOrEqual(2);
    expect(inAir).toBeLessThanOrEqual(8);
    await advance(1500); // 0.7 s stagger + 0.6 s flight; the first ambient emission is still ahead
    expect(screen.queryAllByTestId('treat-flight').length).toBeLessThanOrEqual(1);
    await unmountAndExpectNoTimers(view);
  });

  it('nothing sparkles or flies while a walk is active', async () => {
    const { view } = await setup({ walkActive: true }, 70);
    expect(screen.queryByTestId('upgrade-sparkle')).toBeNull();
    await advance(5000);
    expect(screen.queryAllByTestId('treat-flight').length).toBe(0);
    await unmountAndExpectNoTimers(view);
  });
});

describe('WorldScene during a walk', () => {
  it('the gate sign reads "to the walk" and opens the live map instead of starting a second walk', async () => {
    const { view, onStartWalk, onOpenMap } = await setup({ walkActive: true });
    expect(screen.getByText(t('walk.gateBack'))).toBeOnTheScreen();
    expect(screen.queryByText(t('world.gate'))).toBeNull();
    expect(screen.queryByRole('button', { name: t('world.gateLabel') })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: t('walk.gateBackLabel') }));
    expect(onOpenMap).toHaveBeenCalledTimes(1);
    await advance(2000);
    expect(onStartWalk).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });

  it('shows a small cancel link under the sign that calls onCancelWalk', async () => {
    const { view, onCancelWalk, onStartWalk } = await setup({ walkActive: true });
    await fireEvent.press(screen.getByRole('button', { name: t('walk.cancelLinkLabel') }));
    expect(onCancelWalk).toHaveBeenCalledTimes(1);
    await advance(2000);
    expect(onStartWalk).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });

  it('has no cancel link and the usual gate sign when no walk runs', async () => {
    const { view } = await setup();
    expect(screen.getByText(t('world.gate'))).toBeOnTheScreen();
    expect(screen.queryByText(t('walk.cancelLink'))).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('Buddy says the line after an early end', async () => {
    const { view } = await setup({ flashNote: { key: 1, text: t('walk.cancelled.line') } });
    expect(screen.getByText(t('walk.cancelled.line'))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
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
  it("puts the walk-end line first, ahead of the greeting and the away strip", () => {
    const flash = { key: 7, text: 'Later, then!' };
    expect(pickSceneNotes(lines, 'Hi', false, new Set(), null, flash).map((n) => n.key)).toEqual(['flash-7', 'line-0']);
    expect(pickSceneNotes([], 'Hi', false, new Set(), null, flash).map((n) => n.key)).toEqual(['flash-7']);
    expect(pickSceneNotes([], 'Hi', false, new Set(['flash-7']), null, flash).map((n) => n.key)).toEqual([]); // a tapped-away line leaves the yard quiet
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

describe('WorldScene fence badges', () => {
  const walkWith = (ids: AchievementId[]) => ({
    walkId: 'wb',
    rewards: {
      cellsPainted: 40,
      hasTerritory: true,
      treatsEarned: 10,
      tease: null,
      unlockedAchievements: ids,
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
  });

  it('hangs every unlocked badge on the fence (no "new" marks) and keeps the territory badges off', async () => {
    const personalStatsRepository = createInMemoryPersonalStatsRepository();
    await personalStatsRepository.unlockAchievements(['first-steps', 'ground-claimed', 'moving-in'], 1_700_000_000_000);
    const { view } = await setup({ personalStatsRepository });
    expect(screen.getByTestId('fence-badge-first-steps')).toBeOnTheScreen();
    expect(screen.getByTestId('fence-badge-moving-in')).toBeOnTheScreen();
    expect(screen.queryByTestId('fence-badge-ground-claimed')).toBeNull();
    expect(screen.queryByTestId('fence-hook')).toBeNull(); // 3 of 25 walks: nothing near
    await unmountAndExpectNoTimers(view);
  });

  it('shows one empty hook, with no numbers, once a threshold badge is 80 % away', async () => {
    const personalStatsRepository = createInMemoryPersonalStatsRepository();
    await personalStatsRepository.unlockAchievements(['first-steps', 'paws-on-the-pavement'], 1_700_000_000_000);
    await personalStatsRepository.saveState({ ...defaultPersonalStatsState(), totalWalksClosed: 21 });
    const { view } = await setup({ personalStatsRepository });
    expect(screen.getAllByTestId('fence-hook')).toHaveLength(1);
    expect(screen.getByText(t('world.fence.hookSign'))).toBeOnTheScreen();
    expect(screen.queryByText(/21|25/)).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('a badge earned on the walk stays off its peg until beat 3, then hangs there (at most two arrive)', async () => {
    const personalStatsRepository = createInMemoryPersonalStatsRepository();
    const ids: AchievementId[] = ['first-steps', 'round-the-block', 'first-bakery-batch'];
    await personalStatsRepository.unlockAchievements(ids, Date.now());
    const onDone = jest.fn();
    const { view } = await setup({ personalStatsRepository, homecoming: { onDone, walk: walkWith(ids) } });
    await flush();
    expect(screen.queryByTestId('fence-badge-first-steps')).toBeNull(); // beat 1: the two arrivals wait
    expect(screen.queryByTestId('fence-badge-round-the-block')).toBeNull();
    expect(screen.getByTestId('fence-badge-first-bakery-batch')).toBeOnTheScreen(); // the third just hangs there
    await advance(500);
    await fireEvent.press(screen.getByTestId('homecoming-tap')); // -> bowl
    await advance(500);
    expect(screen.queryByTestId('fence-badge-first-steps')).toBeNull();
    await fireEvent.press(screen.getByTestId('homecoming-tap')); // -> beat 3
    await advance(500);
    expect(screen.getByTestId('fence-badge-first-steps')).toBeOnTheScreen();
    expect(screen.getByTestId('fence-badge-round-the-block')).toBeOnTheScreen();
    expect(screen.getByTestId('fence-badge-first-bakery-batch')).toBeOnTheScreen();
    // The sign of beat 3 names two, not three.
    const sign = screen.getByTestId('homecoming-badge');
    expect(within(sign).getByText(ACHIEVEMENTS['first-steps'].copyTitle)).toBeOnTheScreen();
    expect(within(sign).getByText(ACHIEVEMENTS['round-the-block'].copyTitle)).toBeOnTheScreen();
    expect(within(sign).queryByText(ACHIEVEMENTS['first-bakery-batch'].copyTitle)).toBeNull();
    await advance(2000);
    await unmountAndExpectNoTimers(view);
  });
});

// ---- Nachbarhunde (slice M3) ----
const momo: NearbyItem = {
  id: 'b1',
  kind: 'bot',
  generated: true,
  archetype: 'momo',
  dogName: 'Momo',
  appearance: { coat: 'cream', markings: 'none', earStyle: 'floppy', tailStyle: 'curly', size: 'medium', accentColour: 'cream' },
  traitKey: 'neighbours.dog.momo.trait',
  areaLabel: 'near',
  lastActiveBucket: 'today',
  metCount: 1,
  rangeCells: [{ ix: 1, iy: 1 }],
};
const gift = (over: Partial<ApiGift> = {}): ApiGift => ({ id: 'g1', botId: 'b1', botName: 'Pfote', cosmeticId: 'stick-oak', sprinkleTreats: 3, createdAt: 1, openedAt: null, ...over });
const coopWeek = (over: Partial<CoopWeekResponse> = {}): CoopWeekResponse => ({
  active: true,
  weekStart: '2026-10-12',
  goalKm: 20,
  totalKm: 8.6,
  ratio: 0.43,
  completed: false,
  rewardId: null,
  yardDecorations: [],
  ...over,
});
/** The store is what the scene reads (the sync engine fills it); `actions` is only the gift-open seam. */
const actions: NeighbourhoodActions = { openGift: async () => true };
const seed = (state: Parameters<typeof setNeighbourhood>[0]) => setNeighbourhood(state);
/** An inbox state that already counts lines from the beginning of time (the first-look rule would hide lines older than the first mount). */
async function inboxRepo() {
  const repo = createInMemorySettingsRepository();
  await repo.saveInboxState({ postponedPostcards: [], deliveredPostcards: [], seenNotes: [], notesFrom: 1 });
  return repo;
}
const sniffLine = { line: 'neighbours.line.sniffCorner', botName: 'Momo', botId: 'b1', params: { bot: 'Momo' }, at: Date.now() - 60_000, seq: 4 };

describe('WorldScene neighbours', () => {
  it('the fence no longer pins neighbour notes: they arrive in the mailbox', async () => {
    seed({ nearby: [momo], lines: [sniffLine] });
    const { view } = await setup({ neighbourhood: actions });
    expect(screen.queryByText(/good sniff/)).toBeNull();
    expect(screen.getByText('Hello Rex!')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('empty box: no flag; a tap gives a short sniff beat with one of the three lines and opens nothing', async () => {
    const { view, onOpenSettings } = await setup({ neighbourhood: actions });
    expect(screen.queryByTestId('mailbox-flag')).toBeNull();
    await fireEvent.press(screen.getByTestId('mailbox'));
    await advance(6000);
    expect(screen.getByText(new RegExp([1, 2, 3].map((n) => t(`inbox.empty.${n}`).replace(/[.?']/g, '.')).join('|')))).toBeOnTheScreen();
    expect(screen.queryByTestId('inbox-unwrap')).toBeNull();
    expect(onOpenSettings).not.toHaveBeenCalled();
    await advance(4000);
    await unmountAndExpectNoTimers(view);
  });

  it('a waiting stick raises the flag (no number); the tap opens it and Buddy carries the stick to the shelf, then says he is done', async () => {
    seed({ gifts: [gift({ cosmeticId: 'stick-pfote' })] });
    const settingsRepository = await inboxRepo();
    const openGift = jest.fn(async () => true);
    const { view, onOpenSettings } = await setup({ neighbourhood: { openGift }, settingsRepository });
    expect(await screen.findByTestId('mailbox-flag')).toBeOnTheScreen();
    const box = screen.getByTestId('mailbox');
    await fireEvent.press(box);
    expect(await screen.findByText(t('inbox.opening'))).toBeOnTheScreen();
    expect(screen.queryByTestId('mailbox-flag')).toBeNull(); // the flag dropped
    await fireEvent.press(box); // a second tap while he is on his way does nothing
    expect(openGift).not.toHaveBeenCalled(); // Buddy has to trot over first
    await advance(6000);
    expect(openGift).toHaveBeenCalledTimes(1);
    expect(openGift).toHaveBeenCalledWith('g1');
    expect(await screen.findByText(t('neighbours.stick.lineNew', { bot: 'Pfote' }))).toBeOnTheScreen();
    expect(screen.getByTestId('inbox-unwrap')).toBeOnTheScreen();
    expect(onOpenSettings).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('inbox-next')); // skips the unwrap beat
    await fireEvent.press(screen.getByTestId('inbox-next')); // nothing more in the box
    expect(await screen.findByText(t('inbox.done'))).toBeOnTheScreen();
    expect(screen.queryByTestId('inbox-unwrap')).toBeNull();
    await advance(6000);
    await unmountAndExpectNoTimers(view);
  });

  it('when opening does not work the gift stays and the line is a gentle retry', async () => {
    seed({ gifts: [gift()] });
    const { view } = await setup({ neighbourhood: { openGift: async () => false }, settingsRepository: await inboxRepo() });
    await fireEvent.press(await screen.findByTestId('mailbox'));
    await advance(6000);
    expect(await screen.findByText(t('neighbours.gift.retry'))).toBeOnTheScreen();
    expect(screen.queryByTestId('inbox-unwrap')).toBeNull();
    expect(screen.getByTestId('mailbox-flag')).toBeOnTheScreen();
    await advance(4000);
    await unmountAndExpectNoTimers(view);
  });

  it('a gift the server no longer knows ("gone") says nothing and is not offered again', async () => {
    seed({ gifts: [gift()] });
    const openGift = jest.fn(async () => {
      seed({ gifts: [] }); // what the engine does for not-found
      return 'gone' as const;
    });
    const { view } = await setup({ neighbourhood: { openGift }, settingsRepository: await inboxRepo() });
    await fireEvent.press(await screen.findByTestId('mailbox'));
    await advance(6000);
    expect(openGift).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(t('neighbours.gift.retry'))).toBeNull();
    expect(screen.queryByTestId('mailbox-flag')).toBeNull();
    await advance(4000);
    await unmountAndExpectNoTimers(view);
  });

  it('a neighbour note comes out of the box as "Ein Zettel von ..." once and is then seen for good', async () => {
    seed({ nearby: [momo], lines: [sniffLine] });
    const settingsRepository = await inboxRepo();
    const { view } = await setup({ neighbourhood: actions, settingsRepository });
    expect(await screen.findByTestId('mailbox-flag')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('mailbox'));
    await advance(6000);
    expect(await screen.findByText(t('inbox.note', { text: 'Momo had a good sniff at your corner today.' }))).toBeOnTheScreen();
    expect((await settingsRepository.getInboxState()).seenNotes).toEqual(['neighbour-4']);
    await fireEvent.press(screen.getByTestId('inbox-next'));
    await fireEvent.press(screen.getByTestId('inbox-next'));
    expect(screen.queryByTestId('mailbox-flag')).toBeNull();
    await advance(6000);
    await unmountAndExpectNoTimers(view);
  });

  it('several items: Buddy says "Da hat sich was gesammelt" first; "Später" leaves the rest silently and the flag stays up', async () => {
    seed({ gifts: [gift({ id: 'g1', createdAt: 2, cosmeticId: 'stick-pfote' }), gift({ id: 'g2', createdAt: 1, cosmeticId: 'stick-momo', botName: 'Momo' })] });
    const openGift = jest.fn(async () => true);
    const { view } = await setup({ neighbourhood: { openGift }, settingsRepository: await inboxRepo() });
    await fireEvent.press(await screen.findByTestId('mailbox'));
    for (let i = 0; i < 40 && !screen.queryByText(t('inbox.pileUp')); i += 1) await advance(150); // Buddy's trot has no fixed length
    expect(screen.getByText(t('inbox.pileUp'))).toBeOnTheScreen();
    expect(openGift).not.toHaveBeenCalled();
    await advance(2000);
    expect(openGift).toHaveBeenCalledTimes(1);
    expect(openGift).toHaveBeenCalledWith('g1'); // newest first
    await fireEvent.press(screen.getByText(t('inbox.later')));
    expect(screen.queryByTestId('inbox-unwrap')).toBeNull();
    expect(screen.queryByText(t('inbox.done'))).toBeNull();
    expect(openGift).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mailbox-flag')).toBeOnTheScreen(); // the opened mock did not change the store: both still wrapped
    await advance(6000);
    await unmountAndExpectNoTimers(view);
  });

  it('the Viertel-Runde sign shows one percentage while the co-op is active, and is hidden otherwise', async () => {
    seed({ coop: coopWeek() });
    const a = await setup({ neighbourhood: actions });
    expect(await screen.findByText('Neighbourhood Round: 43%')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(a.view);
    seed({ coop: coopWeek({ active: false, ratio: 0 }) });
    const b = await setup({ neighbourhood: actions });
    expect(screen.queryByText(/Neighbourhood Round/)).toBeNull();
    await unmountAndExpectNoTimers(b.view);
    seed({ coop: coopWeek({ completed: true, ratio: 1 }) });
    const c = await setup({ neighbourhood: actions });
    expect(await screen.findByText(t('neighbours.coop.done'))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(c.view);
  });
});

// ---- Alex im Hof (M4) ----
describe('WorldScene partner presence', () => {
  const alex = (over: object = {}) => ({ playerId: 'p-c', name: 'Alex', walkId: 'w1', startedAt: 1, points: [{ lat: 52, lon: 13, t: 1 }], updatedAt: Date.now(), ...over });

  it('hangs a sign by the gate while a partner is out, in her name and the dog\'s, and never says offline', async () => {
    const { view } = await setup();
    expect(screen.queryByTestId('partner-sign')).toBeNull();
    await act(async () => setPartnerPresence([alex()], Date.now(), Date.now()));
    expect(screen.getByText('Alex is out with Rex')).toBeOnTheScreen();
    expect(screen.queryByText(/offline|last seen/i)).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('takes the sign down silently when she is back (her presence ended)', async () => {
    const { view } = await setup();
    await act(async () => setPartnerPresence([alex()], Date.now(), Date.now()));
    expect(screen.getByTestId('partner-sign')).toBeOnTheScreen();
    await act(async () => setPartnerPresence([], Date.now(), Date.now()));
    expect(screen.queryByTestId('partner-sign')).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('takes the sign down silently when her last heartbeat is more than 3 minutes old', async () => {
    const { view } = await setup();
    await act(async () => setPartnerPresence([alex()], Date.now(), Date.now()));
    await advance(PRESENCE_STALE_MS - 1000);
    expect(screen.getByTestId('partner-sign')).toBeOnTheScreen();
    await advance(16_000); // the next re-check after the 3 minutes
    expect(screen.queryByTestId('partner-sign')).toBeNull();
    await unmountAndExpectNoTimers(view);
  }, 20_000); // minutes of fake time: slow under a full parallel run

  it('a fresh heartbeat keeps the sign up', async () => {
    const { view } = await setup();
    await act(async () => setPartnerPresence([alex()], Date.now(), Date.now()));
    await advance(150_000);
    await act(async () => setPartnerPresence([alex({ updatedAt: Date.now() + 1 })], Date.now() + 1, Date.now()));
    await advance(100_000);
    expect(screen.getByTestId('partner-sign')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  }, 20_000);

  it('plays the mini homecoming: patch star, treats into the bowl, then her return line; one tap per beat, then hands back', async () => {
    const onDone = jest.fn();
    const { view, onStartWalk } = await setup({
      homecoming: {
        onDone,
        walk: partnerHomecomingWalk({ walkId: 'wp', name: 'Alex', treatsEarned: 14, newGroundCellCount: 0, distanceMeters: 2100, walkTime: Date.now() }),
      },
    });
    await flush();
    expect(screen.getByTestId('homecoming-number')).toBeOnTheScreen();
    await advance(500);
    await fireEvent.press(screen.getByTestId('homecoming-tap')); // -> bowl
    await advance(500);
    expect(screen.queryByTestId('homecoming-number')).toBeNull();
    await fireEvent.press(screen.getByTestId('homecoming-tap')); // -> closing line
    await advance(500);
    expect(screen.getByText('Alex and Rex are back.')).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('homecoming-tap'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onStartWalk).not.toHaveBeenCalled();
    await unmountAndExpectNoTimers(view);
  });
});

describe('WorldScene buildings page', () => {
  const win = Dimensions.get('window');
  const layout = sceneLayout(win.height, win.width, 47, 34); // the test provider's insets
  const geo = buildingsLayout(win.width, 47, layout.buildingsPageH);
  const scrollTo = () => ScrollView.prototype.scrollTo as unknown as jest.Mock;
  const scrollNow = (y: number) => fireEvent.scroll(screen.getByTestId('world-scroll'), { nativeEvent: { contentOffset: { y } } });
  afterEach(() => resetBackActions());

  it('lays the buildings on their own page below the Hof: three signs with Lv, three hit areas, no fourth', async () => {
    const { view } = await setup({}, 10);
    for (const k of ['doghouse', 'bakery', 'sniffGarden'] as const) {
      const name = t(`den.building.${k}.name`);
      expect(screen.getByText(t('world.buildingSign', { name, level: 1 }))).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: t('den.showUpgrade', { name }) })).toBeOnTheScreen();
    }
    expect(screen.getAllByRole('button', { name: /^Show the .* upgrade$/ }).length).toBe(3); // the reserved 4th slot draws nothing
    expect(layout.buildingsOffset).toBeGreaterThan(layout.startOffset);
    await unmountAndExpectNoTimers(view);
  });

  it('opens at the Hof, and the Hof strip leads down to the buildings', async () => {
    const { view } = await setup({}, 10);
    scrollTo().mockClear();
    await fireEvent.press(screen.getByRole('button', { name: t('world.toBuildings') }));
    expect(scrollTo()).toHaveBeenLastCalledWith({ y: layout.buildingsOffset, animated: true });
    expect(screen.queryByText(t('world.upgradeReady'), { exact: false })).toBeNull(); // nothing affordable: a plain strip
    await unmountAndExpectNoTimers(view);
  });

  it('the Hof strip says "upgrade ready" (with a pennant cue) when bank and pile pay for an upgrade', async () => {
    const a = await setup({}, 10, { pile: 60 }); // bank 10 + pile 60 >= doghouse 60
    expect(screen.getByRole('button', { name: `${t('world.toBuildings')} · ${t('world.upgradeReady')}` })).toBeOnTheScreen();
    await unmountAndExpectNoTimers(a.view);
    const b = await setup({}, 70);
    expect(screen.getByRole('button', { name: `${t('world.toBuildings')} · ${t('world.upgradeReady')}` })).toBeOnTheScreen();
    await unmountAndExpectNoTimers(b.view);
  });

  it('back from the buildings page goes to the Hof; an open sign closes first', async () => {
    const { view } = await setup({}, 70);
    await scrollNow(layout.buildingsOffset);
    await fireEvent.press(screen.getByRole('button', { name: t('den.showUpgrade', { name: t('den.building.doghouse.name') }) }));
    expect(screen.getByRole('button', { name: /^Upgrade for / })).toBeOnTheScreen();
    scrollTo().mockClear();
    await act(async () => {
      expect(runBackActions()).toBe(true); // closes the sign
    });
    expect(screen.queryByRole('button', { name: /^Upgrade for / })).toBeNull();
    expect(scrollTo()).not.toHaveBeenCalled();
    await act(async () => {
      expect(runBackActions()).toBe(true); // then back to the Hof
    });
    expect(scrollTo()).toHaveBeenLastCalledWith({ y: layout.startOffset, animated: true });
    await fireEvent.press(screen.getByRole('button', { name: t('world.backToYard') }));
    expect(scrollTo()).toHaveBeenLastCalledWith({ y: layout.startOffset, animated: true });
    await unmountAndExpectNoTimers(view);
  });

  it('the den alias scrolls to the buildings page (not the Hof) and opens the sign', async () => {
    scrollTo().mockClear();
    const { view } = await setup({ openDenPanel: true }, 70);
    expect(scrollTo()).toHaveBeenCalledWith({ y: buildingSelectOffset(layout, geo, 'doghouse'), animated: true });
    expect(screen.getByRole('button', { name: /^Upgrade for / })).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('the pennant and sparkle stay on the affordable building of the buildings page', async () => {
    const { view } = await setup({}, 70);
    expect(screen.getAllByTestId('upgrade-sparkle').length).toBe(1);
    await unmountAndExpectNoTimers(view);
  });
});

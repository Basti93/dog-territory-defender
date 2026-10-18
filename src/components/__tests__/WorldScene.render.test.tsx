import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { t } from '../../i18n';
import { DenEconomyState } from '../../economy/denEconomy';
import { passiveTreatsPerHour } from '../../economy/formulas';
import { formatRatePerHour } from '../world/bakeryRules';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { advance, flush, imagesIn, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { pickSceneNotes, WorldScene, WorldSceneProps } from '../world/WorldScene';
import * as sounds from '../../feedback/sounds';
import type { ApiGift, CoopWeekResponse, NearbyItem } from '../../sync/apiContract';
import { resetNeighbourhood, setNearby, setNeighbourhood } from '../../sync/neighbourhoodStore';
import type { NeighbourhoodActions } from '../../sync/neighbourhood';
import { clearPartnerPresence, PRESENCE_STALE_MS, setPartnerPresence } from '../../sync/presenceStore';
import { partnerHomecomingWalk } from '../world/homecomingPlan';

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
    const full = await setup({}, 200);
    expect(screen.getByTestId('bowl-bone')).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^bowl-pile-/).length).toBe(5);
    await unmountAndExpectNoTimers(full.view);
    const some = await setup({}, 100);
    expect(screen.queryByTestId('bowl-bone')).toBeNull();
    await unmountAndExpectNoTimers(some.view);
  });

  it('the welcome-back bubble replaces the away-strip treats line and plays once per launch', async () => {
    const session = { kind: 'fresh-open' as const, greetingFlavor: 'first-open' as const };
    const props = { session, accruedDelta: 12, awayStripLines: [{ text: 'The Treat Bakery baked 12 treats.', kind: 'treats' as const }] };
    const first = await setup(props);
    expect(screen.getByText('The bakery kept busy: +12')).toBeOnTheScreen();
    expect(screen.queryByText('The Treat Bakery baked 12 treats.')).toBeNull();
    await advance(2000);
    await unmountAndExpectNoTimers(first.view);
    // Same launch, scene mounted again (back from a walk): no second burst, the old line is back as before.
    const second = await setup(props);
    expect(screen.queryByText('The bakery kept busy: +12')).toBeNull();
    await unmountAndExpectNoTimers(second.view);
  });

  it('no welcome-back when nothing accrued', async () => {
    const { view } = await setup({ accruedDelta: 0 });
    expect(screen.queryByText(/The bakery kept busy/)).toBeNull();
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

  it('the welcome-back burst sends at most eight sprites and is over within a few seconds', async () => {
    const { view } = await setup({ accruedDelta: 50 });
    await advance(300);
    const inAir = screen.queryAllByTestId('treat-flight').length;
    expect(inAir).toBeGreaterThanOrEqual(2);
    expect(inAir).toBeLessThanOrEqual(8);
    await advance(1300); // burst done (0.7 s stagger + 0.6 s flight); the first single emission is still ahead
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
const sniffLine = { line: 'neighbours.line.sniffCorner', botName: 'Momo', botId: 'b1', params: { bot: 'Momo' }, at: Date.now() - 60_000, seq: 4 };

describe('WorldScene neighbours', () => {
  it('pins the neighbour line on the fence; tapping it opens the dog card with its last lines and the note is gone', async () => {
    seed({ nearby: [momo], lines: [sniffLine, { ...sniffLine, line: 'neighbours.line.wave', seq: 3, at: Date.now() - 9e6 }] });
    const { view } = await setup({ neighbourhood: actions });
    const note = await screen.findByRole('button', { name: 'Momo had a good sniff at your corner today.' });
    expect(screen.getByText('Hello Rex!')).toBeOnTheScreen(); // Buddy's bubble keeps the greeting
    expect(screen.queryByTestId('neighbour-card')).toBeNull();
    await fireEvent.press(note);
    expect(screen.getByTestId('neighbour-card')).toBeOnTheScreen();
    expect(screen.getByText(t('neighbours.dog.momo.trait'))).toBeOnTheScreen();
    expect(screen.getByText(t('neighbours.badge'))).toBeOnTheScreen();
    expect(screen.getByText('Momo is waving at you from the corner.')).toBeOnTheScreen();
    expect(screen.getAllByText('Momo had a good sniff at your corner today.')).toHaveLength(1); // in the card only
    await fireEvent.press(screen.getAllByRole('button', { name: t('neighbours.card.close') })[1]);
    expect(screen.queryByTestId('neighbour-card')).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('a note without a known dog (co-op line) is just dismissed, and shows no card', async () => {
    const coop = { line: 'neighbours.line.coopDone', botName: null, botId: null, params: { km: 40 }, at: Date.now() - 1000, seq: 5 };
    seed({ lines: [coop] });
    const { view } = await setup({ neighbourhood: actions });
    const note = await screen.findByRole('button', { name: /walked 40 km together/ });
    await fireEvent.press(note);
    expect(screen.queryByTestId('neighbour-card')).toBeNull();
    expect(screen.queryByText(/walked 40 km together/)).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('shows no neighbour note without neighbours, and the OTA card keeps the paper slot', async () => {
    const a = await setup();
    expect(screen.queryByText(/sniff/)).toBeNull();
    await unmountAndExpectNoTimers(a.view);
    seed({ lines: [sniffLine] });
    const b = await setup({ updateCard: { onApply: jest.fn(), onLater: jest.fn() }, neighbourhood: actions });
    expect(screen.getByText(t('update.ready'))).toBeOnTheScreen();
    expect(screen.queryByText(/sniff/)).toBeNull();
    await unmountAndExpectNoTimers(b.view);
  });

  it('a parcel with a Post! sign waits by the mailbox while a gift is unopened; tapping goes to the Post list', async () => {
    seed({ gifts: [gift()] });
    const { view, onOpenSettings } = await setup({ neighbourhood: actions });
    const parcel = await screen.findAllByRole('button', { name: t('neighbours.parcel.label') });
    expect(screen.getByText(t('neighbours.parcel.sign'))).toBeOnTheScreen();
    await fireEvent.press(parcel[0]);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('no parcel when there are no gifts or all are opened', async () => {
    seed({ gifts: [gift({ openedAt: 5 })] });
    const a = await setup({ neighbourhood: actions });
    expect(screen.queryByText(t('neighbours.parcel.sign'))).toBeNull();
    await unmountAndExpectNoTimers(a.view);
    const b = await setup({ neighbourhood: actions });
    expect(screen.queryByText(t('neighbours.parcel.sign'))).toBeNull();
    await unmountAndExpectNoTimers(b.view);
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

describe('pickSceneNotes with a neighbour note', () => {
  const nb = { key: 'neighbour-4', text: 'Momo sniffed.', botId: 'b1', at: 1 };
  const line = { text: 'a', kind: 'household' as const };
  it('takes the paper slot next to the household/greeting bubble', () => {
    expect(pickSceneNotes([line, { text: 'b', kind: 'household' }], null, false, new Set(), null, nb).map((n) => n.key)).toEqual(['line-0', 'neighbour-4']);
    expect(pickSceneNotes([], 'Hi', false, new Set(), null, nb).map((n) => n.key)).toEqual(['greeting', 'neighbour-4']);
    expect(pickSceneNotes([], null, false, new Set(), null, nb)).toEqual([{ key: 'neighbour-4', kind: 'neighbour', text: 'Momo sniffed.', botId: 'b1' }]);
  });
  it('waits for the OTA card, and stays gone once dismissed', () => {
    expect(pickSceneNotes([line], null, true, new Set(), null, nb).map((n) => n.key)).toEqual(['update', 'line-0']);
    expect(pickSceneNotes([line], null, false, new Set(['neighbour-4']), null, nb).map((n) => n.key)).toEqual(['line-0']);
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
  });

  it('a fresh heartbeat keeps the sign up', async () => {
    const { view } = await setup();
    await act(async () => setPartnerPresence([alex()], Date.now(), Date.now()));
    await advance(150_000);
    await act(async () => setPartnerPresence([alex({ updatedAt: Date.now() + 1 })], Date.now() + 1, Date.now()));
    await advance(100_000);
    expect(screen.getByTestId('partner-sign')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

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

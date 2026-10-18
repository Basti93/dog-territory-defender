import React from 'react';
import { act } from '@testing-library/react-native';

import type { NearbyItem } from '../../sync/apiContract';
import { setNearby } from '../../sync/neighbourhoodStore';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { TerritoryPortrait } from '../TerritoryPortrait';
import { clearPartnerPresence, setPartnerPresence } from '../../sync/presenceStore';

const { posted } = require('react-native-webview') as { posted: string[] };

const momo: NearbyItem = {
  id: 'b1',
  kind: 'bot',
  generated: true,
  archetype: 'momo',
  dogName: 'Momo',
  appearance: {},
  traitKey: 'neighbours.dog.momo.trait',
  areaLabel: 'near',
  lastActiveBucket: 'today',
  metCount: 1,
  rangeCells: [{ ix: 140, iy: 100 }, { ix: 141, iy: 100 }],
};

async function render(showNeighbours: boolean, showPartnerTrail = false) {
  const homeRangeRepository = createInMemoryHomeRangeRepository();
  await homeRangeRepository.paintCells([{ ix: 100, iy: 100, refreshedAt: Date.now(), tracked: true, territoryId: null } as never]);
  const view = await renderScreen(<TerritoryPortrait homeRangeRepository={homeRangeRepository} onPress={() => {}} showNeighbours={showNeighbours} showPartnerTrail={showPartnerTrail} />);
  await flush();
  return view;
}
const renders = () => posted.map((m) => JSON.parse(m)).filter((m) => m.type === 'RENDER_PORTRAIT');

beforeEach(() => {
  jest.useFakeTimers();
  posted.length = 0;
});
afterEach(() => {
  jest.useRealTimers();
  setNearby([]);
  clearPartnerPresence();
});

describe('TerritoryPortrait neighbours', () => {
  it('sends the nearby Ranges and a wider frame with the portrait, and re-renders when they arrive', async () => {
    const view = await render(true);
    expect(renders().pop().payload.neighbours).toBeUndefined();
    await act(async () => setNearby([momo]));
    const last = renders().pop().payload;
    expect(last.neighbours).toEqual([expect.objectContaining({ id: 'b1', name: 'Momo' })]);
    expect(last.frame.w).toBeGreaterThan(last.raster.w);
    await unmountAndExpectNoTimers(view);
  });

  it('leaves neighbours out unless asked (per-territory cards)', async () => {
    setNearby([momo]);
    const view = await render(false);
    const payload = renders().pop().payload;
    expect(payload.neighbours).toBeUndefined();
    expect(payload.frame).toBeUndefined();
    await unmountAndExpectNoTimers(view);
  });
});

describe('TerritoryPortrait partner thread', () => {
  const trails = () => posted.map((m) => JSON.parse(m)).filter((m) => m.type === 'SHOW_PARTNER_TRAIL');
  // cell (100,100) is about lat 100*0.00018, so a walk near it
  const near = [{ lat: 100.5 * 0.00018, lon: 100.5 * 0.0003, t: 1 }, { lat: 108 * 0.00018, lon: 112 * 0.0003, t: 2 }];
  const alex = { playerId: 'p-c', name: 'Alex', walkId: 'w1', startedAt: 1, points: near, updatedAt: Date.now() };

  it('sends her thread before each capture, widens the frame to hold it, and never draws it as a neighbour', async () => {
    const view = await render(true, true);
    expect(trails().pop().payload).toEqual({ points: [], name: '' });
    await act(async () => setPartnerPresence([alex], Date.now(), Date.now()));
    expect(trails().pop().payload.name).toBe('Alex');
    // the thread goes first, then the capture that uses it
    const order = posted.map((m) => JSON.parse(m).type);
    expect(order.lastIndexOf('SHOW_PARTNER_TRAIL')).toBeLessThan(order.lastIndexOf('RENDER_PORTRAIT'));
    const last = renders().pop().payload;
    expect(last.frame).toBeDefined();
    expect(last.neighbours).toEqual([]);
    await act(async () => setPartnerPresence([], Date.now(), Date.now()));
    expect(trails().pop().payload.points).toEqual([]);
    expect(renders().pop().payload.frame).toBeUndefined();
    await unmountAndExpectNoTimers(view);
  });

  it('per-territory portraits ignore her entirely', async () => {
    setPartnerPresence([alex], Date.now(), Date.now());
    const view = await render(false, false);
    expect(trails()).toHaveLength(0);
    expect(renders().pop().payload.frame).toBeUndefined();
    await unmountAndExpectNoTimers(view);
  });
});

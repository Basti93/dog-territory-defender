import React from 'react';
import { act } from '@testing-library/react-native';

import type { NearbyItem } from '../../sync/apiContract';
import { setNearby } from '../../sync/nearbyStore';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { TerritoryPortrait } from '../TerritoryPortrait';

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

async function render(showNeighbours: boolean) {
  const homeRangeRepository = createInMemoryHomeRangeRepository();
  await homeRangeRepository.paintCells([{ ix: 100, iy: 100, refreshedAt: Date.now(), tracked: true, territoryId: null } as never]);
  const view = await renderScreen(<TerritoryPortrait homeRangeRepository={homeRangeRepository} onPress={() => {}} showNeighbours={showNeighbours} />);
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

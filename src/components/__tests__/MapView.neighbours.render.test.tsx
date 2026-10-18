import React from 'react';
import { act, screen } from '@testing-library/react-native';

import type { NearbyItem } from '../../sync/apiContract';
import { resetNeighbourhood, setNearby, setNeighbourhood } from '../../sync/neighbourhoodStore';
import type { NeighbourhoodActions } from '../../sync/neighbourhood';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { MapView } from '../MapView';
import { clearPartnerPresence, setPartnerPresence } from '../../sync/presenceStore';

const { posted } = require('react-native-webview') as { posted: string[] };

const momo: NearbyItem = {
  id: 'b1',
  kind: 'bot',
  generated: true,
  archetype: 'momo',
  dogName: 'Momo',
  appearance: { coat: 'cream' },
  traitKey: 'neighbours.dog.momo.trait',
  areaLabel: 'near',
  lastActiveBucket: 'today',
  metCount: 1,
  rangeCells: [{ ix: 500, iy: 500 }, { ix: 501, iy: 500 }],
};
const source: NeighbourhoodActions = { openGift: async () => true };
const lines = [{ line: 'neighbours.line.sniffCorner', botName: 'Momo', botId: 'b1', params: { bot: 'Momo' }, at: Date.now(), seq: 1 }];

const messages = (type: string) => posted.map((m) => JSON.parse(m)).filter((m) => m.type === type);

beforeEach(() => {
  jest.useFakeTimers();
  posted.length = 0;
});
afterEach(() => {
  jest.useRealTimers();
  resetNeighbourhood();
  clearPartnerPresence();
});

describe('MapView neighbours', () => {
  it('posts SHOW_NEIGHBOURS with the cached Ranges (and again when they change), and a sign tap opens the dog card', async () => {
    setNeighbourhood({ nearby: [momo], lines });
    const view = await renderScreen(<MapView locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} neighbourhood={source} />);
    await flush();
    const first = messages('SHOW_NEIGHBOURS');
    expect(first.length).toBeGreaterThan(0);
    expect(first[first.length - 1].payload.items).toEqual([
      expect.objectContaining({ id: 'b1', name: 'Momo', cells: [{ ix: 500, iy: 500 }, { ix: 501, iy: 500 }] }),
    ]);

    await act(async () => setNearby([]));
    expect(messages('SHOW_NEIGHBOURS').pop().payload.items).toEqual([]);
    await act(async () => setNearby([momo]));

    expect(screen.queryByTestId('neighbour-card')).toBeNull();
    await act(async () => {
      screen.getByTestId('webview').props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'NEIGHBOUR_TAPPED', id: 'b1' }) } });
    });
    await flush();
    expect(screen.getByTestId('neighbour-card')).toBeOnTheScreen();
    expect(screen.getByText('Momo had a good sniff at your corner today.')).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });

  it('ignores a tap on a dog that is no longer nearby', async () => {
    const view = await renderScreen(<MapView locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} neighbourhood={source} />);
    await act(async () => {
      screen.getByTestId('webview').props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'NEIGHBOUR_TAPPED', id: 'gone' }) } });
    });
    expect(screen.queryByTestId('neighbour-card')).toBeNull();
    await unmountAndExpectNoTimers(view);
  });
});

describe('MapView partner thread', () => {
  const alex = { playerId: 'p-c', name: 'Alex', walkId: 'w1', startedAt: 1, points: [{ lat: 52, lon: 13, t: 1 }, { lat: 52.001, lon: 13, t: 2 }], updatedAt: Date.now() };

  it('posts SHOW_PARTNER_TRAIL with her points and name as they grow, and clears it when she is back', async () => {
    const view = await renderScreen(<MapView locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} neighbourhood={source} />);
    await flush();
    expect(messages('SHOW_PARTNER_TRAIL').pop().payload).toEqual({ points: [], name: '' });
    await act(async () => setPartnerPresence([alex], Date.now(), Date.now()));
    expect(messages('SHOW_PARTNER_TRAIL').pop().payload).toEqual({ points: [{ lat: 52, lon: 13 }, { lat: 52.001, lon: 13 }], name: 'Alex' });
    await act(async () => setPartnerPresence([{ ...alex, updatedAt: alex.updatedAt + 1, points: [...alex.points, { lat: 52.002, lon: 13, t: 3 }] }], Date.now(), Date.now()));
    expect(messages('SHOW_PARTNER_TRAIL').pop().payload.points).toHaveLength(3);
    await act(async () => setPartnerPresence([], Date.now(), Date.now()));
    expect(messages('SHOW_PARTNER_TRAIL').pop().payload).toEqual({ points: [], name: '' });
    await unmountAndExpectNoTimers(view);
  });

  it('does not redraw while the same heartbeat is answered again', async () => {
    const view = await renderScreen(<MapView locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} neighbourhood={source} />);
    await act(async () => setPartnerPresence([alex], Date.now(), Date.now()));
    const before = messages('SHOW_PARTNER_TRAIL').length;
    await act(async () => setPartnerPresence([alex], Date.now() + 25_000, Date.now() + 25_000));
    expect(messages('SHOW_PARTNER_TRAIL')).toHaveLength(before);
    await unmountAndExpectNoTimers(view);
  });
});

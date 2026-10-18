import React from 'react';
import { act, screen } from '@testing-library/react-native';

import type { NearbyItem } from '../../sync/apiContract';
import { setNearby } from '../../sync/nearbyStore';
import type { NeighbourhoodSource } from '../../sync/neighbourhood';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { MapView } from '../MapView';

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
const source: NeighbourhoodSource = {
  neighbourLines: async () => [{ line: 'neighbours.line.sniffCorner', botName: 'Momo', botId: 'b1', params: { bot: 'Momo' }, at: Date.now(), seq: 1 }],
  listGifts: jest.fn(async () => []),
  openGift: async () => true,
  coopWeek: jest.fn(async () => null),
};

const messages = (type: string) => posted.map((m) => JSON.parse(m)).filter((m) => m.type === type);

beforeEach(() => {
  jest.useFakeTimers();
  posted.length = 0;
});
afterEach(() => {
  jest.useRealTimers();
  setNearby([]);
});

describe('MapView neighbours', () => {
  it('posts SHOW_NEIGHBOURS with the cached Ranges (and again when they change), and a sign tap opens the dog card', async () => {
    setNearby([momo]);
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
    // the map only needs the lines: no gift or co-op requests from here
    expect(source.listGifts).not.toHaveBeenCalled();
    expect(source.coopWeek).not.toHaveBeenCalled();
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

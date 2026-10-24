import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { t } from '../../i18n';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { MapView } from '../MapView';
import type { ViertelChromeData } from '../world/useViertelChrome';

const { posted } = require('react-native-webview') as { posted: string[] };
const messages = (type: string) => posted.map((m) => JSON.parse(m)).filter((m) => m.type === type);

const chrome = (extra: Partial<ViertelChromeData> = {}): ViertelChromeData => ({
  loaded: true,
  territory: { name: 'Hinterm Park' },
  statsParts: ['42 walks', '31 streets'],
  incomeText: 'Your ground brings 0.4 treats/hr',
  notes: [{ text: 'stitched today', lat: 1, lon: 2, anchor: 'below' }],
  corners: [],
  wildSpot: null,
  fallbackCenter: null,
  rangeEmpty: false,
  ...extra,
});

beforeEach(() => {
  jest.useFakeTimers();
  posted.length = 0;
});
afterEach(() => jest.useRealTimers());

describe('MapView embedded (Viertel band)', () => {
  it('posts the notes, taps open the full map, and the signs show', async () => {
    const onEmbeddedPress = jest.fn();
    const onOpenTerritories = jest.fn();
    const view = await renderScreen(
      <MapView embedded locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} chrome={chrome()} onEmbeddedPress={onEmbeddedPress} onOpenTerritories={onOpenTerritories} />
    );
    await flush();
    expect(messages('SHOW_NOTES').pop().payload.notes).toEqual([{ text: 'stitched today', lat: 1, lon: 2, anchor: 'below' }]);
    expect(screen.getByText('Hinterm Park')).toBeOnTheScreen();
    expect(screen.getByText('Your ground brings 0.4 treats/hr')).toBeOnTheScreen();
    expect(screen.getByText('42 walks')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('world.neighbourhoodLabel') }));
    expect(onEmbeddedPress).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: t('viertel.territoriesLabel') }));
    expect(onOpenTerritories).toHaveBeenCalledTimes(1);
    expect(onEmbeddedPress).toHaveBeenCalledTimes(1);
    await unmountAndExpectNoTimers(view);
  });

  it('posts the corner signs (SHOW_CORNERS) and clears them when the list is empty', async () => {
    const corners = [{ id: '5,6', name: 'Kiosk-Ecke', ix: 5, iy: 6 }];
    const view = await renderScreen(
      <MapView embedded locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} chrome={chrome({ corners })} />
    );
    await flush();
    expect(messages('SHOW_CORNERS').pop().payload).toEqual({ corners });
    await view.rerender(
      <MapView embedded locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} chrome={chrome({ corners: [] })} />
    );
    expect(messages('SHOW_CORNERS').pop().payload).toEqual({ corners: [] });
    await unmountAndExpectNoTimers(view);
  });

  it('on the full map a tap on a corner sign reports its id', async () => {
    const onCornerPress = jest.fn();
    const view = await renderScreen(
      <MapView locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} chrome={chrome({ corners: [{ id: '5,6', name: 'Kiosk-Ecke', ix: 5, iy: 6 }] })} onCornerPress={onCornerPress} />
    );
    await flush();
    expect(messages('SHOW_CORNERS').pop().payload.corners).toHaveLength(1); // the full map shows the signs too
    await act(async () => {
      screen.getByTestId('webview').props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'CORNER_TAPPED', id: '5,6' }) } });
    });
    expect(onCornerPress).toHaveBeenCalledWith('5,6');
    await unmountAndExpectNoTimers(view);
  });

  it('while a walk is tracked the corner signs are hidden like the other signs', async () => {
    const view = await renderScreen(
      <MapView locations={[]} isTracking homeRangeRepository={createInMemoryHomeRangeRepository()} chrome={chrome({ corners: [{ id: '5,6', name: 'Kiosk-Ecke', ix: 5, iy: 6 }] })} />
    );
    await flush();
    expect(messages('SHOW_CORNERS').every((m) => m.payload.corners.length === 0)).toBe(true);
    await unmountAndExpectNoTimers(view);
  });

  it('without a Range, centres on the fallback position at zoom 16 and fits nothing', async () => {
    const view = await renderScreen(
      <MapView embedded locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} chrome={chrome({ rangeEmpty: true, fallbackCenter: { latitude: 48.1, longitude: 11.5 }, notes: [] })} />
    );
    await flush();
    expect(messages('SET_VIEW').pop().payload).toEqual({ latitude: 48.1, longitude: 11.5, zoom: 16, insetBottom: 0 });
    expect(messages('SHOW_HOME_RANGE').every((m) => m.payload.raster === null)).toBe(true);
    await unmountAndExpectNoTimers(view);
  });

  it('with nowhere to look, shows the chalk hint on linen', async () => {
    const view = await renderScreen(<MapView embedded locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} chrome={chrome({ rangeEmpty: true, notes: [] })} />);
    await flush();
    expect(screen.getByText(t('viertel.note.explore'))).toBeOnTheScreen();
    expect(messages('SET_VIEW')).toHaveLength(0);
    await unmountAndExpectNoTimers(view);
  });

  it('the full map with chrome replaces the old Territories button by the Reviere sign', async () => {
    const view = await renderScreen(<MapView locations={[]} homeRangeRepository={createInMemoryHomeRangeRepository()} chrome={chrome()} onOpenTerritories={() => undefined} />);
    await flush();
    expect(screen.getByText(t('viertel.territories'))).toBeOnTheScreen();
    expect(screen.queryByText(t('map.territories'))).toBeNull();
    await unmountAndExpectNoTimers(view);
  });

  it('shows no notes and no signs while a walk is tracked', async () => {
    const view = await renderScreen(<MapView locations={[]} isTracking homeRangeRepository={createInMemoryHomeRangeRepository()} chrome={null} onOpenTerritories={() => undefined} />);
    await flush();
    expect(messages('SHOW_NOTES').pop().payload.notes).toEqual([]);
    expect(screen.getByText(t('map.territories'))).toBeOnTheScreen();
    await unmountAndExpectNoTimers(view);
  });
});

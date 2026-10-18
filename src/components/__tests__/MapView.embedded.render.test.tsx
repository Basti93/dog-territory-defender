import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { t } from '../../i18n';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { flush, renderScreen, unmountAndExpectNoTimers } from '../../test/render';
import { MapView } from '../MapView';
import type { ViertelChromeData } from '../world/useViertelChrome';

const { posted } = require('react-native-webview') as { posted: string[] };
const messages = (type: string) => posted.map((m) => JSON.parse(m)).filter((m) => m.type === type);

const chrome = (extra: Partial<ViertelChromeData> = {}): ViertelChromeData => ({
  loaded: true,
  territory: { name: 'Hinterm Park', title: 'Everyday' },
  statsParts: ['42 walks', '31 streets'],
  notes: [{ text: 'stitched today', lat: 1, lon: 2, anchor: 'below' }],
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
    expect(screen.getByText(t('territories.title.everyday'))).toBeOnTheScreen();
    expect(screen.getByText('42 walks')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('world.neighbourhoodLabel') }));
    expect(onEmbeddedPress).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: t('viertel.territoriesLabel') }));
    expect(onOpenTerritories).toHaveBeenCalledTimes(1);
    expect(onEmbeddedPress).toHaveBeenCalledTimes(1);
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

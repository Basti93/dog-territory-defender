import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import { Location, TerritoryPolygon } from '../types';
import { mapHTML } from '../web/mapHTML';
import { log } from '../utils/log';
import { WalkRepository } from '../storage/WalkRepository';

interface MapViewProps {
  locations: Location[];
  territory?: TerritoryPolygon;
  currentLocation?: Location;
  walkRepository?: WalkRepository;
  territoryRefreshKey?: number;
}

export function MapView({
  locations,
  territory,
  currentLocation,
  walkRepository,
  territoryRefreshKey,
}: MapViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);

  const post = (type: string, payload: unknown) => {
    webViewRef.current?.postMessage(JSON.stringify({ type, payload }));
  };

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const { tag, data } = JSON.parse(event.nativeEvent.data);
      log(tag, data);
    } catch (err) {
      log('WEBVIEW_MESSAGE_PARSE_ERROR', { error: String(err), raw: event.nativeEvent.data });
    }
  };

  // Messages posted before the WebView finishes loading its page are silently
  // dropped (its message listener isn't registered yet) — every effect below
  // is gated on isReady, and re-runs once the WebView actually signals it's loaded.
  useEffect(() => {
    if (!isReady || locations.length !== 0) return;

    log('MAP_RESET');
    post('RESET', {});

    if (walkRepository) {
      walkRepository.getWalks().then((walks) => {
        const territories = walks.filter((w) => w.closed && w.territory).map((w) => w.territory!);
        log('MAP_SHOW_ALL_TERRITORIES', { count: territories.length });
        post('SHOW_ALL_TERRITORIES', { territories });
      });
    }
  }, [isReady, locations.length === 0, walkRepository, territoryRefreshKey]);

  useEffect(() => {
    if (!isReady || !currentLocation) return;
    post('UPDATE_LOCATION', currentLocation);
  }, [isReady, currentLocation]);

  useEffect(() => {
    if (!isReady) return;
    post('UPDATE_TRAIL', { locations });
  }, [isReady, locations]);

  useEffect(() => {
    if (!isReady || !territory) return;
    log('MAP_SHOW_TERRITORY', { points: territory.coordinates.length, areaM2: territory.area });
    post('SHOW_TERRITORY', { coordinates: territory.coordinates });
  }, [isReady, territory]);

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: mapHTML }}
        style={{ flex: 1 }}
        onMessage={handleWebViewMessage}
        onLoadEnd={() => {
          log('MAP_WEBVIEW_LOAD_END');
          setIsReady(true);
        }}
      />
    </View>
  );
}

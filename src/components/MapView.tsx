import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';

import { Location, TerritoryPolygon } from '../types';
import { mapHTML } from '../web/mapHTML';
import { log } from '../utils/log';

interface MapViewProps {
  locations: Location[];
  territory?: TerritoryPolygon;
  currentLocation?: Location;
}

export function MapView({ locations, territory, currentLocation }: MapViewProps) {
  const webViewRef = useRef<WebView>(null);

  const post = (type: string, payload: unknown) => {
    webViewRef.current?.postMessage(JSON.stringify({ type, payload }));
  };

  useEffect(() => {
    if (locations.length === 0) {
      log('MAP_RESET');
      post('RESET', {});
    }
  }, [locations.length === 0]);

  useEffect(() => {
    if (currentLocation) {
      post('UPDATE_LOCATION', currentLocation);
    }
  }, [currentLocation]);

  useEffect(() => {
    post('UPDATE_TRAIL', { locations });
  }, [locations]);

  useEffect(() => {
    if (territory) {
      log('MAP_SHOW_TERRITORY', { points: territory.coordinates.length, areaM2: territory.area });
      post('SHOW_TERRITORY', { coordinates: territory.coordinates });
    }
  }, [territory]);

  return (
    <View style={{ flex: 1 }}>
      <WebView ref={webViewRef} originWhitelist={['*']} source={{ html: mapHTML }} style={{ flex: 1 }} />
    </View>
  );
}

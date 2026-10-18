import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import { Location } from '../types';
import { mapHTML } from '../web/mapHTML';
import { buildHomeRangeRasterPayload, cellIdsToCoords } from '../web/homeRangeRaster';
import { log } from '../utils/log';
import { paintedCells } from '../utils/grid';
import { palette, radii, shadows, textStyle, tokens } from '../ui';
import { Cell, HomeRangeRepository } from '../storage/HomeRangeRepository';
import { t } from '../i18n';

interface MapViewProps {
  locations: Location[];
  currentLocation?: Location;
  homeRangeRepository?: HomeRangeRepository;
  /** True while a walk is actively being tracked — drives the live-walk Home Range preview (tasks.md task 5.3): this walk's own painted cells are shown immediately, well before Finish Walk persists them. */
  isTracking?: boolean;
  /** Bump to force a re-fetch of the persisted Home Range (e.g. after Finish Walk paints new cells, or after returning from Walk History). */
  homeRangeRefreshKey?: number;
  /** The "Somewhere Wild" marker location (docs/decisions/somewhere-wild), or `null`/`undefined` to show none — see SomewhereWildCard.tsx's `onSpotChange`. The marker and the card must always agree on the same spot, so this is the single source both are driven from. */
  wildSpot?: { latitude: number; longitude: number } | null;
  /** Set to a new object (even with the same coordinates) whenever the caller wants to pan/zoom to a spot right now — e.g. a "Somewhere Wild" card tap (tasks.md task 5.2). Consumed once per change; doesn't affect the marker itself (see `wildSpot` for that). */
  panToSpot?: { latitude: number; longitude: number } | null;
  /**
   * The Territories list screen's entry point (docs/decisions/territories,
   * design.md Decision 8 — resolved by the user 2026-08-22 to live on the map
   * screen's own chrome, not the Doorstep, not folded into Stats). Omitted
   * means the button doesn't render (e.g. a caller that doesn't yet wire
   * Territories) — mirrors this component's other optional-prop-gated bits.
   */
  onOpenTerritories?: () => void;
}

export function MapView({
  locations,
  currentLocation,
  homeRangeRepository,
  isTracking = false,
  homeRangeRefreshKey,
  wildSpot,
  panToSpot,
  onOpenTerritories,
}: MapViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  // The persisted Home Range, fetched once per refresh trigger (not on
  // every GPS fix) — the live-walk overlay below is layered on top of this
  // cached snapshot locally, so a walk in progress doesn't re-query storage
  // every second. See design.md Decision 1's "incremental per-fix cost is
  // ~1/750th of a full repaint" budget, which is what makes recomputing
  // paintedCells(locations) on every fix affordable; re-fetching from
  // storage on every fix would not be.
  const persistedCellsRef = useRef<Cell[]>([]);

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

  const postHomeRange = (fitBounds: boolean) => {
    const liveOverlay = isTracking && locations.length > 0 ? cellIdsToCoords(paintedCells(locations)) : [];
    const raster = buildHomeRangeRasterPayload(persistedCellsRef.current, Date.now(), liveOverlay);
    post('SHOW_HOME_RANGE', { raster, fitBounds });
  };

  // Messages posted before the WebView finishes loading its page are silently
  // dropped (its message listener isn't registered yet) — every effect below
  // is gated on isReady, and re-runs once the WebView actually signals it's loaded.
  //
  // Gated on `!isTracking` (not `locations.length === 0`): a just-finished
  // walk keeps its trail in `appState.walk` until "New Walk" is pressed
  // (unchanged UX from before this change), but its newly-painted cells
  // still need to appear in the persisted Home Range render right away —
  // otherwise the player finishes a walk and the Bloom doesn't visibly
  // reflect it until they reset. Only re-fits the map to the full Range
  // when the walk is also fully cleared (`locations.length === 0`); right
  // after finishing, the map stays where the player's trail is.
  useEffect(() => {
    if (!isReady || isTracking) return;

    if (locations.length === 0) {
      log('MAP_RESET');
      post('RESET', {});
    }

    if (homeRangeRepository) {
      homeRangeRepository.getCells().then((cells) => {
        persistedCellsRef.current = cells;
        log('MAP_SHOW_HOME_RANGE', { cellCount: cells.length });
        postHomeRange(locations.length === 0);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, isTracking, locations.length === 0, homeRangeRepository, homeRangeRefreshKey]);

  useEffect(() => {
    if (!isReady || !currentLocation) return;
    post('UPDATE_LOCATION', currentLocation);
  }, [isReady, currentLocation]);

  useEffect(() => {
    if (!isReady) return;
    post('UPDATE_TRAIL', { locations });
  }, [isReady, locations]);

  // Live-walk painting preview (tasks.md task 5.3): while tracking, overlay
  // this walk's own painted cells (fully fresh) on top of the last-fetched
  // persisted Range, without writing anything to storage yet — the DB write
  // still only happens once, at Finish Walk (section 2.2's batch write).
  useEffect(() => {
    if (!isReady || !isTracking) return;
    postHomeRange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, isTracking, locations]);

  // docs/decisions/somewhere-wild task 6.2: sends SHOW_WILD_SPOT whenever
  // the winning cluster/New-Ground location changes, and clears it (posts
  // `null`) when neither state applies — mirrors SHOW_HOME_RANGE's own
  // "one bridge message, current truth" pattern.
  useEffect(() => {
    if (!isReady) return;
    post('SHOW_WILD_SPOT', wildSpot ?? null);
  }, [isReady, wildSpot]);

  // "Somewhere Wild" card tap (tasks.md task 5.2) — pans/zooms to the
  // relevant spot without touching the marker itself (already shown/hidden
  // by the effect above).
  useEffect(() => {
    if (!isReady || !panToSpot) return;
    post('PAN_TO_SPOT', panToSpot);
  }, [isReady, panToSpot]);

  return (
    <View style={{ flex: 1 }}>
      {/* Toy-window frame: outer view carries the soft shadow (overflow hidden would clip it on iOS); inner view clips the WebView to the rounded corners. */}
      <View style={styles.frameShadow}>
      <View style={styles.frame}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: mapHTML }}
        style={styles.webView}
        onMessage={handleWebViewMessage}
        onLoadEnd={() => {
          log('MAP_WEBVIEW_LOAD_END');
          setIsReady(true);
        }}
      />
      </View>
      </View>
      {/* Territories list screen entry point (docs/decisions/territories,
          design.md Decision 8) — the map screen's own chrome, floating over
          the WebView so it never competes with the map's bottom controls. */}
      {onOpenTerritories && (
        <TouchableOpacity style={styles.territoriesButton} onPress={onOpenTerritories} activeOpacity={0.85}>
          <Text style={[textStyle('small'), { color: tokens.text }]}>{t('map.territories')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frameShadow: {
    flex: 1,
    borderRadius: radii.card,
    backgroundColor: palette.background,
    ...shadows.card,
  },
  frame: {
    flex: 1,
    borderRadius: radii.card,
    borderWidth: 4,
    borderColor: palette.background,
    overflow: 'hidden',
    backgroundColor: palette.background,
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  territoriesButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: palette.background,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
});

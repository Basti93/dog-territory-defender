import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import type { HomeRangeRepository } from '../../storage/HomeRangeRepository';
import type { StoredWalk } from '../../storage/WalkRepository';
import { splitAtGaps } from '../../utils/geometry';
import { splitTrailByNewGround } from '../../utils/grid';
import { log } from '../../utils/log';
import { buildHomeRangeRasterPayload } from '../../web/homeRangeRaster';
import { walkPortraitHTML } from '../../web/walkPortraitHTML';

/**
 * The front of an open postcard: the walk's own trail drawn on the muted Home Range patchwork (the Walk Portrait's
 * render, now living on the card). A non-interactive WebView; the touch belongs to the card (flip by tap or swipe).
 * One of these at most is mounted at a time (the open card), and it must never sit inside an opacity-animated parent.
 */
export function PostcardMap({ walk, homeRangeRepository }: { walk: StoredWalk; homeRangeRepository: HomeRangeRepository }) {
  const webViewRef = useRef<WebView>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);

  useEffect(() => {
    if (!isWebViewReady) return;
    let cancelled = false;
    (async () => {
      const trail = walk.locations;
      const walkLatLngs = trail.map((loc) => [loc.latitude, loc.longitude]);
      // No line across a jump, ride or long signal loss: the trail is drawn as runs cut where a step fails the distance rule.
      const toLatLngs = (points: typeof trail) => points.map((p) => [p.latitude, p.longitude]);
      const walkRuns = splitAtGaps(trail).map(toLatLngs);
      const newGroundRuns = splitTrailByNewGround(trail, walk.newGroundCellIds)
        .filter((run) => run.color === 'new-ground')
        .flatMap((run) => splitAtGaps(run.points).map(toLatLngs));
      const cells = await homeRangeRepository.getCells();
      if (cancelled) return;
      const raster = buildHomeRangeRasterPayload(cells, Date.now());
      webViewRef.current?.postMessage(JSON.stringify({ type: 'RENDER_WALK', payload: { walkLatLngs, walkRuns, newGroundRuns, raster } }));
    })().catch((err) => log('POSTCARD_MAP_ERROR', { error: String(err) }));
    return () => {
      cancelled = true;
    };
  }, [isWebViewReady, walk, homeRangeRepository]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      log(msg.type, msg);
    } catch (err) {
      log('WALK_PORTRAIT_MESSAGE_PARSE_ERROR', { error: String(err), raw: event.nativeEvent.data });
    }
  };

  return (
    <View style={styles.fill} pointerEvents="none">
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: walkPortraitHTML }}
        style={styles.fill}
        onMessage={handleMessage}
        onLoadEnd={() => setIsWebViewReady(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

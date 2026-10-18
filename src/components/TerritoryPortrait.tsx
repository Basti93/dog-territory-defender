import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import { Cell, HomeRangeRepository } from '../storage/HomeRangeRepository';
import { buildHomeRangeRasterPayload } from '../web/homeRangeRaster';
import { portraitHTML } from '../web/portraitHTML';
import { log } from '../utils/log';
import { ArtImage, palette, shadows, textStyle } from '../ui';
import { t } from '../i18n';

interface TerritoryPortraitProps {
  /** Omit when `cells` is supplied directly (see below) — the whole-Range Doorstep portrait's original use. */
  homeRangeRepository?: HomeRangeRepository;
  /**
   * A pre-fetched, already-scoped cell list — used by the per-territory
   * card (docs/decisions/territories/tasks.md task 10.1) to render just
   * one Territory's own cells via this exact same rendering path
   * (buildHomeRangeRasterPayload + portraitHTML), with no new rendering
   * code (design.md Decision 8). When supplied, the internal
   * `homeRangeRepository.getCells()` fetch below is skipped entirely.
   */
  cells?: Cell[];
  /** The portrait tap — opens the map (dismiss only, per design.md Decision 7). */
  onPress: () => void;
  /** Called once cells are known, with whether they're empty. The caller (DoorstepScreen/TerritoryCard) renders its own "hasn't marked the map yet" copy in that case — this component itself simply renders nothing (design.md Decision 2's "TerritoryPortrait simply isn't rendered when cells.length === 0"). */
  onEmptyChange?: (isEmpty: boolean) => void;
  /** Portrait height in px (default 160). The Doorstep passes a smaller value so Buddy fits above Start Walk. */
  height?: number;
}

/**
 * The Doorstep's still Home Range portrait (docs/decisions/home-dashboard,
 * design.md Decision 2) — a hidden WebView (src/web/portraitHTML.ts) draws
 * the Range outline + Bloom fill over OSM tiles and captures the result to a
 * data URL; this component only ever shows the composited `<Image>`, tappable
 * to open the map. The WebView itself is never visible.
 *
 * On `PORTRAIT_FAILED` (offline, or tiles didn't load in time — a real
 * possibility now that the portrait is network-dependent, see design.md's
 * "network-dependency consequence" note): falls back to a neutral,
 * non-error line. Never a broken-image icon, never technical error text.
 */
export function TerritoryPortrait({ homeRangeRepository, cells: suppliedCells, onPress, onEmptyChange, height = 160 }: TerritoryPortraitProps) {
  const webViewRef = useRef<WebView>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [hasCells, setHasCells] = useState<boolean | null>(null);

  useEffect(() => {
    if (suppliedCells) {
      const isEmpty = suppliedCells.length === 0;
      setHasCells(!isEmpty);
      onEmptyChange?.(isEmpty);
      return;
    }
    homeRangeRepository?.getCells().then((cells) => {
      const isEmpty = cells.length === 0;
      setHasCells(!isEmpty);
      onEmptyChange?.(isEmpty);
    });
    // Only meant to run once, on mount — mirrors every other repository-backed
    // screen's own one-time initial fetch (e.g. DenScreen.tsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeRangeRepository, suppliedCells]);

  useEffect(() => {
    if (!isWebViewReady || hasCells !== true) return;

    const renderFromCells = (cells: Cell[]) => {
      const raster = buildHomeRangeRasterPayload(cells, Date.now());
      if (!raster) return;
      webViewRef.current?.postMessage(JSON.stringify({ type: 'RENDER_PORTRAIT', payload: { raster } }));
    };

    if (suppliedCells) {
      renderFromCells(suppliedCells);
      return;
    }
    homeRangeRepository?.getCells().then(renderFromCells);
  }, [isWebViewReady, hasCells, homeRangeRepository, suppliedCells]);

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'PORTRAIT_READY') {
        setDataUrl(msg.dataUrl);
      } else if (msg.type === 'PORTRAIT_FAILED') {
        setFailed(true);
      } else {
        log(msg.type, msg);
      }
    } catch (err) {
      log('PORTRAIT_MESSAGE_PARSE_ERROR', { error: String(err), raw: event.nativeEvent.data });
    }
  };

  if (hasCells === false) {
    return null;
  }

  return (
    <TouchableOpacity style={[styles.container, { minHeight: height }]} onPress={onPress} activeOpacity={0.85}>
      {dataUrl ? (
        <Image source={{ uri: dataUrl }} resizeMode="contain" style={[styles.image, { height }]} />
      ) : failed ? (
        <View style={styles.fallback}>
          <ArtImage art="icon-paw" size={32} />
          <Text style={[textStyle('small'), styles.fallbackText]}>{t('portrait.tapForRange')}</Text>
        </View>
      ) : (
        <View style={styles.fallback}>
          <Text style={[textStyle('small'), styles.fallbackText]}>{t('portrait.gettingTerritory')}</Text>
        </View>
      )}
      {/* Never visible, never interactive — exists only to render the
          composited data URL above (design.md's "WebView itself never
          visible" rule). */}
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: portraitHTML }}
        style={styles.hiddenWebView}
        pointerEvents="none"
        onMessage={handleWebViewMessage}
        onLoadEnd={() => setIsWebViewReady(true)}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: palette.background,
    backgroundColor: palette.meadowTint,
    ...shadows.soft,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: 160,
  },
  fallback: {
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  fallbackText: {
    color: palette.muted,
    textAlign: 'center',
  },
  hiddenWebView: {
    // Some native WebView engines skip layout/rendering entirely for a
    // 0x0 native view, regardless of its internal HTML/CSS — this needs a
    // real nonzero size (matching portraitHTML.ts's own #map size) so the
    // WebView actually renders, positioned off-screen instead of sized
    // away.
    position: 'absolute',
    top: -1000,
    left: -1000,
    width: 400,
    height: 400,
    opacity: 0,
  },
});

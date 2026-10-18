import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';

import { dogDisplayName } from '../economy/denEconomy';
import { HomeRangeRepository } from '../storage/HomeRangeRepository';
import { StoredWalk, WalkRepository } from '../storage/WalkRepository';
import { cumulativeDistance } from '../utils/geometry';
import { splitTrailByNewGround } from '../utils/grid';
import { log } from '../utils/log';
import { dayAndTimeOfDayPhrase } from '../utils/manualWalkLog';
import { resolveLabelForPoint } from '../utils/streetLookup';
import { buildHomeRangeRasterPayload } from '../web/homeRangeRaster';
import { walkPortraitHTML } from '../web/walkPortraitHTML';
import { TerritoryPortrait } from './TerritoryPortrait';
import { Chip, Header, palette, radii, Screen, shadows, spacing, textStyle } from '../ui';
import { formatDistanceKm, formatNumber, t } from '../i18n';

// Walk Portrait (docs/decisions/walk-portrait) — a full-screen, tap-in-from-
// history view of one walk's own route, animated on top of the player's
// muted aggregate Home Range (design.md Decision 1/2). A pure presentation
// layer: every figure shown here already comes from an already-shipped,
// already-tested capability (walk-storage, home-range, den-economy) — this
// screen adds no new economy/mechanic logic of its own.

/**
 * Which of design.md Decision 2's rendering states a walk resolves to.
 * `trailSource` is whichever walk's own recorded GPS trail is actually
 * shown — the opened walk itself for a tracked walk (or a manual log that
 * refreshed a route), or that linked route's own StoredWalk record for a
 * manual log (design.md Decision 6 — the manual log's own `locations` is
 * always empty; its metadata like `treatsEarned` still comes from the
 * opened walk itself, never the linked route's).
 */
export type WalkPortraitState = { kind: 'trail'; trailSource: StoredWalk } | { kind: 'fallback' };

/**
 * Resolves which of design.md Decision 2's three cases (tasks.md task 4.1)
 * a given walk falls into: (a) it has its own recorded trail; (b) it's a
 * manual log that refreshed a route which still exists; (c) neither —
 * either a manual log with no linked route, or one whose linked route has
 * since been deleted (walk-storage's "linked route can later be deleted"
 * scenario). Never throws for a dangling `refreshedRouteWalkId` — a
 * `getWalk()` miss falls straight through to the fallback state, never a
 * broken reference or crash.
 */
export async function resolveWalkPortraitState(
  walk: StoredWalk,
  walkRepository: WalkRepository
): Promise<WalkPortraitState> {
  if (walk.locations.length > 0) {
    return { kind: 'trail', trailSource: walk };
  }
  if (walk.refreshedRouteWalkId) {
    const routeWalk = await walkRepository.getWalk(walk.refreshedRouteWalkId);
    if (routeWalk) {
      return { kind: 'trail', trailSource: routeWalk };
    }
  }
  return { kind: 'fallback' };
}

/** "1 hr 12 min" / "8 min" — not worth its own utility module for a two-line subtraction (design.md Decision 5). */
function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? t('portrait.durationHm', { hours, minutes }) : t('portrait.durationM', { minutes });
}

interface WalkPortraitScreenProps {
  walk: StoredWalk;
  walkRepository: WalkRepository;
  homeRangeRepository: HomeRangeRepository;
  dogName: string | null;
  onClose: () => void;
}

export function WalkPortraitScreen({ walk, walkRepository, homeRangeRepository, dogName, onClose }: WalkPortraitScreenProps) {
  const webViewRef = useRef<WebView>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [state, setState] = useState<WalkPortraitState | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [rangeEmpty, setRangeEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveWalkPortraitState(walk, walkRepository).then((resolved) => {
      if (!cancelled) setState(resolved);
    });
    return () => {
      cancelled = true;
    };
    // Resolves once per opened walk (walk.id) — App.tsx's viewingWalk state
    // fully swaps rather than mutating in place when a different walk is
    // opened, so this never needs to re-resolve mid-mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk.id]);

  useEffect(() => {
    if (state?.kind !== 'trail' || state.trailSource.locations.length === 0) return;
    const start = state.trailSource.locations[0];
    resolveLabelForPoint(start.latitude, start.longitude)
      .then(setPlaceLabel)
      .catch(() => setPlaceLabel(null));
  }, [state]);

  useEffect(() => {
    if (!isWebViewReady || state?.kind !== 'trail') return;
    const trailSource = state.trailSource;
    (async () => {
      const trail = trailSource.locations;
      const walkLatLngs = trail.map((loc) => [loc.latitude, loc.longitude]);
      const newGroundRuns = splitTrailByNewGround(trail, trailSource.newGroundCellIds)
        .filter((run) => run.color === 'new-ground')
        .map((run) => run.points.map((p) => [p.latitude, p.longitude]));
      const cells = await homeRangeRepository.getCells();
      const raster = buildHomeRangeRasterPayload(cells, Date.now());
      webViewRef.current?.postMessage(
        JSON.stringify({ type: 'RENDER_WALK', payload: { walkLatLngs, newGroundRuns, raster } })
      );
    })();
  }, [isWebViewReady, state, homeRangeRepository]);

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      log(msg.type, msg);
    } catch (err) {
      log('WALK_PORTRAIT_MESSAGE_PARSE_ERROR', { error: String(err), raw: event.nativeEvent.data });
    }
  };

  const dog = dogDisplayName(dogName);

  if (!state) {
    return (
      <Screen>
        <Header title={t('portrait.title')} icon="icon-walks" onBack={onClose} />
        <Text style={[textStyle('body'), styles.loading]}>{t('portrait.loading')}</Text>
      </Screen>
    );
  }

  const trailSource = state.kind === 'trail' ? state.trailSource : null;
  const distanceMeters = trailSource ? cumulativeDistance(trailSource.locations) : 0;
  const durationMs =
    trailSource && trailSource.locations.length > 1
      ? trailSource.locations[trailSource.locations.length - 1].timestamp - trailSource.locations[0].timestamp
      : 0;
  const dateLine = dayAndTimeOfDayPhrase(walk.startTime);
  const titleLine = placeLabel ? t('portrait.titleWithPlace', { date: dateLine, place: placeLabel }) : dateLine;

  return (
    <Screen>
      <Header title={t('portrait.title')} icon="icon-walks" onBack={onClose} />

      {/* Outer view carries the soft shadow; inner view clips the map to the rounded frame. */}
      <View style={styles.frameShadow}>
        <View style={styles.frame}>
          {state.kind === 'trail' ? (
            <WebView
              ref={webViewRef}
              originWhitelist={['*']}
              source={{ html: walkPortraitHTML }}
              style={styles.webView}
              onMessage={handleWebViewMessage}
              onLoadEnd={() => setIsWebViewReady(true)}
            />
          ) : rangeEmpty ? (
            <View style={styles.emptyPortrait}>
              <Text style={[textStyle('body'), styles.emptyPortraitText]}>
                {t('doorstep.emptyRange', { dog })}
              </Text>
            </View>
          ) : (
            <TerritoryPortrait homeRangeRepository={homeRangeRepository} onPress={() => {}} onEmptyChange={setRangeEmpty} />
          )}
        </View>
      </View>

      <View style={styles.metaRow}>
        {state.kind === 'trail' ? (
          <>
            <Text style={textStyle('h2')}>{titleLine}</Text>
            <View style={styles.metaStats}>
              <Chip tint="meadow" label={t('portrait.distance', { value: formatDistanceKm(distanceMeters / 1000) })} />
              <Chip tint="sky" label={t('portrait.duration', { value: formatDuration(durationMs) })} />
              {walk.treatsEarned !== undefined && <Chip tint="warm" icon="icon-treat" label={t('portrait.treats', { count: formatNumber(walk.treatsEarned) })} />}
            </View>
          </>
        ) : (
          <>
            <Text style={textStyle('h2')}>{dateLine}</Text>
            {/* Recommended default from proposal.md's Open Question 2/design.md
                Decision 2, accepted 2026-08-22 — a game-master line, not
                invented here. */}
            <Text style={[textStyle('small'), { color: palette.muted }]}>
              {t('portrait.noTrail', { dog })}
            </Text>
            {walk.treatsEarned !== undefined && (
              <View style={styles.metaStats}>
                <Chip tint="warm" icon="icon-treat" label={t('portrait.treats', { count: formatNumber(walk.treatsEarned) })} />
              </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { textAlign: 'center', color: palette.muted, paddingVertical: spacing.xl },
  frameShadow: {
    flex: 1,
    borderRadius: radii.card,
    backgroundColor: palette.card,
    ...shadows.card,
  },
  frame: {
    flex: 1,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: palette.background,
  },
  webView: { flex: 1 },
  emptyPortrait: {
    flex: 1,
    backgroundColor: palette.meadowTint,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyPortraitText: { color: palette.muted, textAlign: 'center' },
  metaRow: { paddingTop: spacing.lg, gap: spacing.sm },
  metaStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

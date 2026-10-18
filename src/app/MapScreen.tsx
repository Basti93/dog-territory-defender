import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MapView } from '../components/MapView';
import { SomewhereWildCard, SomewhereWildSpot } from '../components/SomewhereWildCard';
import { Button, palette, spacing, textStyle, tokens } from '../ui';
import { dogDisplayName } from '../economy/denEconomy';
import { formatDistanceKm, t } from '../i18n';
import { cumulativeDistance } from '../utils/geometry';
import { Walk } from '../types';
import { AppRepositories } from './repositories';
import { ScreenFrame } from './ScreenFrame';

interface MapScreenProps {
  repos: AppRepositories;
  walk: Walk | null;
  isTracking: boolean;
  error: string | null;
  /** Auto-finish is on for this walk: shows the hint sign. */
  autoFinishEnabled: boolean;
  /** Minutes left in the back-home countdown; null until the home dwell has begun. */
  homeCountdownMin: number | null;
  dogName: string | null;
  treats: number | null;
  level: number | null;
  homeRangeRefreshKey: number;
  wildSpot: SomewhereWildSpot | null;
  panToSpot: (SomewhereWildSpot & { requestId: number }) | null;
  onWildSpotChange: (spot: SomewhereWildSpot | null) => void;
  onTapWildSpot: (spot: SomewhereWildSpot) => void;
  onOpenTerritories: () => void;
  onBackToDoorstep: () => void;
  onFinishWalk: () => void;
  onCancelWalk: () => void;
  onNewWalk: () => void;
}

/** The live/idle map with its bottom controls. Hosts a WebView, so never FadeSlideIn-wrapped. */
export function MapScreen(p: MapScreenProps) {
  const { walk, isTracking } = p;
  const distance = walk ? cumulativeDistance(walk.locations) / 1000 : 0;
  return (
    <ScreenFrame fadeKey={null} safeArea>
      <StatusBar />

      {/* Map */}
      <View style={styles.map}>
        <MapView
          locations={walk?.locations || []}
          currentLocation={walk?.locations[walk.locations.length - 1]}
          homeRangeRepository={p.repos.homeRangeRepository}
          isTracking={isTracking}
          homeRangeRefreshKey={p.homeRangeRefreshKey}
          wildSpot={p.wildSpot}
          panToSpot={p.panToSpot}
          onOpenTerritories={p.onOpenTerritories}
        />
      </View>

      {/* Bottom controls */}
      <View style={styles.controls}>
        {/* "Somewhere Wild" (docs/decisions/somewhere-wild) — the map screen
            only, never the Den screen and never a push notification. Renders
            nothing most of the time (see SomewhereWildCard.tsx). */}
        <SomewhereWildCard
          homeRangeRepository={p.repos.homeRangeRepository}
          walkRepository={p.repos.walkRepository}
          dogName={p.dogName}
          territoryRepository={p.repos.territoryRepository}
          refreshKey={p.homeRangeRefreshKey}
          onSpotChange={p.onWildSpotChange}
          onTapSpot={p.onTapWildSpot}
        />

        <View style={styles.stats}>
          <Text style={[textStyle('min'), styles.statLabel]}>{t('app.distance')}</Text>
          <Text style={textStyle('body')}>{formatDistanceKm(distance)}</Text>

          <Text style={[textStyle('min'), styles.statLabel]}>{t('app.points')}</Text>
          <Text style={textStyle('body')}>{walk?.locations.length || 0}</Text>

          <Text style={[textStyle('min'), styles.statLabel]}>{t('den.treats')}</Text>
          <Text style={textStyle('body')}>{p.treats !== null ? Math.floor(p.treats) : '…'}</Text>

          <Text style={[textStyle('min'), styles.statLabel]}>{t('stats.level')}</Text>
          <Text style={textStyle('body')}>{p.level !== null ? t('den.dogLevel', { dog: dogDisplayName(p.dogName), level: p.level }) : '…'}</Text>
        </View>

        {isTracking && p.autoFinishEnabled && (
          <Text style={[textStyle('hand'), styles.autoHint]}>
            {p.homeCountdownMin !== null ? t('autoFinish.countdown', { n: p.homeCountdownMin }) : t('autoFinish.hint')}
          </Text>
        )}

        <View style={styles.buttons}>
          {!isTracking ? (
            // Start Walk lives on the Doorstep (home-dashboard design.md
            // Decision 9); all that's left here is a way back to it.
            <Button label={t('app.backToDoorstep')} variant="secondary" onPress={p.onBackToDoorstep} />
          ) : (
            <>
              {/* Two-way terminal action model: Finish Walk always saves the
                  trail and paints it into the Home Range, regardless of shape.
                  Never dismissible to the Doorstep while tracking — an
                  explicit non-goal (home-dashboard design.md Decisions 8-13). */}
              <Button label={t('app.finishWalk')} onPress={p.onFinishWalk} />
              <Button label={t('common.cancel')} variant="secondary" labelColor={tokens.warm} onPress={p.onCancelWalk} />
            </>
          )}

          {walk && !isTracking && walk.closed && <Button label={t('app.newWalk')} onPress={p.onNewWalk} />}
        </View>

        {p.error && <Text style={[textStyle('min'), styles.error]}>{p.error}</Text>}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  // No bottom padding: SafeAreaView already adds the bottom inset.
  controls: {
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.background,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
  },
  statLabel: { color: palette.muted },
  autoHint: { color: palette.muted, textAlign: 'center', marginBottom: spacing.sm },
  buttons: { gap: spacing.sm },
  error: { color: tokens.warm, marginTop: spacing.sm },
});

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MapView } from '../components/MapView';
import { CornerSheet, type CornerTools } from '../components/world/CornerSheet';
import { useViertelChrome } from '../components/world/useViertelChrome';
import { SomewhereWildCard, SomewhereWildSpot } from '../components/SomewhereWildCard';
import { Button, palette, spacing, TextLink, textStyle, tokens } from '../ui';
import { dogDisplayName } from '../economy/denEconomy';
import { formatDistanceKm, t } from '../i18n';
import { walkDistanceMeters } from '../utils/geometry';
import { Walk } from '../types';
import type { BuddyAppearance } from '../buddy/buddyAppearance';
import { AppRepositories } from './repositories';
import { ScreenFrame } from './ScreenFrame';
import type { NeighbourhoodActions } from '../sync/neighbourhood';

interface MapScreenProps {
  repos: AppRepositories;
  walk: Walk | null;
  isTracking: boolean;
  error: string | null;
  /** Auto-finish is on for this walk: shows the hint sign. */
  autoFinishEnabled: boolean;
  /** Minutes left in the back-home countdown; null until the home dwell has begun. */
  homeCountdownMin: number | null;
  /** The GPS was quiet for a long while (battery saver, frozen app): say the walk is still on. */
  gpsGapNote: boolean;
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
  /** The sync engine: Nachbarhund lines for the profile card. */
  neighbourhood?: NeighbourhoodActions;
  /** "Unsere Ecken": the corner store, rename and namer lookup (the signs on the map, the naming sheet). Omitted = no corners. */
  cornerTools?: CornerTools;
  buddyAppearance?: BuddyAppearance;
}

/** The live/idle map with its bottom controls. Hosts a WebView, so never FadeSlideIn-wrapped. */
export function MapScreen(p: MapScreenProps) {
  const { walk, isTracking } = p;
  const distance = walk ? walkDistanceMeters(walk) / 1000 : 0;
  // Idle map: territory sign, numbers sign and handwritten notes (konzept section 3). Hidden while a walk is tracked.
  // A tap on a corner sign opens the naming sheet; a saved name re-reads the signs.
  const [cornerSheetId, setCornerSheetId] = useState<string | null>(null);
  const [cornerEdits, setCornerEdits] = useState(0);
  const viertelChrome = useViertelChrome({
    homeRangeRepository: p.repos.homeRangeRepository,
    walkRepository: p.repos.walkRepository,
    territoryRepository: p.repos.territoryRepository,
    denEconomyRepository: p.repos.denEconomyRepository,
    cornerRepository: p.cornerTools?.repository,
    dogName: p.dogName,
    refreshKey: p.homeRangeRefreshKey + cornerEdits,
    wildSpot: p.wildSpot,
  });
  return (
    <ScreenFrame fadeKey={null} safeArea treats={p.treats}>
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
          neighbourhood={p.neighbourhood}
          chrome={isTracking ? null : viertelChrome}
          onCornerPress={p.cornerTools ? setCornerSheetId : undefined}
        />
      </View>

      {p.cornerTools && p.buddyAppearance && cornerSheetId && (
        <CornerSheet
          cornerId={cornerSheetId}
          cornerRepository={p.cornerTools.repository}
          walkRepository={p.repos.walkRepository}
          buddyAppearance={p.buddyAppearance}
          onRename={p.cornerTools.rename}
          namedByOther={p.cornerTools.namedByOther}
          onClose={(changed) => {
            setCornerSheetId(null);
            if (changed) setCornerEdits((n) => n + 1);
          }}
        />
      )}

      {/* Bottom controls */}
      <View style={styles.controls}>
        {/* "Somewhere Wild" (docs/decisions/somewhere-wild.md) — the map screen
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

          <Text style={[textStyle('min'), styles.statLabel]}>{t('stats.level')}</Text>
          <Text style={textStyle('body')}>{p.level !== null ? t('den.dogLevel', { dog: dogDisplayName(p.dogName), level: p.level }) : '…'}</Text>
        </View>

        {isTracking && p.gpsGapNote && <Text style={[textStyle('hand'), styles.autoHint]}>{t('walk.gpsGap')}</Text>}

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
              {/* Terminal actions: Finish Walk saves the trail and paints it into the Home Range, unless the walk never
                  went anywhere (walkHasMovement: then nothing is stored, like a cancel). Cancel Walk discards the walk
                  (App asks once if it has moved) and stays a calm link under the big Finish button.
                  The live map can be left with back (the walk keeps running), never by finishing or cancelling. */}
              <Button label={t('app.finishWalk')} onPress={p.onFinishWalk} />
              <TextLink label={t('walk.cancelWalk')} onPress={p.onCancelWalk} style={styles.cancelLink} textStyleOverride={{ color: tokens.warm }} />
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
  cancelLink: { alignSelf: 'center' },
  error: { color: tokens.warm, marginTop: spacing.sm },
});

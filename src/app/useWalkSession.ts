import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { play } from '../feedback/sounds';
import { createWalkCueTracker } from '../feedback/walkCues';
import { AppState, Walk } from '../types';
import { getInitialLocation, requestLocationPermission, startWatchingLocation, stopWatchingLocation } from '../utils/gps';
import { cellKey, MIN_CELLS_FOR_REWARD } from '../utils/grid';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { log } from '../utils/log';
import { t } from '../i18n';
import { AppRepositories } from './repositories';
import { finishTrackedWalk, WalkRewardsOutcome } from './finishTrackedWalk';
import { appendLocation, applyLocationToCues, createWalkCueState, startWalkCueState } from './walkSessionHelpers';

export interface UseWalkSessionDeps {
  repos: AppRepositories;
  dogName: string | null;
  /** The idle map's Home Range render should refresh. */
  onRangeChanged: () => void;
  /** A finished walk earned rewards (treats/level changed, celebration to show). */
  onRewards: (outcome: WalkRewardsOutcome) => void;
}

/** The tracked-walk lifecycle: start, GPS fixes, finish, cancel/reset. One walk in flight at a time. */
export function useWalkSession({ repos, dogName, onRangeChanged, onRewards }: UseWalkSessionDeps) {
  const { homeRangeRepository, walkRepository, notificationRepository } = repos;
  const [appState, setAppState] = useState<AppState>({ walk: null, isTracking: false, error: null });

  // Refs, not state: nothing renders from them.
  const startingRef = useRef(false);
  const startTokenRef = useRef(0);
  const cueTracker = useRef(createWalkCueTracker({ now: Date.now, minCells: MIN_CELLS_FOR_REWARD })).current;
  const walkCueState = useRef(createWalkCueState()).current;

  const setError = useCallback((error: string | null) => setAppState((prev) => ({ ...prev, error })), []);

  const startWalk = async () => {
    // Double-tap guard + cancel guard: cancelWalk bumps startTokenRef, so any
    // async step below that resumes after a cancel bails out.
    if (startingRef.current) return;
    startingRef.current = true;
    const token = ++startTokenRef.current;
    const cancelled = () => startTokenRef.current !== token;
    try {
      let initialLoc = await getInitialLocation();
      if (!initialLoc) {
        // Permission may simply not have been granted yet: ask once, then retry.
        await requestLocationPermission();
        initialLoc = await getInitialLocation();
      }
      if (cancelled()) return;
      if (!initialLoc) {
        Alert.alert(t('app.errorTitle'), t('app.noInitialLocation'));
        return;
      }

      const newWalk: Walk = {
        id: Date.now().toString(),
        startTime: Date.now(),
        locations: [initialLoc],
        closed: false,
        startSource: 'button',
      };

      // Cue bookkeeping: snapshot the Home Range so "new ground" means new
      // before this walk, exactly like finishTrackedWalk's newGroundCells. The
      // snapshot loads in the background (null until then, so no new-street
      // dings) and never delays the watcher.
      cueTracker.reset();
      startWalkCueState(walkCueState, initialLoc);

      // Start watching location first (foreground-service-backed, gps.ts manages the subscription internally)
      await startWatchingLocation((location) => {
        // Audio cues only (never visual); sounds.play() also checks the sound pref.
        const cue = applyLocationToCues(walkCueState, location, cueTracker);
        if (cue) play(cue);
        setAppState((prev) => appendLocation(prev, location));
      });
      if (cancelled()) {
        // cancelWalk ran while the watcher was starting; it may have stopped nothing yet.
        await stopWatchingLocation();
        return;
      }

      homeRangeRepository
        .getCells()
        .then((rangeCells) => {
          if (!cancelled() && walkCueState.active) walkCueState.range = new Set(rangeCells.map((c) => cellKey(c.ix, c.iy)));
        })
        .catch((err) => log('WALK_CUE_RANGE_ERROR', { error: String(err) }));

      log('WALK_START', { id: newWalk.id, lat: initialLoc.latitude, lon: initialLoc.longitude });

      setAppState((prev) => ({ ...prev, walk: newWalk, isTracking: true }));

      // Replan reminders so one doesn't fire mid-walk (the walk isn't in the
      // repository until it finishes, so pass it in explicitly).
      checkAndScheduleWalkReminder({ walkRepository, notificationRepository }, Date.now(), [newWalk]).catch((err) =>
        log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
      );
    } finally {
      if (startTokenRef.current === token) startingRef.current = false;
    }
  };

  const finishWalk = async () => {
    await stopWatchingLocation();

    if (!appState.walk) {
      setAppState((prev) => ({ ...prev, isTracking: false }));
      return;
    }

    await finishTrackedWalk(appState.walk, {
      repos,
      dogName,
      onFinishCue: (qualifies) => {
        walkCueState.active = false;
        return cueTracker.onFinish(qualifies);
      },
      playCue: play,
      onWalkFinished: (finishedWalk) => setAppState((prev) => ({ ...prev, walk: finishedWalk, isTracking: false })),
      onRangeChanged,
      onRewards,
    });
  };

  const cancelWalk = async () => {
    startTokenRef.current++; // cancels a startWalk still in its async steps
    startingRef.current = false;
    walkCueState.active = false;
    cueTracker.reset();
    await stopWatchingLocation();
    if (appState.walk) {
      log('WALK_CANCELLED', { id: appState.walk.id, points: appState.walk.locations.length });
    }
    setAppState({ walk: null, isTracking: false, error: null });
  };

  return {
    walk: appState.walk,
    isTracking: appState.isTracking,
    error: appState.error,
    setError,
    startWalk,
    finishWalk,
    cancelWalk,
    /** Clear a finished walk for the next one (same reset as cancel). */
    newWalk: cancelWalk,
  };
}

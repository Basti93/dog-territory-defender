import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { play } from '../feedback/sounds';
import { createWalkCueTracker } from '../feedback/walkCues';
import { AppState, Walk } from '../types';
import { getInitialLocation, requestLocationPermission, startWatchingLocation, stopWatchingLocation } from '../utils/gps';
import { cellKey, MIN_CELLS_FOR_REWARD } from '../utils/grid';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { log } from '../utils/log';
import { newClientId } from '../sync/ids';
import { t } from '../i18n';
import { AppRepositories } from './repositories';
import { finishTrackedWalk, FinishTrackedWalkDeps, WalkRewardsOutcome } from './finishTrackedWalk';
import {
  AUTO_FINISH_TICK_MS,
  AutoFinishDecision,
  AutoFinishState,
  evaluateAutoFinish,
  homeCountdownMinutes,
  startAutoFinish,
  WalkEndedBy,
} from './autoFinish';
import { notifyAutoFinishedIfBackgrounded } from './autoFinishNotify';
import { applyLocationToCues, createWalkCueState, startWalkCueState } from './walkSessionHelpers';

export interface UseWalkSessionDeps {
  repos: AppRepositories;
  dogName: string | null;
  /** The idle map's Home Range render should refresh. */
  onRangeChanged: () => void;
  /** A finished walk earned rewards (treats/level changed, celebration to show). */
  onRewards: (outcome: WalkRewardsOutcome) => void;
  /** Household sync: forwarded to finishTrackedWalk. Optional. */
  sync?: FinishTrackedWalkDeps['sync'];
}

/** The tracked-walk lifecycle: start, GPS fixes, finish, cancel/reset. One walk in flight at a time. */
export function useWalkSession({ repos, dogName, onRangeChanged, onRewards, sync }: UseWalkSessionDeps) {
  const { homeRangeRepository, walkRepository, notificationRepository } = repos;
  const [appState, setAppState] = useState<AppState>({ walk: null, isTracking: false, error: null });

  // Refs, not state: nothing renders from them.
  // Single source of truth for the walk's locations: the GPS callback appends here
  // and finishWalk reads from here, never from a render-captured `appState.walk`.
  // React state mirrors it for rendering only.
  const walkRef = useRef<Walk | null>(null);
  const startingRef = useRef(false);
  const startTokenRef = useRef(0);
  const cueTracker = useRef(createWalkCueTracker({ now: Date.now, minCells: MIN_CELLS_FOR_REWARD })).current;
  const walkCueState = useRef(createWalkCueState()).current;

  // Auto-finish bookkeeping (autoFinish.ts). `finishRef` always points at the latest
  // render's finish so the GPS callback and the timer never use a stale dogName/repos.
  const autoFinishRef = useRef<AutoFinishState | null>(null);
  const finishingRef = useRef(false);
  const finishRef = useRef<(endedBy?: WalkEndedBy) => Promise<void>>(async () => undefined);
  const [autoFinishEnabled, setAutoFinishEnabled] = useState(false);
  const [homeCountdownMin, setHomeCountdownMin] = useState<number | null>(null);

  /** Run one evaluation (fix or timer tick); finishes the walk when the rules say so. */
  const runAutoFinish = (fix: { latitude: number; longitude: number } | null) => {
    const current = autoFinishRef.current;
    if (!current || !walkRef.current || finishingRef.current) return;
    const now = Date.now();
    const result = evaluateAutoFinish(current, fix, now);
    autoFinishRef.current = result.state;
    setHomeCountdownMin(homeCountdownMinutes(result.state, now));
    if (result.decision) {
      const decision: AutoFinishDecision = result.decision;
      const endedBy: WalkEndedBy = decision === 'home' ? 'auto-home' : 'auto-still';
      log('WALK_AUTO_FINISH', { id: walkRef.current.id, decision });
      void finishRef.current(endedBy);
    }
  };
  const runAutoFinishRef = useRef(runAutoFinish);
  runAutoFinishRef.current = runAutoFinish;

  // Timer tick: GPS may stop delivering while the phone lies still.
  useEffect(() => {
    if (!appState.isTracking) return;
    const timer = setInterval(() => runAutoFinishRef.current(null), AUTO_FINISH_TICK_MS);
    return () => clearInterval(timer);
  }, [appState.isTracking]);

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
        id: newClientId(), // UUID: two phones in one household must never collide (multiplayer-sync)
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
      walkRef.current = newWalk; // before the watcher, so no early fix is dropped
      finishingRef.current = false;
      const autoEnabled = await Promise.resolve()
        .then(() => repos.settingsRepository.getAutoFinishEnabled())
        .catch(() => true);
      autoFinishRef.current = startAutoFinish(initialLoc, newWalk.startTime, autoEnabled);
      setAutoFinishEnabled(autoEnabled);
      setHomeCountdownMin(null);
      let fixCount = 0;
      const watching = await startWatchingLocation((location) => {
        fixCount++;
        if (fixCount % 10 === 0) log('WALK_FIX_APPENDED', { count: fixCount });
        // Audio cues only (never visual); sounds.play() also checks the sound pref.
        const cue = applyLocationToCues(walkCueState, location, cueTracker);
        if (cue) play(cue);
        const current = walkRef.current;
        if (!current) return;
        walkRef.current = { ...current, locations: [...current.locations, location] };
        const next = walkRef.current;
        setAppState((prev) => (prev.walk || prev.isTracking ? { ...prev, walk: next } : prev));
        runAutoFinishRef.current(location);
      });
      if (!watching) {
        // Previously swallowed: the walk then "tracked" with only its first point.
        log('WALK_WATCH_FAILED', { id: newWalk.id });
        setError(t('app.watchFailed'));
      }
      if (cancelled()) {
        // cancelWalk ran while the watcher was starting; it may have stopped nothing yet.
        walkRef.current = null;
        await stopWatchingLocation();
        return;
      }

      homeRangeRepository
        .getCells()
        .then((rangeCells) => {
          if (!cancelled() && walkCueState.active) walkCueState.range = new Set(rangeCells.map((c) => cellKey(c.ix, c.iy)));
        })
        .catch((err) => log('WALK_CUE_RANGE_ERROR', { error: String(err) }));

      const [fg, bg] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]).catch(
        () => [{ status: 'unknown' }, { status: 'unknown' }]
      );
      log('WALK_START', {
        id: newWalk.id,
        lat: initialLoc.latitude,
        lon: initialLoc.longitude,
        watching,
        foreground: fg.status,
        background: bg.status,
      });

      setAppState((prev) => ({ ...prev, walk: walkRef.current ?? newWalk, isTracking: true }));

      // Replan reminders so one doesn't fire mid-walk (the walk isn't in the
      // repository until it finishes, so pass it in explicitly).
      checkAndScheduleWalkReminder({ walkRepository, notificationRepository }, Date.now(), [newWalk]).catch((err) =>
        log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
      );
    } finally {
      if (startTokenRef.current === token) startingRef.current = false;
    }
  };

  const runFinish = async (endedBy?: WalkEndedBy) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    autoFinishRef.current = null;
    setHomeCountdownMin(null);
    await stopWatchingLocation();

    const walkToFinish = walkRef.current && endedBy ? { ...walkRef.current, endedBy } : walkRef.current;
    if (!walkToFinish) {
      setAppState((prev) => ({ ...prev, isTracking: false }));
      return;
    }
    log('WALK_FINISH', { id: walkToFinish.id, points: walkToFinish.locations.length });

    await finishTrackedWalk(walkToFinish, {
      repos,
      dogName,
      onFinishCue: (qualifies) => {
        walkCueState.active = false;
        return cueTracker.onFinish(qualifies);
      },
      playCue: play,
      onWalkFinished: (finishedWalk) => {
        walkRef.current = finishedWalk;
        setAppState((prev) => ({ ...prev, walk: finishedWalk, isTracking: false }));
      },
      onRangeChanged,
      onRewards,
      sync,
    });
    // Auto-finished while the app is not in front: say so (the celebration state is
    // already set, so the Homecoming plays on the next foreground).
    if (endedBy) void notifyAutoFinishedIfBackgrounded(dogName);
  };
  finishRef.current = runFinish;
  // Button handler: takes no arguments (onPress would pass the press event).
  const finishWalk = () => runFinish();

  const cancelWalk = async () => {
    startTokenRef.current++; // cancels a startWalk still in its async steps
    startingRef.current = false;
    walkCueState.active = false;
    cueTracker.reset();
    autoFinishRef.current = null;
    finishingRef.current = false;
    setHomeCountdownMin(null);
    await stopWatchingLocation();
    if (walkRef.current) {
      log('WALK_CANCELLED', { id: walkRef.current.id, points: walkRef.current.locations.length });
    }
    walkRef.current = null;
    setAppState({ walk: null, isTracking: false, error: null });
  };

  return {
    walk: appState.walk,
    isTracking: appState.isTracking,
    error: appState.error,
    setError,
    autoFinishEnabled,
    homeCountdownMin,
    startWalk,
    finishWalk,
    cancelWalk,
    /** Clear a finished walk for the next one (same reset as cancel). */
    newWalk: cancelWalk,
  };
}

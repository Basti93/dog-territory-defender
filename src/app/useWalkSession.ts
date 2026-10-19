import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState as RNAppState } from 'react-native';
import * as Location from 'expo-location';
import { play } from '../feedback/sounds';
import { createWalkCueTracker } from '../feedback/walkCues';
import { AppState, Location as WalkLocation, Walk } from '../types';
import { getInitialLocation, requestLocationPermission, startWatchingLocation, stopWatchingLocation } from '../utils/gps';
import { cellKey, MIN_CELLS_FOR_REWARD } from '../utils/grid';
import { walkHasMovement } from '../utils/geometry';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { log } from '../utils/log';
import { newClientId } from '../sync/ids';
import { PRESENCE_BEAT_MS, type PresenceSender } from '../sync/presenceSender';
import { t } from '../i18n';
import { AppRepositories } from './repositories';
import { finishTrackedWalk, FinishTrackedWalkDeps, WalkRewardsOutcome } from './finishTrackedWalk';
import {
  AUTO_FINISH_TICK_MS,
  AutoFinishDecision,
  GPS_GAP_NOTE_MS,
  AutoFinishState,
  evaluateAutoFinish,
  homeCountdownMinutes,
  startAutoFinish,
  WalkEndedBy,
} from './autoFinish';
import { notifyAutoFinishedIfBackgrounded } from './autoFinishNotify';
import { applyLocationToCues, createWalkCueState, resumeWalkCueState, startWalkCueState } from './walkSessionHelpers';
import type { ActiveWalkRecorder } from './activeWalkRecorder';
import { mergeNewerFixes } from './restoreWalk';

/** How long the GPS-gap note stays on the live map once the app is in front. */
const GPS_GAP_NOTE_SHOWN_MS = 20_000;

/** What `finishWalk` did: `saved` (the normal path), `discarded` (no movement: nothing stored, like a cancel), `ignored` (already finishing). */
export type FinishOutcome = 'saved' | 'discarded' | 'ignored';

export interface UseWalkSessionDeps {
  repos: AppRepositories;
  dogName: string | null;
  /** The idle map's Home Range render should refresh. */
  onRangeChanged: () => void;
  /** A finished walk earned rewards (treats/level changed, celebration to show). */
  onRewards: (outcome: WalkRewardsOutcome) => void;
  /** Household sync: forwarded to finishTrackedWalk. Optional. */
  sync?: FinishTrackedWalkDeps['sync'];
  /** Live presence for the household partner (M4): heartbeats while tracking. Optional; absent = nobody sees the walk live. */
  presence?: PresenceSender;
  /** Durable mirror of the walk in flight (see activeWalkRecorder.ts): lets a closed or killed app resume it. Optional; absent = the walk lives in memory only. */
  activeWalk?: ActiveWalkRecorder;
}

/** The tracked-walk lifecycle: start, GPS fixes, finish, cancel/reset. One walk in flight at a time. */
export function useWalkSession({ repos, dogName, onRangeChanged, onRewards, sync, presence, activeWalk }: UseWalkSessionDeps) {
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
  // True only while a finish is actually running (finishingRef also stays true after a finished walk until the next reset).
  // Cancel is refused then: a finish that already started saves the walk, so a late "Verwerfen" must not claim otherwise.
  const finishInFlightRef = useRef(false);
  const finishRef = useRef<(endedBy?: WalkEndedBy) => Promise<FinishOutcome>>(async () => 'ignored');
  const [autoFinishEnabled, setAutoFinishEnabled] = useState(false);
  const [homeCountdownMin, setHomeCountdownMin] = useState<number | null>(null);

  // GPS gap bookkeeping (autoFinish.ts GPS_GAP_MS): logged once per gap; a long one leaves a calm note for the live map.
  const gapLoggedRef = useRef(false);
  const [gpsGapNote, setGpsGapNote] = useState(false);
  const [appInFront, setAppInFront] = useState(RNAppState.currentState === 'active');
  /** The walk ended or was taken over: forget the gap state of the walk before. */
  const resetGapState = () => {
    gapLoggedRef.current = false;
    setGpsGapNote(false);
  };

  /** Run one evaluation (fix or timer tick); finishes the walk when the rules say so. */
  const runAutoFinish = (fix: { latitude: number; longitude: number; accuracy?: number } | null) => {
    const current = autoFinishRef.current;
    if (!current || !walkRef.current || finishingRef.current) return;
    const now = Date.now();
    const result = evaluateAutoFinish(current, fix, now);
    autoFinishRef.current = result.state;
    setHomeCountdownMin(homeCountdownMinutes(result.state, now));
    // Absence of fixes is never "standing still": the walk just runs on. Say so in the log, and on the map when it was long.
    const gapMs = result.gapMs ?? result.gapEndedMs;
    if (result.gapMs !== null && !gapLoggedRef.current) {
      gapLoggedRef.current = true;
      log('WALK_GPS_GAP', { id: walkRef.current.id, minutes: Math.round(result.gapMs / 60000) });
    }
    if (result.gapEndedMs !== null) {
      if (!gapLoggedRef.current) log('WALK_GPS_GAP', { id: walkRef.current.id, minutes: Math.round(result.gapEndedMs / 60000) });
      gapLoggedRef.current = false;
    }
    if (gapMs !== null && gapMs >= GPS_GAP_NOTE_MS) setGpsGapNote(true);
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

  // Coming back to the front after a freeze: judge the walk right away (a gap shows its note) instead of up to a minute later.
  // The note itself fades after a while once the app is in front.
  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', (next) => {
      setAppInFront(next === 'active');
      if (next === 'active') runAutoFinishRef.current(null);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!gpsGapNote || !appInFront) return;
    const timer = setTimeout(() => setGpsGapNote(false), GPS_GAP_NOTE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [gpsGapNote, appInFront]);

  // Heartbeat timer (foreground). The GPS callback below also ticks, which is what keeps beats going wherever that
  // callback runs JS in the background; the sender itself decides whether 30 s have passed.
  useEffect(() => {
    if (!appState.isTracking || !presence) return;
    const timer = setInterval(() => {
      const current = walkRef.current;
      if (current) presence.tick(current);
    }, PRESENCE_BEAT_MS);
    return () => clearInterval(timer);
  }, [appState.isTracking, presence]);

  const setError = useCallback((error: string | null) => setAppState((prev) => ({ ...prev, error })), []);

  /** Snapshot of the Home Range for the "new street" cues; loads in the background and never delays the watcher. */
  const loadCueRange = (cancelled: () => boolean) => {
    homeRangeRepository
      .getCells()
      .then((rangeCells) => {
        if (!cancelled() && walkCueState.active) walkCueState.range = new Set(rangeCells.map((c) => cellKey(c.ix, c.iy)));
      })
      .catch((err) => log('WALK_CUE_RANGE_ERROR', { error: String(err) }));
  };

  /** The callback for every fix the watcher delivers: cues, append to walkRef, presence, auto-finish. Used by start and resume. */
  const makeFixHandler = () => {
    let fixCount = 0;
    return (location: WalkLocation) => {
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
      presence?.tick(next);
      runAutoFinishRef.current(location);
    };
  };

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
      resetGapState();
      const autoEnabled = await Promise.resolve()
        .then(() => repos.settingsRepository.getAutoFinishEnabled())
        .catch(() => true);
      autoFinishRef.current = startAutoFinish(initialLoc, newWalk.startTime, autoEnabled);
      setAutoFinishEnabled(autoEnabled);
      setHomeCountdownMin(null);
      await activeWalk?.begin(newWalk); // before the watcher: the first stored fix must find the walk row
      const watching = await startWatchingLocation(makeFixHandler());
      if (!watching) {
        // Previously swallowed: the walk then "tracked" with only its first point.
        log('WALK_WATCH_FAILED', { id: newWalk.id });
        setError(t('app.watchFailed'));
      }
      if (cancelled()) {
        // cancelWalk ran while the watcher was starting; it may have stopped nothing yet.
        walkRef.current = null;
        await stopWatchingLocation();
        // begin() above may have stored the walk after cancelWalk's own clear: drop it, or a relaunch would "restore" a cancelled walk.
        void activeWalk?.end();
        return;
      }

      loadCueRange(cancelled);

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
      presence?.start(walkRef.current ?? newWalk);

      // Replan reminders so one doesn't fire mid-walk (the walk isn't in the
      // repository until it finishes, so pass it in explicitly).
      checkAndScheduleWalkReminder({ walkRepository, notificationRepository }, Date.now(), [newWalk]).catch((err) =>
        log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
      );
    } finally {
      if (startTokenRef.current === token) startingRef.current = false;
    }
  };

  const runFinish = async (endedBy?: WalkEndedBy): Promise<FinishOutcome> => {
    if (finishingRef.current) return 'ignored';
    finishInFlightRef.current = true;
    try {
      return await runFinishSteps(endedBy);
    } finally {
      finishInFlightRef.current = false;
    }
  };

  const runFinishSteps = async (endedBy?: WalkEndedBy): Promise<FinishOutcome> => {
    finishingRef.current = true;
    autoFinishRef.current = null;
    setHomeCountdownMin(null);
    resetGapState();
    await stopWatchingLocation();

    const walkToFinish = walkRef.current && endedBy ? { ...walkRef.current, endedBy } : walkRef.current;
    if (!walkToFinish) {
      setAppState((prev) => ({ ...prev, isTracking: false }));
      void activeWalk?.end();
      return 'saved';
    }
    // No movement (walkHasMovement): nothing is saved, rewarded or uploaded. Closed like a cancel, for the Finish button
    // as well as auto-finish and restore, so a walk that went nowhere never leaves a record.
    if (!walkHasMovement(walkToFinish)) {
      log('WALK_DISCARDED_NO_MOVEMENT', { id: walkToFinish.id, points: walkToFinish.locations.length, endedBy: endedBy ?? 'button' });
      walkCueState.active = false;
      cueTracker.reset();
      finishingRef.current = false;
      walkRef.current = null;
      void presence?.end(walkToFinish);
      void activeWalk?.end();
      setAppState({ walk: null, isTracking: false, error: null });
      return 'discarded';
    }
    log('WALK_FINISH', { id: walkToFinish.id, points: walkToFinish.locations.length });

    try {
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
      // The walk is saved: the durable mirror has done its job. (Not cleared if finishing threw: a relaunch retries.)
      await activeWalk?.end();
    } finally {
      // After the upload was queued, so the partner's phone usually finds the walk right when presence ends.
      void presence?.end(walkToFinish);
    }
    // Auto-finished while the app is not in front: say so (the celebration state is
    // already set, so the Homecoming plays on the next foreground).
    if (endedBy) void notifyAutoFinishedIfBackgrounded(dogName);
    return 'saved';
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
    resetGapState();
    await stopWatchingLocation();
    if (walkRef.current) {
      void presence?.end(walkRef.current);
      log('WALK_CANCELLED', { id: walkRef.current.id, points: walkRef.current.locations.length });
    }
    walkRef.current = null;
    void activeWalk?.end();
    setAppState({ walk: null, isTracking: false, error: null });
  };

  /**
   * Cold-start restore: takes over a walk that was in flight when the app went away (useWalkRestore decides that).
   * Same state as before the interruption: its points, start time, mode, auto-finish progress. Returns false, doing
   * nothing, when a walk is already running or starting, so a double launch can never create a second walk.
   */
  const resumeWalk = async (restored: Walk, autoFinish: AutoFinishState): Promise<boolean> => {
    if (walkRef.current || startingRef.current || restored.locations.length === 0) return false;
    startingRef.current = true;
    const token = ++startTokenRef.current;
    const cancelled = () => startTokenRef.current !== token;
    try {
      walkRef.current = restored;
      finishingRef.current = false;
      cueTracker.reset();
      resumeWalkCueState(walkCueState, restored.locations);
      cueTracker.onCells(walkCueState.painted.size, 0); // already-reached milestones must not ding again
      autoFinishRef.current = autoFinish;
      resetGapState();
      setAutoFinishEnabled(autoFinish.enabled);
      setHomeCountdownMin(homeCountdownMinutes(autoFinish, Date.now()));

      // (Re)starts the location task: restarting a running one is harmless, and it re-attaches this session's callback.
      const watching = await startWatchingLocation(makeFixHandler());
      if (!watching) {
        log('WALK_WATCH_FAILED', { id: restored.id });
        setError(t('app.watchFailed'));
      }
      if (cancelled() || !walkRef.current) return false;

      // Fixes that landed in the stored copy while this session was still starting (headless runtime) are not in memory yet.
      const stored = await activeWalk?.load().catch(() => null);
      if (stored && stored.meta.id === restored.id && walkRef.current) {
        walkRef.current = mergeNewerFixes(walkRef.current, stored.locations, restored.locations[restored.locations.length - 1].timestamp);
      }
      const resumed = walkRef.current;
      if (cancelled() || !resumed) return false;
      loadCueRange(cancelled);
      setAppState((prev) => ({ ...prev, walk: resumed, isTracking: true }));
      presence?.start(resumed);
      // A walk restored after a long silence: judge it now, so the GPS-gap note is there when the player looks.
      runAutoFinishRef.current(null);
      return true;
    } finally {
      if (startTokenRef.current === token) startingRef.current = false;
    }
  };

  /**
   * Cold-start restore of a walk that is over (stale, or the auto-finish rules say so): the normal finish path
   * (stops the task, saves once, rewards once, celebration), then the session is reset for the next walk.
   */
  const finishRestoredWalk = async (restored: Walk, endedBy: WalkEndedBy): Promise<boolean> => {
    if (walkRef.current || startingRef.current) return false;
    walkRef.current = restored;
    walkCueState.active = false;
    finishingRef.current = false;
    try {
      await runFinish(endedBy);
    } finally {
      walkRef.current = null;
      setAppState({ walk: null, isTracking: false, error: null });
    }
    return true;
  };

  return {
    walk: appState.walk,
    isTracking: appState.isTracking,
    error: appState.error,
    setError,
    autoFinishEnabled,
    homeCountdownMin,
    /** The walk's GPS went quiet for a long while (battery saver, frozen app): the live map says it is still on. */
    gpsGapNote,
    startWalk,
    finishWalk,
    cancelWalk,
    resumeWalk,
    finishRestoredWalk,
    /** True while a walk is running, starting, or finishing: restore must not touch the session then. */
    isBusy: () => !!walkRef.current || startingRef.current,
    /** A finish (button, auto-finish or restore) is running right now: a cancel must not race it. */
    isFinishing: () => finishInFlightRef.current,
    /** Has the walk in flight gone anywhere (walkHasMovement)? Read from the live ref, so a Cancel tap never judges a stale render. False without a walk. */
    currentWalkHasMovement: () => !!walkRef.current && walkHasMovement(walkRef.current),
    /** Clear a finished walk for the next one (same reset as cancel). */
    newWalk: cancelWalk,
  };
}

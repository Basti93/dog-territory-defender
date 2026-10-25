import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState as RNAppState } from 'react-native';
import * as Location from 'expo-location';
import { play } from '../feedback/sounds';
import { createWalkCueTracker } from '../feedback/walkCues';
import { AppState, Location as WalkLocation, Walk } from '../types';
import { isStaleFix } from '../utils/startFix';
import { getInitialLocation, requestLocationPermission, startWatchingLocation, stopWatchingLocation } from '../utils/gps';
import { cellKey, MIN_CELLS_FOR_REWARD, PAINT_MAX_ACCURACY_M } from '../utils/grid';
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
  GPS_GAP_MS,
  startAutoFinish,
  trimStillTail,
  WalkEndedBy,
} from './autoFinish';
import { notifyAutoFinishedIfBackgrounded } from './autoFinishNotify';
import { applyLocationToCues, createWalkCueState, resumeWalkCueState, startWalkCueState } from './walkSessionHelpers';
import type { ActiveWalkRecorder } from './activeWalkRecorder';
import { mergeNewerFixes } from './restoreWalk';
import { appendStoredFixes } from './storedFixes';
import { withTimeout } from '../utils/withTimeout';

/** How long the GPS-gap note stays on the live map once the app is in front. */
const GPS_GAP_NOTE_SHOWN_MS = 20_000;
/** Reading the stored fixes may take this long at most (see syncStoredFixes). */
export const STORE_SYNC_TIMEOUT_MS = 10_000;

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
  // Token of the start/resume that last started the location task. A start that was cancelled must not stop or restart the
  // task once a newer start owns it (cancel resets startingRef, so a new start can run while the old one still awaits).
  const taskOwnerRef = useRef(0);
  const cueTracker = useRef(createWalkCueTracker({ now: Date.now, minCells: MIN_CELLS_FOR_REWARD })).current;
  const walkCueState = useRef(createWalkCueState()).current;

  // Auto-finish bookkeeping (autoFinish.ts). `finishRef` always points at the latest
  // render's finish so the GPS callback and the timer never use a stale dogName/repos.
  const autoFinishRef = useRef<AutoFinishState | null>(null);
  const finishingRef = useRef(false);
  // True only while a finish is actually running (finishingRef also stays true after a finished walk until the next reset).
  // Cancel is refused then: a finish that already started saves the walk, so a late "Verwerfen" must not claim otherwise.
  const finishInFlightRef = useRef(false);
  const finishRef = useRef<(endedBy?: WalkEndedBy, trimAfter?: number) => Promise<FinishOutcome>>(async () => 'ignored');
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
  // `now` is the moment the fix counts as arrived: the wall clock for live fixes, the fix's own timestamp when fixes the
  // background task stored are replayed (so a gap or a still stretch is measured on the phone's real timeline).
  const runAutoFinish = (fix: { latitude: number; longitude: number; accuracy?: number } | null, now: number = Date.now()) => {
    const current = autoFinishRef.current;
    if (!current || !walkRef.current || finishingRef.current) return;
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

  /**
   * Fixes the location task stored while this JS side saw nothing (another runtime, a frozen app) are in the active-walk
   * store, not in memory. Takes them over and replays them through the auto-finish rules on their own timestamps, so the
   * gap log is true and "still" works while backgrounded. Only looks when memory has been quiet for a GPS gap (or on
   * coming back to the front), because the load reads the whole stored walk.
   */
  const syncStoredFixes = async (force: boolean) => {
    const current = walkRef.current;
    const auto = autoFinishRef.current;
    if (!activeWalk || !current || !auto || finishingRef.current) return;
    if (!force && Date.now() - auto.lastFixAt < GPS_GAP_MS) return;
    try {
      // Bounded: a store that never answers must not hold back the auto-finish decision that follows in the tick.
      const snapshot = await withTimeout(activeWalk.load(), STORE_SYNC_TIMEOUT_MS, 'stored fixes');
      const latest = walkRef.current;
      if (!snapshot || !latest || snapshot.meta.id !== latest.id || finishingRef.current) return;
      const { walk: merged, added } = appendStoredFixes(latest, snapshot.locations);
      if (added.length === 0) return;
      walkRef.current = merged;
      setAppState((prev) => (prev.walk || prev.isTracking ? { ...prev, walk: merged } : prev));
      log('WALK_FIXES_FROM_STORE', { id: merged.id, count: added.length });
      // Only fixes newer than what auto-finish has already seen are replayed; older ones (a live fix arrived while the
      // store was being read) just join the trail.
      const seenUntil = autoFinishRef.current?.lastFixAt ?? Number.POSITIVE_INFINITY;
      for (const fix of added.filter((f) => f.timestamp > seenUntil)) {
        walkCueState.last = fix.accuracy <= PAINT_MAX_ACCURACY_M ? fix : walkCueState.last;
        runAutoFinishRef.current(fix, fix.timestamp);
        if (finishingRef.current) return;
      }
    } catch (error) {
      log('WALK_STORE_SYNC_ERROR', { error: String(error) });
    }
  };
  const tickRef = useRef(async (force: boolean) => {
    await syncStoredFixes(force);
    runAutoFinishRef.current(null);
  });
  tickRef.current = async (force: boolean) => {
    await syncStoredFixes(force);
    runAutoFinishRef.current(null);
  };

  // Timer tick: GPS may stop delivering while the phone lies still.
  useEffect(() => {
    if (!appState.isTracking) return;
    const timer = setInterval(() => void tickRef.current(false), AUTO_FINISH_TICK_MS);
    return () => clearInterval(timer);
  }, [appState.isTracking]);

  // Coming back to the front after a freeze: judge the walk right away (a gap shows its note) instead of up to a minute later.
  // The note itself fades after a while once the app is in front.
  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', (next) => {
      setAppInFront(next === 'active');
      if (next === 'active') void tickRef.current(true);
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
      // The start point itself was stale or rough (iOS hands out a cached position): the first real fix replaces it,
      // so the walk never opens with a jump from where the phone was some minutes ago.
      if (current.locations.length === 1 && isStaleFix(current.locations[0], current.startTime) && !isStaleFix(location, current.startTime)) {
        const fresh = { ...current, locations: [location] };
        walkRef.current = fresh;
        const enabled = autoFinishRef.current?.enabled ?? true;
        autoFinishRef.current = startAutoFinish(location, current.startTime, enabled);
        const range = walkCueState.range;
        startWalkCueState(walkCueState, location);
        walkCueState.range = range;
        void activeWalk?.begin(fresh);
        log('WALK_START_FIX_REPLACED', { id: current.id });
        setAppState((prev) => (prev.walk || prev.isTracking ? { ...prev, walk: fresh } : prev));
        return;
      }
      walkRef.current = { ...current, locations: [...current.locations, location] };
      const next = walkRef.current;
      setAppState((prev) => (prev.walk || prev.isTracking ? { ...prev, walk: next } : prev));
      presence?.tick(next);
      runAutoFinishRef.current(location);
    };
  };

  /** Resolves once the app is 'active' (max ~2 s): right after a system dialog it can still report 'inactive'. */
  const waitUntilActive = () =>
    new Promise<void>((resolve) => {
      if (RNAppState.currentState === 'active') return resolve();
      const done = () => {
        sub.remove();
        clearTimeout(timer);
        resolve();
      };
      const sub = RNAppState.addEventListener('change', (state) => state === 'active' && done());
      const timer = setTimeout(done, 2000);
    });

  const startWalk = async () => {
    // Double-tap guard + cancel guard: cancelWalk bumps startTokenRef, so any
    // async step below that resumes after a cancel bails out.
    if (startingRef.current) return;
    startingRef.current = true;
    const token = ++startTokenRef.current;
    const cancelled = () => startTokenRef.current !== token;
    try {
      // The location task (Android foreground service) starts FIRST, straight after the tap while the app is still in
      // front: a player who locks the phone during the seconds below would otherwise get "Foreground service cannot be
      // started when the application is in the background". Fixes that arrive before the walk exists are buffered.
      taskOwnerRef.current = token;
      const ownsTask = () => taskOwnerRef.current === token;
      // Forget a walk left in the store before the task delivers anything, so early fixes can never attach to an old walk id.
      void activeWalk?.end();
      const buffered: WalkLocation[] = [];
      let liveHandler: ((location: WalkLocation) => void) | null = null;
      const onFix = (location: WalkLocation) => (liveHandler ? liveHandler(location) : void buffered.push(location));
      const watchStart = startWatchingLocation(onFix, { fresh: true });
      let initialLoc = await getInitialLocation();
      let watching = await watchStart;
      if (!initialLoc) {
        // Permission may simply not have been granted yet: ask once, then retry both.
        await requestLocationPermission();
        await waitUntilActive(); // coming back from the permission dialog the app is briefly not 'active': do not defer then
        initialLoc = cancelled() ? null : await getInitialLocation();
        if (initialLoc && !watching && !cancelled() && ownsTask()) watching = await startWatchingLocation(onFix, { fresh: true });
      }
      if (cancelled()) {
        if (ownsTask()) await stopWatchingLocation(); // cancelWalk may have stopped before the task finished starting
        return;
      }
      if (!initialLoc) {
        await stopWatchingLocation();
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

      walkRef.current = newWalk;
      finishingRef.current = false;
      resetGapState();
      const autoEnabled = await Promise.resolve()
        .then(() => repos.settingsRepository.getAutoFinishEnabled())
        .catch(() => true);
      autoFinishRef.current = startAutoFinish(initialLoc, newWalk.startTime, autoEnabled);
      setAutoFinishEnabled(autoEnabled);
      setHomeCountdownMin(null);
      await activeWalk?.begin(newWalk); // the first stored fix must find the walk row
      if (!cancelled()) {
        // Hand over to the live handler in one synchronous step, so no fix slips between buffer and walk.
        const handler = makeFixHandler();
        const early = buffered.filter((f) => f.timestamp > initialLoc.timestamp);
        early.forEach((f) => activeWalk?.addFix(f)); // the recorder saw them before the walk row existed and ignored them
        early.forEach(handler);
        liveHandler = handler;
      }
      if (!watching) {
        // Previously swallowed: the walk then "tracked" with only its first point.
        log('WALK_WATCH_FAILED', { id: newWalk.id });
        setError(t('app.watchFailed'));
      }
      if (cancelled()) {
        // cancelWalk ran during the async steps; it may have stopped nothing yet.
        if (ownsTask()) {
          walkRef.current = null;
          await stopWatchingLocation();
        }
        // begin() above may have stored the walk after cancelWalk's own clear: drop it, or a relaunch would "restore" a cancelled walk.
        if (ownsTask()) void activeWalk?.end();
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
    } catch (error) {
      // begin/startAutoFinish threw: no half-started walk with a running task.
      if (taskOwnerRef.current === token && !cancelled()) {
        walkRef.current = null;
        await stopWatchingLocation().catch(() => undefined);
      }
      throw error;
    } finally {
      if (startTokenRef.current === token) startingRef.current = false;
    }
  };

  const runFinish = async (endedBy?: WalkEndedBy, trimAfter?: number): Promise<FinishOutcome> => {
    if (finishingRef.current) return 'ignored';
    finishInFlightRef.current = true;
    try {
      return await runFinishSteps(endedBy, trimAfter);
    } finally {
      finishInFlightRef.current = false;
    }
  };

  const runFinishSteps = async (endedBy?: WalkEndedBy, trimAfter?: number): Promise<FinishOutcome> => {
    finishingRef.current = true;
    // "Still" ends a walk at the moment it stopped moving: the idle tail (up to 20 min and more) is not part of it.
    const stillSince = endedBy === 'auto-still' ? (trimAfter ?? autoFinishRef.current?.anchorAt) : undefined;
    autoFinishRef.current = null;
    setHomeCountdownMin(null);
    resetGapState();
    await stopWatchingLocation();

    const endedWalk = walkRef.current && endedBy ? { ...walkRef.current, endedBy } : walkRef.current;
    const walkToFinish = endedWalk && stillSince !== undefined ? trimStillTail(endedWalk, stillSince) : endedWalk;
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
      taskOwnerRef.current = token;
      walkRef.current = restored;
      finishingRef.current = false;
      cueTracker.reset();
      resumeWalkCueState(walkCueState, restored.locations);
      cueTracker.onCells(walkCueState.painted.size, 0); // already-reached milestones must not ding again
      autoFinishRef.current = autoFinish;
      resetGapState();
      setAutoFinishEnabled(autoFinish.enabled);
      setHomeCountdownMin(homeCountdownMinutes(autoFinish, Date.now()));

      // Re-attaches this session's callback; starts the location task only if it is not already running (and defers it when in the background).
      const watching = await startWatchingLocation(makeFixHandler(), { resume: true });
      if (!watching) {
        log('WALK_WATCH_FAILED', { id: restored.id });
        setError(t('app.watchFailed'));
      }
      if (cancelled() || !walkRef.current) return false;

      // Fixes that landed in the stored copy while this session was still starting (headless runtime) are not in memory yet.
      const stored = activeWalk ? await withTimeout(activeWalk.load(), STORE_SYNC_TIMEOUT_MS, 'stored walk').catch(() => null) : null;
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
  const finishRestoredWalk = async (restored: Walk, endedBy: WalkEndedBy, trimAfter?: number): Promise<boolean> => {
    if (walkRef.current || startingRef.current) return false;
    walkRef.current = restored;
    walkCueState.active = false;
    finishingRef.current = false;
    try {
      await runFinish(endedBy, trimAfter);
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

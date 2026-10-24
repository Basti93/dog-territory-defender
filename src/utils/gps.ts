import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { Location as LocationType } from '../types';
import { log } from './log';
import { t } from '../i18n';
import { isStaleFix, STALE_FIX_MS } from './startFix';
import { scheduleInfoNotification } from '../notifications/scheduler';

const LOCATION_TASK_NAME = 'dog-territory-location-task';

// Fixes worse than this are dropped before they ever reach the app. 50 m (was 30 m): a phone in a trouser pocket reports
// 30-50 m most of the time, and 30 m threw away most of a pocket walk. Everything but painting accepts them: trail,
// distance, movement and auto-finish. The Home Range paints only from fixes within PAINT_MAX_ACCURACY_M (utils/grid.ts,
// 30 m, the old threshold), so the map ground stays as precise as before. See docs/decisions/2026-08-22-gps-accuracy-aware-closure.md.
export const MAX_ACCEPTABLE_ACCURACY_M = 50;
/** A fix that reports no accuracy at all counts as the old limit: it is kept and may paint, as before. */
const UNKNOWN_ACCURACY_M = 30;

let currentSubscriber: ((location: LocationType) => void) | null = null;

/**
 * Errors from expo modules are often objects, not Error instances: String(error) then logs "[object Object]".
 * Message first, plus code/name when there are any.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return code !== undefined ? `${error.name}[${String(code)}]: ${error.message}` : `${error.name}: ${error.message}`;
  }
  if (error && typeof error === 'object') {
    const { message, code, name } = error as { message?: unknown; code?: unknown; name?: unknown };
    const parts = [name, code !== undefined ? `[${String(code)}]` : null, message].filter((p) => p !== undefined && p !== null);
    if (parts.length > 0) return parts.join(' ');
    try {
      return JSON.stringify(error).slice(0, 300);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

// Android only lets a foreground service start while the app is in front. A walk started from the background (restore
// after a headless relaunch, a late tap on a notification) must not die on that: the start stays pending, the walk goes
// on, and the next time the app comes to the front the task is started again.
let startPending = false;
let appStateSubscription: { remove: () => void } | null = null;
const DEFERRED_START_MAX_TRIES = 3;
/** The exact expo-location refusal (Android): "Foreground service cannot be started when the application is in the background". */
const FOREGROUND_SERVICE_BACKGROUND_ERROR = /foreground service cannot be started/i;

export function isBackgroundStartError(error: unknown): boolean {
  return FOREGROUND_SERVICE_BACKGROUND_ERROR.test(describeError(error));
}

// Foreground fallback: if the background task cannot start (or delivers
// nothing), a plain watchPositionAsync keeps the walk tracked while the app is
// open. Both sources feed deliver(), which drops duplicate timestamps.
const FALLBACK_AFTER_MS = 15000;
let fallbackSubscription: Location.LocationSubscription | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
let lastDeliveredTimestamp = 0;
// When this runtime started the task (0 in a headless runtime that never did: nothing is judged stale there).
let watchStartedAt = 0;
// Only the start of a FRESH walk drops cached positions, and only until its first accepted fix. A resumed walk keeps every
// fix (the OS buffers fixes from the suspended period; they belong to the walk and must reach the recorder).
let staleFilterActive = false;

// Live sharing (sync/presenceSender.ts) listens here, NOT through the walk session: the task callback below runs in
// the app's own JS runtime even with the screen off, so every accepted fix reaches the observer synchronously, with no
// React in between. Registered once at startup by app/syncRuntime.ts.
let fixObserver: ((location: LocationType) => void) | null = null;

export function setFixObserver(observer: ((location: LocationType) => void) | null): void {
  fixObserver = observer;
}

// The durable copy of the walk (app/activeWalkRecorder.ts). Same reasoning as the observer above: it must be fed here,
// where fixes land even with no UI (screen off, app swiped away, runtime relaunched headless by the OS), so a later
// app launch can resume the walk. Registered once at startup by app/activeWalkRuntime.ts.
let fixRecorder: ((location: LocationType) => void) | null = null;

export function setFixRecorder(recorder: ((location: LocationType) => void) | null): void {
  fixRecorder = recorder;
}

function deliver(raw: LocationType): void {
  // iOS reports fractional milliseconds (1792359406662.5527). Whole ms from here on: storage, cells, sync and the
  // server's bigint columns all assume integers. Rounding happens before the duplicate check, so two fixes less than
  // 1 ms apart collapse into one (the second is dropped), and a zero time step can never reach the distance rule.
  const location = { ...raw, timestamp: Math.round(raw.timestamp) };
  if (location.timestamp <= lastDeliveredTimestamp) return;
  if (staleFilterActive) {
    if (location.timestamp < watchStartedAt - STALE_FIX_MS) {
      log('GPS_FIX_STALE', { ageSec: Math.round((watchStartedAt - location.timestamp) / 1000) });
      return;
    }
    staleFilterActive = false;
  }
  lastDeliveredTimestamp = location.timestamp;
  try {
    fixRecorder?.(location);
  } catch (error) {
    log('GPS_RECORDER_ERROR', { error: describeError(error) });
  }
  try {
    fixObserver?.(location);
  } catch (error) {
    log('GPS_OBSERVER_ERROR', { error: describeError(error) });
  }
  currentSubscriber?.(location);
}

async function startForegroundFallback(reason: string): Promise<boolean> {
  if (fallbackSubscription || !currentSubscriber) return !!fallbackSubscription;
  // A plain watcher cannot keep a walk going in the pocket, and the task is the real source on Android: never start a
  // second source from the background there (it would only race the task's own delivery and restart).
  if (Platform.OS === 'android' && AppState.currentState !== 'active') {
    log('GPS_FALLBACK_SKIPPED', { reason, why: 'android-background' });
    return false;
  }
  try {
    fallbackSubscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 2 },
      (position) => {
        const accuracy = position.coords.accuracy ?? UNKNOWN_ACCURACY_M;
        if (!isAccurateEnough(accuracy)) return;
        deliver(toLocationType(position));
      }
    );
    log('GPS_FALLBACK_STARTED', { reason });
    return true;
  } catch (error) {
    log('GPS_FALLBACK_ERROR', { error: describeError(error) });
    return false;
  }
}

function stopForegroundFallback(): void {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
  fallbackSubscription?.remove();
  fallbackSubscription = null;
}

export function isAccurateEnough(accuracy: number): boolean {
  return accuracy <= MAX_ACCEPTABLE_ACCURACY_M;
}

function toLocationType(position: Location.LocationObject): LocationType {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    timestamp: position.timestamp,
    accuracy: position.coords.accuracy ?? UNKNOWN_ACCURACY_M,
  };
}

// Registered once at module load — required so the task is known even if it
// fires while the app was relaunched headlessly by the OS.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    log('GPS_TASK_ERROR', { error: describeError(error) });
    return;
  }
  const { locations } = data as { locations: Location.LocationObject[] };
  locations.forEach((position) => {
    const accuracy = position.coords.accuracy ?? UNKNOWN_ACCURACY_M;
    if (!isAccurateEnough(accuracy)) {
      log('GPS_FIX_REJECTED', { accuracy, lat: position.coords.latitude, lon: position.coords.longitude });
      return;
    }
    log('GPS_UPDATE', {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy,
      gpsTimestamp: position.timestamp,
    });
    deliver(toLocationType(position));
    // The task works: the foreground fallback is not needed.
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = null;
  });
});

// Android 13+ (API 33+) requires this before any notification can render,
// including the foreground-service notification startWatchingLocation posts —
// without it, the service still runs but silently shows no notification.
async function requestNotificationPermissionIfNeeded(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  log('GPS_NOTIFICATION_PERMISSION', { result });
}

export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const bg = await Location.requestBackgroundPermissionsAsync();
      log('GPS_PERMISSION', { foreground: status, background: bg.status });
      await requestNotificationPermissionIfNeeded();
      return true;
    }
    log('GPS_PERMISSION', { foreground: status, background: 'not-requested' });
    return false;
  } catch (error) {
    console.error('Location permission error:', error);
    log('GPS_PERMISSION_ERROR', { error: String(error) });
    return false;
  }
}

/**
 * Starts a foreground-service-backed location task (Android) — this is what
 * keeps GPS accuracy from being throttled while backgrounded, unlike a plain
 * watchPositionAsync subscription. Callers keep the same callback-based API;
 * the task-manager plumbing is entirely internal.
 */
export async function startWatchingLocation(
  callback: (location: LocationType) => void,
  options: { fresh?: boolean; resume?: boolean } = {}
): Promise<boolean> {
  currentSubscriber = callback;
  lastDeliveredTimestamp = 0;
  watchStartedAt = Date.now();
  staleFilterActive = options.fresh === true;
  clearDeferredStart();
  stopForegroundFallback();
  try {
    // Resuming a walk whose task survived: the callback is re-attached. On Android in front the task is still started
    // again: after a headless restart it runs WITHOUT its foreground service (2026-10-19), and a restart brings it back.
    // From the background only the callback is re-attached; the service restart waits for the front (no "open the app" note).
    if (options.resume && (await isTaskRunning())) {
      if (Platform.OS === 'android' && AppState.currentState === 'active') {
        log('GPS_WATCH_RESTART_FOR_SERVICE');
      } else {
        log('GPS_WATCH_REATTACHED');
        if (Platform.OS === 'android') deferStartUntilFront(false);
        fallbackTimer = setTimeout(() => void startForegroundFallback('task-silent'), FALLBACK_AFTER_MS);
        return true;
      }
    }
    // Android would refuse the foreground service right now: do not make the doomed call, wait for the front instead.
    if (Platform.OS === 'android' && AppState.currentState !== 'active') {
      deferStartUntilFront();
      fallbackTimer = setTimeout(() => void startForegroundFallback('task-silent'), FALLBACK_AFTER_MS);
      return true;
    }
    await startLocationTask();
    // Safety net: if the task delivers no accepted fix soon, also watch in the foreground.
    fallbackTimer = setTimeout(() => void startForegroundFallback('task-silent'), FALLBACK_AFTER_MS);
    return true;
  } catch (error) {
    console.error('Error watching location:', error);
    log('GPS_WATCH_ERROR', { error: describeError(error), appState: AppState.currentState });
    if (Platform.OS === 'android' && AppState.currentState !== 'active' && isBackgroundStartError(error)) {
      // Not a failure of the walk: keep it, retry when the app is in front, and ask (once, calmly) to open the app.
      deferStartUntilFront();
      // If the task cannot start for good, the plain watcher still covers the time the app is open.
      fallbackTimer = setTimeout(() => void startForegroundFallback('task-silent'), FALLBACK_AFTER_MS);
      return true;
    }
    const ok = await startForegroundFallback('task-start-failed');
    if (!ok) currentSubscriber = null;
    return ok;
  }
}

async function isTaskRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

async function startLocationTask(): Promise<void> {
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 1000,
    distanceInterval: 2,
    // iOS only (ignored on Android): keep updates flowing with the screen off, as a walk (not "other"), and show
    // the system's blue background-location pill. Without pausesUpdatesAutomatically:false iOS stops the task
    // when the dog stands still for a while and the partner's thread silently freezes.
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Tails Up',
      notificationBody: t('gps.trackingBody'),
      notificationColor: '#2ECC71',
      // Android: the service (and with it the process) stays up when the player swipes the app away from the recents.
      killServiceOnDestroy: false,
    },
  });
  log('GPS_WATCH_STARTED');
  await logForegroundServiceState();
}

function clearDeferredStart(): void {
  startPending = false;
  appStateSubscription?.remove();
  appStateSubscription = null;
}

function deferStartUntilFront(notify = true): void {
  clearDeferredStart();
  startPending = true;
  log('GPS_WATCH_DEFERRED', { why: 'android-background-start' });
  if (notify) void notifyOpenApp();
  let tries = 0;
  let starting = false;
  const tryStart = () => {
    if (!startPending || !currentSubscriber || starting || AppState.currentState !== 'active') return;
    starting = true;
    tries++;
    startLocationTask()
      .then(() => {
        log('GPS_WATCH_RESUMED_IN_FRONT', { tries });
        clearDeferredStart();
      })
      .catch((error) => {
        log('GPS_WATCH_ERROR', { error: describeError(error), appState: AppState.currentState, retry: tries });
        starting = false;
        if (tries >= DEFERRED_START_MAX_TRIES) {
          clearDeferredStart();
          void startForegroundFallback('deferred-start-failed');
        }
      });
  };
  appStateSubscription = AppState.addEventListener('change', tryStart);
  tryStart(); // the app may have come to the front while the first start was failing
}

async function notifyOpenApp(): Promise<void> {
  try {
    await scheduleInfoNotification('Tails Up', t('gps.needsFrontBody'));
  } catch (error) {
    log('GPS_OPEN_APP_NOTIFY_ERROR', { error: describeError(error) });
  }
}

/**
 * GPS_FG_SERVICE: did the Android foreground service (what keeps the process alive in the pocket) get its chance to start?
 * expo-location only starts it while the app is in front ("Foreground location task cannot be started while the app is in
 * the background!"), and it never starts it for a task re-created headless after the OS killed the process. There is no
 * JS API for the service itself, so `started` is registration plus "app was in front"; the real check is
 * `adb shell dumpsys activity services com.dogtd.mobile` (isForeground=true).
 */
async function logForegroundServiceState(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const registered = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    const appState = AppState.currentState;
    log('GPS_FG_SERVICE', { started: registered && appState === 'active', registered, appState });
  } catch (error) {
    log('GPS_FG_SERVICE', { started: false, error: String(error) });
  }
}

export async function stopWatchingLocation(): Promise<void> {
  currentSubscriber = null;
  clearDeferredStart();
  stopForegroundFallback();
  const isRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    log('GPS_WATCH_STOPPED');
  }
}

export async function getInitialLocation(): Promise<LocationType | null> {
  try {
    let position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    // iOS may answer with a cached position (all iPhone walks showed a ~200 m jump after the first fix). Ask once more.
    if ((isStaleFix(toLocationType(position), Date.now()) || (position.coords.accuracy ?? 0) > MAX_ACCEPTABLE_ACCURACY_M)) {
      log('GPS_INITIAL_FIX_STALE', { ageSec: Math.round((Date.now() - position.timestamp) / 1000), accuracy: position.coords.accuracy ?? null });
      position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    }
    log('GPS_INITIAL_FIX', { lat: position.coords.latitude, lon: position.coords.longitude });
    return toLocationType(position);
  } catch (error) {
    console.error('Error getting initial location:', error);
    log('GPS_INITIAL_FIX_ERROR', { error: describeError(error) });
    return null;
  }
}

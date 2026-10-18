// Sends the heartbeats of a walk in progress (M4 "Alex im Hof"): the new GPS points since the last accepted beat,
// about every 30 s, and a closing `ended` beat. Strictly ephemeral and best effort: never in the sync outbox, never
// persisted, no retry of a missed beat (the next one simply carries the points again, the server dedups by time).
// The only retry is the closing beat, once, because a stuck sign is the one visible mistake; the server also closes
// presence when the finished walk is uploaded, and the viewer drops anything silent for 3 minutes.
//
// Two feeders, ONE cadence owner (this object: `lastAttemptAt` + `inFlight`): `addFix` is called by the GPS layer for
// every accepted fix, inside the expo-location task callback, so beats keep going with the app in the background (iOS
// "Always", Android foreground service); `tick(walk)` is the walk session's foreground timer / GPS callback and only
// merges anything newer, then asks the same cadence question, so it can never double a beat. The task callback runs in
// the app's own JS runtime (gps.ts delivers through module state), so the buffer below is plain memory. If the OS
// kills the process, the next launch resumes the walk (app/restoreWalk.ts) and calls `start` again with all stored
// points; the sign stays up meanwhile and the viewer drops it after 3 minutes of silence.
//
// Nothing is sent unless the player switched "Runde live teilen" on (`isEnabled`, asked at most every few seconds, so
// a switch flipped mid-walk takes effect quickly; flipping it off closes the sign at once). Without a household
// (not joined) it does nothing at all.

import type { SyncIdentity } from '../storage/SettingsRepository';
import type { Location } from '../types';
import { log } from '../utils/log';
import { ApiClient, ApiError, createApiClient } from './apiClient';
import { API_LIMITS, type PresencePoint } from './apiContract';

export const PRESENCE_BEAT_MS = 30_000;
const END_RETRY_MS = 4_000;
/** How long an answer of `isEnabled` is trusted. Short, so a flipped switch or a fresh "Ja, gern" acts within seconds. */
const ENABLED_RECHECK_MS = 5_000;
/** Unsent points kept in memory; a very long outage drops the oldest (the sign only needs the recent path). */
const MAX_BUFFERED_POINTS = 5_000;

/** The slice of a walk the sender reads. */
export interface PresenceWalk {
  id: string;
  startTime: number;
  locations: Location[];
}

export interface PresenceSender {
  /** A tracked walk began: sends the first beat at once. */
  start(walk: PresenceWalk): void;
  /** An accepted GPS fix arrived (from the location task, background included): buffers it and beats when 30 s have passed. Cheap to call often; ignored without a started walk. */
  addFix(location: Location): void;
  /** The foreground timer or GPS callback fired: merges fixes the buffer lacks, then beats when 30 s have passed. Cheap to call often. */
  tick(walk: PresenceWalk): void;
  /** "Runde live teilen" was just answered or flipped: forget the cached answer and beat at once if it is on now. */
  optInChanged(): void;
  /** The walk is over (finished or cancelled): sends the closing beat with the final points. Safe to call twice or without start. */
  end(walk: PresenceWalk): Promise<void>;
}

export interface PresenceSenderDeps {
  getIdentity: () => Promise<SyncIdentity | null>;
  /** "Runde live teilen" (SettingsRepository.getLiveShareEnabled). Required on purpose: a sender wired without the opt-in must not compile. */
  isEnabled: () => Promise<boolean>;
  /** True while the app is not in front; only labels the PRESENCE_SENT log line. */
  isBackground?: () => boolean;
  /** Injected in tests. */
  createClient?: (baseUrl: string, token: string) => ApiClient;
  now?: () => number;
  intervalMs?: number;
  /** Injected in tests so the closing retry needs no real timer. */
  sleep?: (ms: number) => Promise<void>;
}

interface Session {
  walkId: string;
  startedAt: number;
  /** Points not yet accepted by the server, oldest first. */
  pending: PresencePoint[];
  /** Timestamp of the newest point ever buffered; fixes from the other feeder with an older or equal time are duplicates. */
  lastPointAt: number;
  lastAttemptAt: number;
  /** At least one beat was accepted: the partner may be seeing a sign that must be closed. */
  hasSent: boolean;
  /** The sign was closed (ended beat sent, or switched off mid-walk): no more beats for this walk. */
  stopped: boolean;
  enabledCache: { value: boolean; at: number } | null;
  inFlight: Promise<void> | null;
  /** Resolves to the client, or null when this phone is not in a household / lost its token. */
  client: Promise<ApiClient | null>;
  disabled: boolean;
}

const toPoint = (l: Location): PresencePoint => ({ lat: l.latitude, lon: l.longitude, t: l.timestamp });

/** At most `max` points, evenly thinned, always keeping the newest. A long gap without signal must not blow the request limit. */
export function thinPoints(points: PresencePoint[], max: number): PresencePoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

export function createPresenceSender(deps: PresenceSenderDeps): PresenceSender {
  const now = deps.now ?? Date.now;
  const intervalMs = deps.intervalMs ?? PRESENCE_BEAT_MS;
  const makeClient = deps.createClient ?? ((baseUrl, token) => createApiClient({ baseUrl, token }));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let session: Session | null = null;

  async function isOn(s: Session, force = false): Promise<boolean> {
    const cached = s.enabledCache;
    if (!force && cached && now() - cached.at < ENABLED_RECHECK_MS) return cached.value;
    const value = await deps.isEnabled().catch(() => false); // unreadable setting = not allowed
    s.enabledCache = { value, at: now() };
    return value;
  }

  function absorb(s: Session, locations: Location[]): void {
    // Fixes arrive in time order, so only the tail can be new: scan back to the first known one instead of the whole walk.
    let from = locations.length;
    while (from > 0 && locations[from - 1].timestamp > s.lastPointAt) from--;
    for (let i = from; i < locations.length; i++) {
      s.lastPointAt = locations[i].timestamp;
      s.pending.push(toPoint(locations[i]));
    }
    if (s.pending.length > MAX_BUFFERED_POINTS) s.pending.splice(0, s.pending.length - MAX_BUFFERED_POINTS);
  }

  async function sendBeat(s: Session, ended: boolean): Promise<boolean> {
    const client = await s.client;
    if (!client || s.disabled || s.stopped) return false;
    // Opt-in gate. Switched off after a sign went up: close it once, then stay quiet for the rest of the walk.
    if (!(await isOn(s, ended))) {
      s.lastAttemptAt = Number.NEGATIVE_INFINITY; // asking again later is free; the first beat after "yes" should go out at once
      if (!s.hasSent) return false;
      ended = true;
    }
    const sentCount = s.pending.length;
    const points = thinPoints(s.pending.slice(0, sentCount), API_LIMITS.maxPresencePointsPerBeat);
    try {
      await client.sendPresence({ walkId: s.walkId, startedAt: s.startedAt, points, ...(ended ? { ended: true } : {}) });
      s.pending.splice(0, sentCount);
      s.hasSent = true;
      if (ended) s.stopped = true;
      log('PRESENCE_SENT', { points: points.length, ended, background: deps.isBackground?.() ?? false });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'unauthorized') s.disabled = true;
      log('PRESENCE_SEND_FAILED', { error: err instanceof ApiError ? err.message : String(err), ended });
      return false;
    }
  }

  function beat(s: Session): void {
    if (s.inFlight || s.disabled || s.stopped) return;
    s.lastAttemptAt = now();
    s.inFlight = sendBeat(s, false).then(() => {
      s.inFlight = null;
    });
  }

  /** The one cadence question both feeders ask. */
  function maybeBeat(s: Session): void {
    if (s.disabled || s.stopped) return;
    if (s.enabledCache && !s.enabledCache.value && now() - s.enabledCache.at < ENABLED_RECHECK_MS) return; // opted out: no work per fix
    if (now() - s.lastAttemptAt < intervalMs) return;
    beat(s);
  }

  return {
    start(walk) {
      const s: Session = {
        walkId: walk.id,
        startedAt: walk.startTime,
        pending: [],
        lastPointAt: 0,
        lastAttemptAt: 0,
        hasSent: false,
        stopped: false,
        enabledCache: null,
        inFlight: null,
        client: deps.getIdentity().then(
          (identity) => (identity ? makeClient(identity.serverUrl, identity.token) : null),
          () => null
        ),
        disabled: false,
      };
      session = s;
      absorb(s, walk.locations);
      beat(s);
    },

    addFix(location) {
      const s = session;
      if (!s) return;
      absorb(s, [location]);
      maybeBeat(s);
    },

    tick(walk) {
      const s = session;
      if (!s || s.walkId !== walk.id) return;
      absorb(s, walk.locations);
      maybeBeat(s);
    },

    optInChanged() {
      const s = session;
      if (!s) return;
      s.enabledCache = null;
      maybeBeat(s);
    },

    async end(walk) {
      const s = session;
      if (!s || s.walkId !== walk.id) return;
      session = null;
      absorb(s, walk.locations);
      // The closing beat must come after any beat still on its way; it carries the points the last beat missed.
      await s.inFlight;
      if (s.disabled || s.stopped || !(await s.client)) return;
      // Never switched on and nothing went up: there is no sign to close, and nothing may be sent.
      if (!s.hasSent && !(await isOn(s, true))) return;
      if (await sendBeat(s, true)) return;
      if (s.disabled || s.stopped) return;
      await sleep(END_RETRY_MS);
      await sendBeat(s, true);
    },
  };
}

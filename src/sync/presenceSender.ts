// Sends the heartbeats of a walk in progress (M4 "Alex im Hof"): the new GPS points since the last accepted beat,
// about every 30 s, and a closing `ended` beat. Strictly ephemeral and best effort: never in the sync outbox, never
// persisted, no retry of a missed beat (the next one simply carries the points again, the server dedups by time).
// The only retry is the closing beat, once, because a stuck sign is the one visible mistake; the server also closes
// presence when the finished walk is uploaded, and the viewer drops anything silent for 3 minutes.
//
// Called from the walk session on every GPS fix and from its foreground timer, so it also runs wherever the GPS
// callback runs JS (Android foreground service). Without a household (not joined) it does nothing at all.

import type { SyncIdentity } from '../storage/SettingsRepository';
import type { Location } from '../types';
import { log } from '../utils/log';
import { ApiClient, ApiError, createApiClient } from './apiClient';
import { API_LIMITS, type PresencePoint } from './apiContract';

export const PRESENCE_BEAT_MS = 30_000;
const END_RETRY_MS = 4_000;

/** The slice of a walk the sender reads. */
export interface PresenceWalk {
  id: string;
  startTime: number;
  locations: Location[];
}

export interface PresenceSender {
  /** A tracked walk began: sends the first beat at once. */
  start(walk: PresenceWalk): void;
  /** A GPS fix arrived or the timer fired: sends when 30 s have passed since the last beat. Cheap to call often. */
  tick(walk: PresenceWalk): void;
  /** The walk is over (finished or cancelled): sends the closing beat with the final points. Safe to call twice or without start. */
  end(walk: PresenceWalk): Promise<void>;
}

export interface PresenceSenderDeps {
  getIdentity: () => Promise<SyncIdentity | null>;
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
  /** Index into the walk's locations of the first point not yet accepted by the server. */
  sentIndex: number;
  lastAttemptAt: number;
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

  async function sendBeat(s: Session, walk: PresenceWalk, ended: boolean): Promise<boolean> {
    const client = await s.client;
    if (!client || s.disabled) return false;
    const upTo = walk.locations.length;
    const points = thinPoints(walk.locations.slice(s.sentIndex, upTo).map(toPoint), API_LIMITS.maxPresencePointsPerBeat);
    try {
      await client.sendPresence({ walkId: s.walkId, startedAt: s.startedAt, points, ...(ended ? { ended: true } : {}) });
      s.sentIndex = upTo;
      log('PRESENCE_SENT', { points: points.length, ended });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'unauthorized') s.disabled = true;
      log('PRESENCE_SEND_FAILED', { error: err instanceof ApiError ? err.message : String(err), ended });
      return false;
    }
  }

  function beat(s: Session, walk: PresenceWalk): void {
    if (s.inFlight || s.disabled) return;
    s.lastAttemptAt = now();
    s.inFlight = sendBeat(s, walk, false).then(() => {
      s.inFlight = null;
    });
  }

  return {
    start(walk) {
      const s: Session = {
        walkId: walk.id,
        startedAt: walk.startTime,
        sentIndex: 0,
        lastAttemptAt: 0,
        inFlight: null,
        client: deps.getIdentity().then(
          (identity) => (identity ? makeClient(identity.serverUrl, identity.token) : null),
          () => null
        ),
        disabled: false,
      };
      session = s;
      beat(s, walk);
    },

    tick(walk) {
      const s = session;
      if (!s || s.walkId !== walk.id || s.disabled) return;
      if (now() - s.lastAttemptAt < intervalMs) return;
      beat(s, walk);
    },

    async end(walk) {
      const s = session;
      if (!s || s.walkId !== walk.id) return;
      session = null;
      // The closing beat must come after any beat still on its way; it carries the points the last beat missed.
      await s.inFlight;
      if (s.disabled || !(await s.client)) return;
      if (await sendBeat(s, walk, true)) return;
      if (s.disabled) return;
      await sleep(END_RETRY_MS);
      await sendBeat(s, walk, true);
    },
  };
}

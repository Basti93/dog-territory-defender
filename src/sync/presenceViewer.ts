// The foreground presence poller (M4 "Alex im Hof"): while the app is in front and this phone is in a household,
// one long-poll loop (`GET /v1/presence?after=<rev>&wait=25`) keeps the partner store current. It stops the moment the
// app leaves the foreground (no background work, no new native dependency). A long-poll counts once against the
// device's request budget, so this is about 2-3 requests a minute, not a busy poll.
//
// When a partner walk disappears from the answer (the walk ended or was uploaded) the viewer tells `onWalkEnded`, which
// is how the mini homecoming learns that Alex and Buddy are on their way home.

import type { SyncIdentity } from '../storage/SettingsRepository';
import { log } from '../utils/log';
import { ApiClient, ApiError, createApiClient, LONG_POLL_GRACE_MS } from './apiClient';
import type { PresenceResponse } from './apiContract';
import { API_LIMITS } from './apiContract';
import { clearPartnerPresence, getPartnerPresence, isPresenceFresh, setPartnerPresence } from './presenceStore';

export interface EndedPartnerWalk {
  walkId: string;
  playerId: string;
  name: string;
}

export interface PresenceViewer {
  /** Starts the loop (no-op when already running). */
  start(): void;
  /** Stops the loop and aborts a long-poll in flight; clears the store (a stale sign must not greet the next foreground). */
  stop(): void;
}

export interface PresenceViewerDeps {
  getIdentity: () => Promise<SyncIdentity | null>;
  onWalkEnded?: (walk: EndedPartnerWalk) => void;
  /** Injected in tests. */
  createClient?: (baseUrl: string, token: string) => ApiClient;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const ERROR_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000];
/** A server without the presence route (older build) answers 404: ask again only now and then. */
const UNSUPPORTED_BACKOFF_MS = 5 * 60_000;
/** A long-poll that returns this fast without a change is the server's capped-waiters pause or a hiccup: don't spin. */
const TOO_FAST_MS = 300;
const TOO_FAST_PAUSE_MS = 2_000;

const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });

export function createPresenceViewer(deps: PresenceViewerDeps): PresenceViewer {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? abortableSleep;
  const makeClient =
    deps.createClient ?? ((baseUrl, token) => createApiClient({ baseUrl, token, timeoutMs: API_LIMITS.maxEventWaitSeconds * 1000 + LONG_POLL_GRACE_MS }));
  let controller: AbortController | null = null;

  function apply(response: PresenceResponse) {
    const before = getPartnerPresence();
    setPartnerPresence(response.presence, response.serverTime, now());
    const stillThere = new Set(response.presence.map((e) => e.walkId));
    const hadAny = before.some((e) => isPresenceFresh(e, now()));
    if (!hadAny && response.presence.length > 0) log('PRESENCE_VIEW_STARTED', { walks: response.presence.length });
    for (const gone of before) {
      if (!stillThere.has(gone.walkId)) deps.onWalkEnded?.({ walkId: gone.walkId, playerId: gone.playerId, name: gone.name });
    }
  }

  async function loop(mine: AbortController) {
    const identity = await deps.getIdentity().catch(() => null);
    if (!identity || mine.signal.aborted) return;
    const client = makeClient(identity.serverUrl, identity.token);
    let after: number | undefined;
    let failures = 0;
    while (!mine.signal.aborted) {
      const startedAt = now();
      try {
        const response = await client.presence({ after, waitSeconds: after === undefined ? 0 : API_LIMITS.maxEventWaitSeconds, signal: mine.signal });
        if (mine.signal.aborted) return;
        failures = 0;
        const unchanged = after !== undefined && response.rev === after;
        apply(response);
        after = response.rev;
        if (unchanged && now() - startedAt < TOO_FAST_MS) await sleep(TOO_FAST_PAUSE_MS, mine.signal);
      } catch (err) {
        if (mine.signal.aborted) return;
        if (err instanceof ApiError && err.kind === 'unauthorized') {
          log('PRESENCE_VIEW_STOPPED', { reason: 'unauthorized' });
          return;
        }
        const unsupported = err instanceof ApiError && (err.status === 404 || err.kind === 'upgrade-required');
        const wait = unsupported ? UNSUPPORTED_BACKOFF_MS : ERROR_BACKOFF_MS[Math.min(failures, ERROR_BACKOFF_MS.length - 1)];
        failures++;
        await sleep(wait, mine.signal);
      }
    }
  }

  return {
    start() {
      if (controller) return;
      const mine = new AbortController();
      controller = mine;
      void loop(mine).finally(() => {
        if (controller === mine) controller = null;
      });
    },
    stop() {
      controller?.abort();
      controller = null;
      clearPartnerPresence();
    },
  };
}

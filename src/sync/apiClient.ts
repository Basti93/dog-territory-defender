// Thin typed fetch wrapper for the household API (multiplayer-sync). Plain
// fetch, bearer token, per-request timeout, and typed errors so the sync
// engine can tell "retry later" (network/timeout/server) from "give up"
// (client) from "token revoked" (unauthorized).

import {
  API_HEADERS,
  API_LEVEL,
  API_PATHS,
  ApiError as ApiErrorBody,
  ApiMyStats,
  ApiWalkFull,
  CommandRequest,
  CommandResponse,
  CoopWeekResponse,
  GiftsResponse,
  NearbyResponse,
  PresenceResponse,
  PresenceUpdateRequest,
  PresenceUpdateResponse,
  giftOpenPath,
  EventsResponse,
  ImportRequest,
  ImportResponse,
  JoinRequest,
  JoinResponse,
  LogUploadRequest,
  LogUploadResponse,
  SnapshotResponse,
  WalkUploadRequest,
  WalkUploadResponse,
} from './apiContract';

/** `upgrade-required` = HTTP 426: the server wants a newer app for writes. Not retryable by itself; the outbox keeps the item. */
export type ApiErrorKind = 'network' | 'timeout' | 'unauthorized' | 'upgrade-required' | 'client' | 'server';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** Machine-readable code from the server body (`{ error: '...' }`), when present. */
  readonly code: string | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }

  /** Worth trying again later: the request itself was fine. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server';
  }
}

export const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiClientOptions {
  baseUrl: string;
  token?: string | null;
  timeoutMs?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  join(request: JoinRequest): Promise<JoinResponse>;
  snapshot(): Promise<SnapshotResponse>;
  /** Plain poll (long-poll `wait` is off in v1). */
  events(after: number): Promise<EventsResponse>;
  uploadWalk(request: WalkUploadRequest): Promise<WalkUploadResponse>;
  getWalk(id: string): Promise<ApiWalkFull>;
  command(request: CommandRequest): Promise<CommandResponse>;
  importHousehold(request: ImportRequest): Promise<ImportResponse>;
  /** Neighbour dogs with their dotted Ranges (`[]` while the server has neighbours off). */
  nearby(): Promise<NearbyResponse>;
  gifts(): Promise<GiftsResponse>;
  openGift(giftId: string, clientId: string): Promise<CommandResponse>;
  coopWeek(): Promise<CoopWeekResponse>;
  /** Uploads the FULL personal stats; the answer is the server's merged state. A 404 (`client` error) means the server predates this. */
  putMyStats(request: ApiMyStats): Promise<ApiMyStats>;
  /** Device diagnostics batch (log shipping). */
  uploadLogs(request: LogUploadRequest): Promise<LogUploadResponse>;
  /** Live-walk heartbeat (M4). Ephemeral: callers never queue or retry it. */
  sendPresence(request: PresenceUpdateRequest): Promise<PresenceUpdateResponse>;
  /**
   * The other household members' walks in progress. With `after` (the last `rev`) and `waitSeconds > 0` the server parks
   * the call until something changes (long-poll, <= 25 s). `signal` cancels it (app went to the background).
   */
  presence(options?: { after?: number; waitSeconds?: number; signal?: AbortSignal }): Promise<PresenceResponse>;
}

/** A long-poll must outlive the server's wait: this much extra before the client gives up. */
export const LONG_POLL_GRACE_MS = 10_000;

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? fetch;

  async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, extra: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, extra.timeoutMs ?? timeoutMs);
    const onOuterAbort = () => controller.abort();
    if (extra.signal?.aborted) controller.abort();
    else extra.signal?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      const headers: Record<string, string> = { Accept: 'application/json', [API_HEADERS.clientLevel]: String(API_LEVEL) };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        if (timedOut) throw new ApiError('timeout', `Request timed out after ${extra.timeoutMs ?? timeoutMs} ms`);
        throw new ApiError('network', String(err));
      }

      if (!response.ok) {
        let code: string | null = null;
        try {
          const parsed = (await response.json()) as Partial<ApiErrorBody>;
          if (parsed && typeof parsed.error === 'string') code = parsed.reason ? `${parsed.error}:${parsed.reason}` : parsed.error;
        } catch {
          // body is optional
        }
        const message = `HTTP ${response.status}${code ? ` ${code}` : ''}`;
        if (response.status === 401) throw new ApiError('unauthorized', message, response.status, code);
        if (response.status === 426) throw new ApiError('upgrade-required', message, response.status, code);
        // 408/425/429 are "try again later" even though they are 4xx.
        if (response.status >= 500 || response.status === 408 || response.status === 425 || response.status === 429) {
          throw new ApiError('server', message, response.status, code);
        }
        throw new ApiError('client', message, response.status, code);
      }
      try {
        return (await response.json()) as T;
      } catch {
        throw new ApiError('server', 'Response was not valid JSON', response.status);
      }
    } finally {
      clearTimeout(timer);
      extra.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  return {
    join: (req) => request<JoinResponse>('POST', API_PATHS.join, req),
    snapshot: () => request<SnapshotResponse>('GET', API_PATHS.snapshot),
    events: (after) => request<EventsResponse>('GET', `${API_PATHS.events}?after=${encodeURIComponent(String(after))}`),
    uploadWalk: (req) => request<WalkUploadResponse>('POST', API_PATHS.walks, req),
    getWalk: (id) => request<ApiWalkFull>('GET', `${API_PATHS.walks}/${encodeURIComponent(id)}`),
    command: (req) => request<CommandResponse>('POST', API_PATHS.commands, req),
    importHousehold: (req) => request<ImportResponse>('POST', API_PATHS.import, req),
    nearby: () => request<NearbyResponse>('GET', `${API_PATHS.nearby}?include=cells`),
    gifts: () => request<GiftsResponse>('GET', API_PATHS.gifts),
    openGift: (giftId, clientId) => request<CommandResponse>('POST', giftOpenPath(giftId), { clientId }),
    coopWeek: () => request<CoopWeekResponse>('GET', API_PATHS.coopWeek),
    putMyStats: (req) => request<ApiMyStats>('PUT', API_PATHS.meStats, req),
    uploadLogs: (req) => request<LogUploadResponse>('POST', API_PATHS.logs, req),
    sendPresence: (req) => request<PresenceUpdateResponse>('POST', API_PATHS.presence, req),
    presence: ({ after, waitSeconds = 0, signal } = {}) => {
      const query = [after !== undefined ? `after=${after}` : null, waitSeconds > 0 ? `wait=${waitSeconds}` : null].filter(Boolean).join('&');
      return request<PresenceResponse>('GET', `${API_PATHS.presence}${query ? `?${query}` : ''}`, undefined, {
        timeoutMs: waitSeconds > 0 ? waitSeconds * 1000 + LONG_POLL_GRACE_MS : undefined,
        signal,
      });
    },
  };
}

// Thin typed fetch wrapper for the household API (multiplayer-sync). Plain
// fetch, bearer token, per-request timeout, and typed errors so the sync
// engine can tell "retry later" (network/timeout/server) from "give up"
// (client) from "token revoked" (unauthorized).

import {
  API_PATHS,
  ApiError as ApiErrorBody,
  ApiWalkFull,
  CommandRequest,
  CommandResponse,
  CoopWeekResponse,
  GiftsResponse,
  NearbyResponse,
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

export type ApiErrorKind = 'network' | 'timeout' | 'unauthorized' | 'client' | 'server';

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
  /** Device diagnostics batch (log shipping). */
  uploadLogs(request: LogUploadRequest): Promise<LogUploadResponse>;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? fetch;

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
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
        if (timedOut) throw new ApiError('timeout', `Request timed out after ${timeoutMs} ms`);
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
    uploadLogs: (req) => request<LogUploadResponse>('POST', API_PATHS.logs, req),
  };
}

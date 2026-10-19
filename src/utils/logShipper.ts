// Ships the app's structured log (see log.ts) to the household server so the owner can read device logs over ssh.
// Design: every log() call lands in a small in-memory ring buffer (after redaction); a flush POSTs unsent entries to
// /v1/logs. Cheap on purpose: nothing is persisted here (the local Debug Log is the durable copy), at most one
// request per minute, only while joined to a household and the Settings switch is on.
//
// Must NOT import log.ts (log.ts imports this file) and must never call log() itself.

import { ApiError } from '../sync/apiClient';
import type { ApiLogEntry, LogUploadRequest } from '../sync/apiContract';
import type { SyncIdentity } from '../storage/SettingsRepository';

export const SHIPPER_LIMITS = {
  /** Unsent entries kept in memory; the oldest are dropped first. */
  maxBuffered: 500,
  /** Serialized size of one entry (UTF-8 bytes); bigger ones are dropped. Mirrors API_LIMITS.maxLogEntryBytes. */
  maxEntryBytes: 2048,
  /** Pending entries that trigger a flush. */
  flushThreshold: 25,
  /** Minimum time between two flush attempts. */
  minIntervalMs: 60_000,
  /** Pause after a failed send (network, 429, 5xx, 401). */
  failureBackoffMs: 5 * 60_000,
  /** Serialized batch size; the server limit is 64 KB, this leaves headroom. */
  maxBatchBytes: 60 * 1024,
  maxBatchEntries: 200,
} as const;

/**
 * Per-fix events are shipped 1 in N only (the local Debug Log keeps every line). The server refuses a device more than
 * 2000 rows per rolling 24 h; at one GPS_UPDATE per second that was used up within the first walk of the day and every
 * later log (WALK_*, GPS_GAP, RESTORE) was refused until the next morning.
 */
export const SAMPLED_EVENTS: Record<string, number> = { GPS_UPDATE: 20, GPS_FIX_REJECTED: 10 };

// ------------------------------------------------------------------ redaction

/** Keys that never leave the phone, at any depth (compared lowercase). Raw positions and secrets. */
const DROP_KEYS = new Set([
  'lat', 'lon', 'lng', 'latitude', 'longitude', 'locations', 'location', 'coords', 'coordinate', 'coordinates',
  'position', 'route', 'polyline', 'raw', 'address', 'home',
  'token', 'authorization', 'invite', 'invitecode', 'code', 'password', 'secret', 'backup', 'backupjson',
]);
const MAX_DEPTH = 5;
const MAX_ARRAY = 20;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/g;
const COORD_PAIR = /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g;

function dropKey(key: string): boolean {
  const k = key.toLowerCase();
  return DROP_KEYS.has(k) || k.includes('token') || k.includes('secret') || k.includes('authorization');
}

function scrubString(value: string): string {
  return value.replace(BEARER, 'Bearer [redacted]').replace(COORD_PAIR, '[coords]');
}

function scrubValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message) };
  if (depth >= MAX_DEPTH) return '[deep]';
  if (Array.isArray(value)) {
    return value.length > MAX_ARRAY ? `[${value.length} items]` : value.map((v) => scrubValue(v, depth + 1));
  }
  if (typeof value === 'object') return scrubObject(value as Record<string, unknown>, depth + 1);
  return undefined; // functions, symbols, undefined
}

function scrubObject(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (dropKey(key)) continue;
    const scrubbed = scrubValue(value, depth);
    if (scrubbed !== undefined) out[key] = scrubbed;
  }
  return out;
}

/**
 * The payload that may leave the phone for this event. Rules, in short: no secrets (tokens, invite codes, backup data),
 * no raw positions (lat/lon/locations/routes are removed everywhere, so GPS_UPDATE keeps accuracy and timestamps,
 * WALK_* keeps ids and counts, TREATS_* keeps its numbers), and free text is scrubbed of bearer tokens and coordinate pairs.
 */
export function redact(event: string, payload: Record<string, unknown>): Record<string, unknown> {
  if (/BACKUP/i.test(event)) {
    // Never ship backup content: keep only plain numbers and flags (sizes, counts, ok/failed).
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (!dropKey(key) && (typeof value === 'number' || typeof value === 'boolean')) out[key] = value;
    }
    return out;
  }
  return scrubObject(payload, 0);
}

// ------------------------------------------------------------------ shipper

function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4; // surrogate pair
      i++;
    } else bytes += 3;
  }
  return bytes;
}

interface BufferedEntry {
  seq: number;
  bytes: number;
  entry: ApiLogEntry;
}

export interface LogShipperDeps {
  now(): number;
  /** The joined household identity, or null when this phone is not in a household. */
  getIdentity(): Promise<SyncIdentity | null>;
  /** The Settings switch. */
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
  /** POSTs one batch; throws ApiError on failure. */
  send(identity: SyncIdentity, request: LogUploadRequest): Promise<void>;
  /** Sequence number of the first entry. The default is time based so numbers keep rising across app restarts. */
  initialSeq?: number;
}

export interface LogShipper {
  /** Redacts and buffers one entry. Never throws. Triggers a flush at flushThreshold pending entries. */
  append(event: string, payload: Record<string, unknown>, appState: string): void;
  /** Sends pending entries if allowed (joined, switch on, minimum interval). Never throws. */
  flush(): Promise<void>;
  pendingCount(): number;
  /** In-memory: resets when the app restarts. */
  getLastSentAt(): number | null;
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

export function createLogShipper(deps: LogShipperDeps): LogShipper {
  const L = SHIPPER_LIMITS;
  // ms * 1000 stays below 2^53 until the year 2255 and always exceeds the numbers of an earlier app run.
  let nextSeq = deps.initialSeq ?? deps.now() * 1000;
  let buffer: BufferedEntry[] = [];
  let sending = false;
  let nextAllowedAt = 0;
  let lastSentAt: number | null = null;
  const sampledCounts = new Map<string, number>();

  function takeBatch(): BufferedEntry[] {
    const batch: BufferedEntry[] = [];
    let bytes = 64; // envelope
    for (const item of buffer) {
      if (batch.length >= L.maxBatchEntries) break;
      if (batch.length > 0 && bytes + item.bytes + 1 > L.maxBatchBytes) break;
      batch.push(item);
      bytes += item.bytes + 1;
    }
    return batch;
  }

  /** Removes sent entries by seq (the ring may have dropped older ones meanwhile). */
  function dropThrough(seq: number) {
    buffer = buffer.filter((b) => b.seq > seq);
  }

  async function flush(): Promise<void> {
    if (sending || buffer.length === 0) return;
    const start = deps.now();
    if (start < nextAllowedAt) return;
    sending = true;
    // Stamped before the gate checks so a phone that is not joined does not re-check storage on every log line.
    nextAllowedAt = start + L.minIntervalMs;
    try {
      if (!(await deps.isEnabled())) {
        buffer = []; // switched off: entries from the off period are never sent later
        return;
      }
      const identity = await deps.getIdentity();
      if (!identity) return; // not joined: keep the (capped) buffer for when we are
      while (buffer.length > 0) {
        const batch = takeBatch();
        const lastSeq = batch[batch.length - 1].seq;
        try {
          await deps.send(identity, { deviceSeq: batch[0].seq, entries: batch.map((b) => b.entry) });
          dropThrough(lastSeq);
          lastSentAt = deps.now();
        } catch (err) {
          if (err instanceof ApiError && err.kind === 'client' && err.status !== 429) {
            dropThrough(lastSeq); // the server will never accept this batch: don't retry it forever
            continue;
          }
          nextAllowedAt = deps.now() + L.failureBackoffMs; // keep the buffer, try again later
          return;
        }
      }
    } catch {
      nextAllowedAt = deps.now() + L.failureBackoffMs;
    } finally {
      sending = false;
    }
  }

  return {
    append(event, payload, appState) {
      try {
        const every = SAMPLED_EVENTS[event];
        if (every) {
          const seen = sampledCounts.get(event) ?? 0;
          sampledCounts.set(event, seen + 1);
          if (seen % every !== 0) return; // the first one always ships
        }
        const entry: ApiLogEntry = { t: deps.now(), event, payload: redact(event, payload), appState };
        const bytes = utf8Length(JSON.stringify(entry));
        if (bytes > L.maxEntryBytes) return;
        buffer.push({ seq: nextSeq++, bytes, entry });
        if (buffer.length > L.maxBuffered) buffer.splice(0, buffer.length - L.maxBuffered);
        if (buffer.length >= L.flushThreshold) void flush();
      } catch {
        // Logging must never crash the app it is diagnosing.
      }
    },
    flush,
    pendingCount: () => buffer.length,
    getLastSentAt: () => lastSentAt,
    isEnabled: () => deps.isEnabled(),
    async setEnabled(enabled) {
      await deps.setEnabled(enabled);
      if (!enabled) buffer = [];
    },
  };
}

// ------------------------------------------------------------------ app-wide instance

let configured: Pick<LogShipperDeps, 'getIdentity' | 'isEnabled' | 'setEnabled' | 'send'> | null = null;

/** Called once at startup (app/syncRuntime.ts) with the real storage and API client. Until then entries are only buffered. */
export function configureLogShipper(deps: NonNullable<typeof configured>): void {
  configured = deps;
}

const appShipper = createLogShipper({
  now: Date.now,
  getIdentity: async () => (configured ? configured.getIdentity() : null),
  isEnabled: async () => (configured ? configured.isEnabled() : false),
  setEnabled: async (enabled) => configured?.setEnabled(enabled),
  send: async (identity, request) => {
    if (!configured) throw new Error('log shipper not configured');
    await configured.send(identity, request);
  },
});

/** Used by log(). */
export const shipLog = appShipper.append;
/** Call on app foreground/background changes and after a walk finishes. Rate limited inside. */
export const flushLogShipper = (): Promise<void> => appShipper.flush();
export const getLogShippingEnabled = (): Promise<boolean> => appShipper.isEnabled();
export const setLogShippingEnabled = (enabled: boolean): Promise<void> => appShipper.setEnabled(enabled);
export const getLogLastSentAt = (): number | null => appShipper.getLastSentAt();

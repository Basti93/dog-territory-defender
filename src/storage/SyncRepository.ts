// Household sync bookkeeping (multiplayer-sync design.md Decision 9): the
// outbox of not-yet-acknowledged commands plus a small singleton of sync state
// (event cursor, last applied Den revision, last successful sync). Device
// identity/token lives in SettingsRepository, not here.

/** What an outbox item sends: a walk upload (`POST /v1/walks`) or an economy command (`POST /v1/commands`). */
export type OutboxKind = 'walk.upload' | 'command';

export interface OutboxItem {
  /** Doubles as the command's clientId (server idempotency key). */
  id: string;
  kind: OutboxKind;
  payload: unknown;
  createdAt: number;
  attempts: number;
  /** Earliest time (ms epoch) the next push attempt may happen (backoff). */
  nextAttemptAt: number;
  lastError: string | null;
  /** Set when the item gave up (too many attempts or a permanent rejection). Dead items are kept for inspection, never retried. */
  deadAt: number | null;
}

export interface NewOutboxItem {
  id: string;
  kind: OutboxKind;
  payload: unknown;
  createdAt: number;
}

export interface SyncState {
  /** Last applied server event seq. */
  cursor: number;
  /** Last applied Den revision; a snapshot/event with a lower or equal rev is ignored. */
  denRev: number;
  lastSyncAt: number | null;
  /** serverTime - deviceTime at the last response. */
  clockOffsetMs: number;
  /** playerId -> display name, from snapshots and member.joined / member.updated events (walk events carry only ids). */
  players: Record<string, string>;
  /** Founding-import idempotency key, set before the first import attempt so a retry replays instead of conflicting. */
  importId: string | null;
  /** Latest "X joined the pack" event, for the one-off Doorstep line. */
  lastMemberJoined: { playerName: string; at: number; /** Absent in state saved before renames existed. */ playerId?: string } | null;
  /** Newest first, at most NEIGHBOUR_LINES_KEPT. Absent in state saved before neighbours existed. */
  neighbourLines?: NeighbourLineEntry[];
}

/** A neighbour line from the event feed (Track B): an i18n key plus params, never copy. */
export interface NeighbourLineEntry {
  line: string;
  botName: string | null;
  params: Record<string, string | number>;
  at: number;
  seq: number;
}

export const NEIGHBOUR_LINES_KEPT = 5;

export const EMPTY_SYNC_STATE: SyncState = { cursor: 0, denRev: 0, lastSyncAt: null, clockOffsetMs: 0, players: {}, importId: null, lastMemberJoined: null };

export interface SyncRepository {
  enqueue(item: NewOutboxItem): Promise<void>;
  /** Live (not dead) items, oldest first. */
  getPending(): Promise<OutboxItem[]>;
  /** Acknowledged by the server: removes the item. */
  remove(id: string): Promise<void>;
  /** Records a failed attempt (attempts + 1). `deadAt` non-null dead-letters the item. */
  recordFailure(id: string, error: string, nextAttemptAt: number, deadAt: number | null): Promise<void>;
  counts(): Promise<{ pending: number; dead: number }>;
  getState(): Promise<SyncState>;
  saveState(patch: Partial<SyncState>): Promise<void>;
  /** Disconnect: drops the outbox and resets sync state. Local game data is untouched. */
  clear(): Promise<void>;
}

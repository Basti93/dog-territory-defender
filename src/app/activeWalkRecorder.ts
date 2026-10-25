import type { Location, Walk } from '../types';
import type { ActiveWalkRepository, ActiveWalkSnapshot } from '../storage/ActiveWalkRepository';
import { log } from '../utils/log';

// Writes the walk in flight to the ActiveWalkRepository, batched. Fed by gps.ts for EVERY accepted fix (setFixRecorder),
// i.e. also from the location task while the UI is gone or the app was relaunched headless by the OS. In that case this
// module has never seen `begin()`, so it learns the walk id from the repository on the first fix.
// All repository calls run through one queue, so begin/append/clear can never overtake each other.

export const FLUSH_EVERY_FIXES = 10;
export const FLUSH_EVERY_MS = 15_000;
/** Unflushed fixes kept while the repository is slow or failing; the oldest are dropped past this. */
const MAX_BUFFERED_FIXES = 2_000;

export interface ActiveWalkRecorder {
  /** A walk began. Resolves once it is stored (a storage problem is logged, never thrown: the walk itself goes on). */
  begin(walk: Walk): Promise<void>;
  /** An accepted GPS fix. Synchronous and cheap; storage happens in batches. Ignored while no walk is active. */
  addFix(location: Location): void;
  /** Writes everything buffered. Call when the app goes to the background. */
  flush(): Promise<void>;
  /** Flushes, then returns the stored walk (what a relaunch restores). */
  load(): Promise<ActiveWalkSnapshot | null>;
  /** When this runtime last saw the walk begin or a fix arrive; null while it knows of no walk. */
  lastActivityAt(): number | null;
  /** The walk is over: forgets the buffer and clears the stored walk. */
  end(): Promise<void>;
}

export interface ActiveWalkRecorderDeps {
  repo: ActiveWalkRepository;
  now?: () => number;
}

export function createActiveWalkRecorder({ repo, now = Date.now }: ActiveWalkRecorderDeps): ActiveWalkRecorder {
  let walkId: string | null = null;
  // False in a freshly started runtime until the repository was asked which walk (if any) is active.
  let resolved = false;
  let resolving = false;
  let buffer: Location[] = [];
  let lastFlushAt = now();
  let lastActivityAt: number | null = null;
  let queue: Promise<void> = Promise.resolve();

  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(task).catch((error) => log('ACTIVE_WALK_STORE_ERROR', { error: String(error) }));
    return queue;
  };

  function flush(): Promise<void> {
    return enqueue(async () => {
      if (!walkId || buffer.length === 0) return;
      const batch = buffer;
      buffer = [];
      lastFlushAt = now();
      try {
        await repo.appendFixes(walkId, batch);
      } catch (error) {
        buffer = [...batch, ...buffer].slice(-MAX_BUFFERED_FIXES); // retry with the next flush
        throw error;
      }
    });
  }

  /** Learns which walk is active (a relaunched runtime has not seen begin()), then writes what was buffered meanwhile. */
  function resolveActiveWalk(): Promise<void> {
    if (resolved) return queue;
    if (!resolving) {
      resolving = true;
      void enqueue(async () => {
        try {
          const snapshot = await repo.load();
          if (!resolved) walkId = snapshot?.meta.id ?? null; // begin() may have won the race
          resolved = true;
          if (!walkId) buffer = [];
        } finally {
          resolving = false;
        }
      }).then(() => (walkId ? flush() : undefined));
    }
    return queue;
  }

  return {
    async begin(walk) {
      walkId = walk.id;
      resolved = true;
      buffer = [];
      lastFlushAt = now();
      lastActivityAt = now();
      await enqueue(() => repo.start({ id: walk.id, startTime: walk.startTime, startSource: walk.startSource }, walk.locations));
    },

    addFix(location) {
      if (resolved && !walkId) return;
      lastActivityAt = now();
      buffer.push(location);
      if (buffer.length > MAX_BUFFERED_FIXES) buffer.splice(0, buffer.length - MAX_BUFFERED_FIXES);
      if (!resolved) {
        void resolveActiveWalk();
        return;
      }
      if (buffer.length >= FLUSH_EVERY_FIXES || now() - lastFlushAt >= FLUSH_EVERY_MS) void flush();
    },

    flush,

    lastActivityAt: () => (walkId ? lastActivityAt : null),

    async load() {
      await resolveActiveWalk();
      await flush();
      const result: { snapshot: ActiveWalkSnapshot | null } = { snapshot: null };
      await enqueue(async () => {
        result.snapshot = await repo.load();
      });
      return result.snapshot;
    },

    async end() {
      walkId = null;
      lastActivityAt = null;
      resolved = true;
      buffer = [];
      await enqueue(() => repo.clear());
    },
  };
}

import { EMPTY_SYNC_STATE, NewOutboxItem, OutboxItem, SyncRepository, SyncState } from './SyncRepository';

export function createInMemorySyncRepository(): SyncRepository {
  let items: OutboxItem[] = [];
  let state: SyncState = { ...EMPTY_SYNC_STATE };

  return {
    async enqueue(item: NewOutboxItem) {
      if (items.some((i) => i.id === item.id)) return;
      items.push({ ...item, attempts: 0, nextAttemptAt: 0, lastError: null, deadAt: null });
    },
    async getPending() {
      return items.filter((i) => i.deadAt === null).sort((a, b) => a.createdAt - b.createdAt).map((i) => ({ ...i }));
    },
    async remove(id) {
      items = items.filter((i) => i.id !== id);
    },
    async recordFailure(id, error, nextAttemptAt, deadAt) {
      items = items.map((i) => (i.id === id ? { ...i, attempts: i.attempts + 1, lastError: error, nextAttemptAt, deadAt } : i));
    },
    async counts() {
      const dead = items.filter((i) => i.deadAt !== null).length;
      return { pending: items.length - dead, dead };
    },
    async getState() {
      return { ...state };
    },
    async saveState(patch) {
      state = { ...state, ...patch };
    },
    async clear() {
      items = [];
      state = { ...EMPTY_SYNC_STATE };
    },
  };
}

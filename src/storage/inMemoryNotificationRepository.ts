import { defaultNotificationBookkeepingState, NotificationBookkeepingState } from '../notifications/notificationDecision';
import { NotificationRepository } from './NotificationRepository';

export function createInMemoryNotificationRepository(): NotificationRepository {
  let state: NotificationBookkeepingState | null = null;

  return {
    async getState(): Promise<NotificationBookkeepingState> {
      if (!state) {
        state = defaultNotificationBookkeepingState();
      }
      return state;
    },

    async saveState(next: NotificationBookkeepingState): Promise<void> {
      state = next;
    },
  };
}

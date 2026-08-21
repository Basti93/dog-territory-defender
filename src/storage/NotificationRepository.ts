import { NotificationBookkeepingState } from '../notifications/notificationDecision';

export type { NotificationBookkeepingState };

export interface NotificationRepository {
  getState(): Promise<NotificationBookkeepingState>;
  saveState(state: NotificationBookkeepingState): Promise<void>;
}

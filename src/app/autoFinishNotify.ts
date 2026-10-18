import { AppState as RNAppState, AppStateStatus } from 'react-native';
import { log } from '../utils/log';
import { scheduleWalkEndedNotification } from '../notifications/scheduler';

/**
 * After an auto-finish: if the app is not in front, tell the player right away
 * (the celebration state is already set, so the Homecoming plays on the next
 * foreground). Returns whether a notification was handed to the OS.
 */
export async function notifyAutoFinishedIfBackgrounded(
  dogName: string | null,
  currentState: AppStateStatus = RNAppState.currentState,
  schedule: (dogName: string | null) => Promise<boolean> = scheduleWalkEndedNotification
): Promise<boolean> {
  if (currentState === 'active') return false;
  try {
    return await schedule(dogName);
  } catch (err) {
    log('WALK_AUTO_FINISH_NOTIFY_ERROR', { error: String(err) });
    return false;
  }
}

import { DenEconomyRepository } from '../storage/DenEconomyRepository';
import { NotificationRepository } from '../storage/NotificationRepository';
import { WalkRepository } from '../storage/WalkRepository';
import { log } from '../utils/log';
import {
  learnTimeOfDayBucket,
  overflowNotificationBody,
  resetSurfacedFlagIfOverflowCleared,
  shouldFireOverflowNotification,
} from './notificationDecision';
import { requestNotificationPermission, scheduleOverflowNotification } from './scheduler';

export interface EarnedTriggerDeps {
  denEconomyRepository: DenEconomyRepository;
  walkRepository: WalkRepository;
  notificationRepository: NotificationRepository;
}

/**
 * Recomputes and (re)schedules the earned-trigger notification. Call this
 * each time the app opens (per design.md's accepted check cadence — there's
 * no backend to wake the app while it's closed, so this is honest about
 * only checking while the app has actually been opened recently enough).
 * Reads existing Den-economy state only — no new "was a walk missed"
 * inference, and no read of manually-logged walks (that trigger is out of
 * scope for this MVP per proposal.md's scope cut).
 */
export async function checkAndScheduleEarnedTriggerNotification(deps: EarnedTriggerDeps): Promise<void> {
  const { denEconomyRepository, walkRepository, notificationRepository } = deps;

  const [denState, bookkeeping] = await Promise.all([denEconomyRepository.getState(), notificationRepository.getState()]);

  const clearedBookkeeping = resetSurfacedFlagIfOverflowCleared(denState, bookkeeping);
  if (clearedBookkeeping !== bookkeeping) {
    await notificationRepository.saveState(clearedBookkeeping);
  }

  if (!shouldFireOverflowNotification(denState, clearedBookkeeping)) {
    return;
  }

  const walks = await walkRepository.getWalks();
  const bucket = learnTimeOfDayBucket(walks.map((walk) => walk.startTime));
  if (!bucket) {
    // No walk history yet to learn a delivery time from — stay silent rather than guess a time.
    return;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    log('NOTIFICATION_PERMISSION_DENIED', { context: 'den-overflow-earned-trigger' });
    return;
  }

  await scheduleOverflowNotification(bucket, overflowNotificationBody(denState.treats));
  await notificationRepository.saveState({ ...clearedBookkeeping, overflowSurfaced: true, learnedTimeOfDayBucket: bucket });
}

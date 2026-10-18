import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import { getFeedbackPrefs, shouldPlay } from './feedbackPrefs';

function fire(run: () => Promise<void>): void {
  if (Platform.OS === 'web' || !shouldPlay(getFeedbackPrefs(), 'haptic')) return;
  try {
    run().catch(() => {});
  } catch {
    // haptics are decoration; never let them break a press
  }
}

/** Light impact: button presses. */
export function tap(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Success notification: upgrade done, walk claimed. */
export function success(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Medium impact: Buddy boop. */
export function pop(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

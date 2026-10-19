import { useEffect } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';

import type { SettingsRepository } from '../storage/SettingsRepository';
import { log } from '../utils/log';
import { t } from '../i18n';

/** How long after a walk starts the hint waits, so it never lands on top of the start itself. */
export const BATTERY_HINT_DELAY_MS = 8_000;

/**
 * Android phones (battery saver, vendor "optimisation") freeze or kill an app and switch GPS off in the pocket, which
 * ends a walk's recording. Nothing in the app can detect or change that (no native module for it), so the app only
 * points at the system setting, once after the first walk start and permanently in Settings.
 */
export function batteryHintApplies(platform: string): boolean {
  return platform === 'android';
}

/** Opens the system's battery-optimisation list (Tails Up -> "Nicht eingeschränkt"); falls back to the app's own system page. */
export async function openBatterySettings(): Promise<void> {
  if (!batteryHintApplies(Platform.OS)) return;
  try {
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  } catch {
    await Linking.openSettings().catch(() => undefined);
  }
}

export interface BatteryHintDeps {
  settings: Pick<SettingsRepository, 'getBatteryHintShown' | 'saveBatteryHintShown'>;
  /** A walk is being tracked (the hint comes during the first one). */
  isTracking: boolean;
  /** Something else is asking the player a question right now (e.g. the live-share dialog): wait. */
  blocked: boolean;
  platform?: string;
  delayMs?: number;
}

/** The one-time, calm Android hint after the first walk start. Stored as shown the moment it appears, so it never repeats. */
export function useBatteryHint({ settings, isTracking, blocked, platform = Platform.OS, delayMs = BATTERY_HINT_DELAY_MS }: BatteryHintDeps): void {
  useEffect(() => {
    if (!isTracking || blocked || !batteryHintApplies(platform)) return;
    let alive = true;
    let waitingForFront: { remove: () => void } | null = null;
    const show = async () => {
      try {
        if (!alive || (await settings.getBatteryHintShown())) return;
        await settings.saveBatteryHintShown(true);
        log('BATTERY_HINT_SHOWN');
        Alert.alert(t('battery.title'), t('battery.body'), [
          { text: t('battery.later'), style: 'cancel' },
          { text: t('battery.open'), onPress: () => void openBatterySettings() },
        ]);
      } catch {
        // A broken lookup must never get in the way of the walk: no hint.
      }
    };
    const timer = setTimeout(() => {
      if (AppState.currentState === 'active') {
        void show();
        return;
      }
      // The phone went into the pocket within the delay (the usual case): an Alert has no screen then and would be lost
      // while the hint counts as shown. Wait for the app to come to the front instead.
      waitingForFront = AppState.addEventListener('change', (next) => {
        if (next !== 'active') return;
        waitingForFront?.remove();
        waitingForFront = null;
        void show();
      });
    }, delayMs);
    return () => {
      alive = false;
      clearTimeout(timer);
      waitingForFront?.remove();
    };
  }, [isTracking, blocked, platform, settings, delayMs]);
}

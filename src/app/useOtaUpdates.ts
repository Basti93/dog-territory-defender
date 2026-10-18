import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { log } from '../utils/log';

/** Foreground checks are at most this far apart (the start-up check always runs). */
export const MIN_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export type UpdateCheckResult = 'current' | 'ready' | 'unavailable';

/** Never in dev builds or a dev client (expo-updates is disabled there). Read at call time so tests can flip it. */
function otaAvailable(): boolean {
  return !__DEV__ && Updates.isEnabled;
}

/**
 * Gentle over-the-air updates: check on start and on foreground, download in
 * the background, and only flag `updateReady`; the player decides when to
 * restart (`apply`). All errors go to the Debug Log, never to the player.
 */
export function useOtaUpdates() {
  const [updateReady, setUpdateReady] = useState(false);
  // "Später": hides the card for this session only.
  const [dismissed, setDismissed] = useState(false);
  const lastCheckAt = useRef(0);
  const checking = useRef(false);

  const check = useCallback(async (): Promise<UpdateCheckResult> => {
    if (!otaAvailable()) return 'unavailable';
    if (checking.current) return 'unavailable';
    checking.current = true;
    lastCheckAt.current = Date.now();
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return 'current';
      await Updates.fetchUpdateAsync();
      setUpdateReady(true);
      return 'ready';
    } catch (err) {
      log('OTA_UPDATE_ERROR', { error: String(err) });
      return 'unavailable';
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!otaAvailable()) return;
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheckAt.current >= MIN_CHECK_INTERVAL_MS) void check();
    });
    return () => sub.remove();
  }, [check]);

  const apply = useCallback(() => {
    Updates.reloadAsync().catch((err) => log('OTA_RELOAD_ERROR', { error: String(err) }));
  }, []);

  /** Manual check from Settings; a found update also re-opens a dismissed card. */
  const checkNow = useCallback(async (): Promise<UpdateCheckResult> => {
    const result = await check();
    if (result === 'ready') setDismissed(false);
    return result;
  }, [check]);

  const appVersion = Constants.expoConfig?.version ?? '?';
  const currentVersionLabel = [appVersion, Updates.updateId?.slice(0, 8), Updates.channel].filter(Boolean).join(' · ');

  return {
    updateReady,
    /** True when the Doorstep card should be offered (ready and not dismissed this session). */
    showUpdateCard: updateReady && !dismissed,
    dismiss: () => setDismissed(true),
    apply,
    checkNow,
    currentVersionLabel,
  };
}

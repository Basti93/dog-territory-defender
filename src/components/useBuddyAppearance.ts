import { useCallback, useEffect, useState } from 'react';

import { BuddyAppearance, defaultBuddyAppearance } from '../buddy/buddyAppearance';
import { BuddyAppearanceRepository } from '../storage/BuddyAppearanceRepository';
import { log } from '../utils/log';

/**
 * Holds Buddy's look for App.tsx. Starts on the default look and never blocks
 * startup: a failed load keeps the default, a failed save keeps the new look
 * in memory for this session.
 */
export const BUDDY_APPEARANCE_LOAD_TIMEOUT_MS = 1500;

export function useBuddyAppearance(repository: BuddyAppearanceRepository) {
  const [appearance, setAppearance] = useState<BuddyAppearance>(() => defaultBuddyAppearance());
  // `loaded` flips true when the stored look arrives, the load fails, or the
  // timeout fires, so screens can wait briefly for the real look without ever
  // blocking startup.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setLoaded(true);
    }, BUDDY_APPEARANCE_LOAD_TIMEOUT_MS);
    repository
      .getAppearance()
      .then((stored) => {
        if (!cancelled) {
          setAppearance(stored);
          setLoaded(true);
        }
      })
      .catch((err) => {
        log('BUDDY_APPEARANCE_LOAD_ERROR', { error: String(err) });
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [repository]);

  const saveAppearance = useCallback(
    async (next: BuddyAppearance) => {
      setAppearance(next);
      try {
        await repository.saveAppearance(next);
      } catch (err) {
        log('BUDDY_APPEARANCE_SAVE_ERROR', { error: String(err) });
      }
    },
    [repository]
  );

  /** The household's look arrived through sync and is already stored: only the screen state changes. */
  const adoptAppearance = useCallback((next: BuddyAppearance) => setAppearance(next), []);

  return { appearance, loaded, saveAppearance, adoptAppearance };
}

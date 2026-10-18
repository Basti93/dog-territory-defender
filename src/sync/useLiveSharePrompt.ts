import { useCallback, useEffect, useRef, useState } from 'react';

import type { SettingsRepository } from '../storage/SettingsRepository';
import type { PresenceSender } from './presenceSender';
import type { SyncStatus } from './syncEngine';

export interface LiveSharePromptDeps {
  settings: Pick<SettingsRepository, 'getLiveSharePromptShown' | 'saveLiveSharePromptShown' | 'getLiveShareEnabled' | 'saveLiveShareEnabled'>;
  getStatus: () => Promise<Pick<SyncStatus, 'joined' | 'partnerName'>>;
  /** The walk is being tracked (rising edge = a walk started). */
  isTracking: boolean;
  /** Told after the player chose, so a "yes" starts the thread right away instead of at the next 5 s re-check. */
  presence: Pick<PresenceSender, 'optInChanged'>;
}

export interface LiveSharePrompt {
  visible: boolean;
  /** The partner's name, or null (the dialog then says "dein Haushalt"). */
  partnerName: string | null;
  answer: (yes: boolean) => void;
}

/**
 * The one-time question "May {partner} see your walk live?". Asked when a walk starts, only while joined to a
 * household and only if it was never answered; the answer is stored, so it never comes again (the Settings switch is
 * the place to change it). Until the player says yes nothing is sent (presenceSender checks the stored switch).
 */
export function useLiveSharePrompt({ settings, getStatus, isTracking, presence }: LiveSharePromptDeps): LiveSharePrompt {
  const [state, setState] = useState<{ visible: boolean; partnerName: string | null }>({ visible: false, partnerName: null });
  // Asked at most once per app run even if the first lookup is slow and the walk ends and a new one starts.
  const asked = useRef(false);

  useEffect(() => {
    if (!isTracking || asked.current) return;
    let alive = true;
    void (async () => {
      try {
        const [status, shown, enabled] = await Promise.all([getStatus(), settings.getLiveSharePromptShown(), settings.getLiveShareEnabled()]);
        if (!alive || !status.joined || shown || enabled) return;
        asked.current = true;
        setState({ visible: true, partnerName: status.partnerName ?? null });
      } catch {
        // A broken lookup must never block the walk: no question, nothing is shared.
      }
    })();
    return () => {
      alive = false;
    };
  }, [isTracking, settings, getStatus]);

  const answer = useCallback(
    (yes: boolean) => {
      setState((s) => ({ ...s, visible: false }));
      void (async () => {
        try {
          await settings.saveLiveSharePromptShown(true);
          await settings.saveLiveShareEnabled(yes);
        } finally {
          if (yes) presence.optInChanged();
        }
      })().catch(() => undefined);
    },
    [settings, presence]
  );

  return { visible: state.visible, partnerName: state.partnerName, answer };
}

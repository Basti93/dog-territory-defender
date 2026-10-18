import { useCallback, useEffect, useRef, useState } from 'react';

import type { SessionKind } from '../doorstepSession';
import type { SettingsRepository } from '../../storage/SettingsRepository';
import {
  WildExtraId,
  canPlay,
  getShownThisSession,
  markShown,
  recordShownThisSession,
  resolveWildExtras,
  takeWalkTrigger,
} from './wildExtras';

interface Options {
  /** Omitted (tests, previews): no extras. */
  settingsRepository?: SettingsRepository;
  sessionKind: SessionKind;
  rng?: () => number;
}

/**
 * Den-only host for Wild Extras. On mount it reads the persisted "last shown" days, takes any pending
 * walk-close trigger, and asks the pure resolver for at most one extra. `playLevelUp()` is for the Den's
 * own building upgrade. Nothing here sets state after unmount.
 */
export function useWildExtra({ settingsRepository, sessionKind, rng = Math.random }: Options) {
  const [active, setActive] = useState<WildExtraId | null>(null);
  const activeRef = useRef<WildExtraId | null>(null);
  const lastShownRef = useRef<Record<string, string> | null>(null);
  const aliveRef = useRef(true);
  const rngRef = useRef(rng);
  rngRef.current = rng;

  const start = useCallback(
    (id: WildExtraId, now: number) => {
      activeRef.current = id;
      recordShownThisSession(id);
      lastShownRef.current = markShown(lastShownRef.current ?? {}, id, now);
      settingsRepository?.saveWildExtrasLastShown(lastShownRef.current).catch(() => undefined);
      setActive(id);
    },
    [settingsRepository]
  );

  useEffect(() => {
    aliveRef.current = true;
    if (!settingsRepository) return;
    settingsRepository
      .getWildExtrasLastShown()
      .catch(() => ({}) as Record<string, string>)
      .then((lastShown) => {
        if (!aliveRef.current) return;
        lastShownRef.current = lastShown;
        const now = Date.now();
        const trigger = takeWalkTrigger(now);
        const id = resolveWildExtras({
          now,
          sessionKind,
          walkJustClosed: trigger.walk,
          levelUpJustHappened: trigger.levelUp,
          month: new Date(now).getMonth() + 1,
          lastShown,
          shownThisSession: getShownThisSession(),
          rng: rngRef.current,
        });
        if (id) start(id, now);
      });
    return () => {
      aliveRef.current = false;
    };
    // Once per Den mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playLevelUp = useCallback(() => {
    if (!settingsRepository || activeRef.current || lastShownRef.current === null) return;
    const now = Date.now();
    if (canPlay('level-up-fireflies', lastShownRef.current, getShownThisSession(), now)) start('level-up-fireflies', now);
  }, [settingsRepository, start]);

  const onDone = useCallback(() => {
    activeRef.current = null;
    if (aliveRef.current) setActive(null);
  }, []);

  return { active, onDone, playLevelUp };
}

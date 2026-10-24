import { useEffect, useMemo, useState } from 'react';

import type { SettingsRepository } from '../storage/SettingsRepository';
import type { StoredWalk } from '../storage/WalkRepository';
import { log } from '../utils/log';
import { buildWalkDiary, diaryAnnouncements, type WalkDiary } from './walkDiary';

export interface WalkDiaryView {
  diary: WalkDiary;
  /** The one-time "Ich hab ein Tagebuch angelegt". Stays true for this visit once it has been decided. */
  showIntro: boolean;
  /** A new personal longest walk since the last visit: the card wags and drops a little confetti. */
  newLongest: boolean;
}

/**
 * The diary for the Album: built from the loaded walks, plus what it has to announce (once). `settings` is optional so
 * the diary still shows (without one-time lines) where no settings are at hand. Waits for `loaded` before deciding.
 */
export function useWalkDiary(walks: readonly StoredWalk[], loaded: boolean, settings?: SettingsRepository): WalkDiaryView {
  const diary = useMemo(() => buildWalkDiary(walks), [walks]);
  const [flags, setFlags] = useState({ showIntro: false, newLongest: false });

  useEffect(() => {
    if (!loaded || !diary.ready || !settings) return;
    let alive = true;
    (async () => {
      const seen = await settings.getDiarySeen();
      const result = diaryAnnouncements(diary, seen);
      if (alive) setFlags((prev) => ({ showIntro: prev.showIntro || result.showIntro, newLongest: prev.newLongest || result.newLongest }));
      if (result.next) await settings.saveDiarySeen(result.next);
    })().catch((err) => log('DIARY_SEEN_ERROR', { error: String(err) }));
    return () => {
      alive = false;
    };
  }, [loaded, diary, settings]);

  return { diary, showIntro: flags.showIntro, newLongest: flags.newLongest };
}

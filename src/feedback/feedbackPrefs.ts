import { useSyncExternalStore } from 'react';

import { DEFAULT_FEEDBACK_PREFS, FeedbackPrefs, FeedbackPrefsRepository } from '../storage/FeedbackPrefsRepository';

export type { FeedbackPrefs } from '../storage/FeedbackPrefsRepository';

export type FeedbackKind = 'sound' | 'haptic';

/** Pure gate used by sounds.ts and haptics.ts. */
export function shouldPlay(prefs: FeedbackPrefs, kind: FeedbackKind): boolean {
  return kind === 'sound' ? prefs.sound : prefs.haptics;
}

/**
 * Pure gate for effect sounds: the sound pref must be on AND the app must be in
 * front. Nothing sounds in the background or while 'inactive' (owner decision
 * 2026-10-18), not even the in-walk cues; they are dropped, never queued.
 */
export function shouldPlayNow(appState: string | null | undefined, prefs: FeedbackPrefs): boolean {
  return appState === 'active' && shouldPlay(prefs, 'sound');
}

let current: FeedbackPrefs = { ...DEFAULT_FEEDBACK_PREFS };
// Counts toggles made by the player; lets a slow startup load detect it lost the race.
let userChanges = 0;
const listeners = new Set<() => void>();

export function getFeedbackPrefs(): FeedbackPrefs {
  return current;
}

/** Updates the in-app value only (no persistence). */
export function setFeedbackPrefs(next: FeedbackPrefs): void {
  if (next.sound === current.sound && next.haptics === current.haptics && next.music === current.music) return;
  current = { sound: next.sound, haptics: next.haptics, music: next.music };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the calling component when sound/haptics prefs change. */
export function useFeedbackPrefs(): FeedbackPrefs {
  return useSyncExternalStore(subscribe, getFeedbackPrefs, getFeedbackPrefs);
}

/** Non-blocking startup load: defaults stay on until (and unless) the saved value arrives. */
export function loadFeedbackPrefs(repo: FeedbackPrefsRepository): void {
  const versionAtStart = userChanges;
  repo
    .getPrefs()
    // A toggle flipped while the load was in flight wins over the stored value.
    .then((saved) => {
      if (userChanges === versionAtStart) setFeedbackPrefs(saved);
    })
    .catch(() => {});
}

/** Applies immediately, then persists (a failed save leaves the in-session value). */
export async function updateFeedbackPrefs(repo: FeedbackPrefsRepository, next: FeedbackPrefs): Promise<void> {
  userChanges += 1;
  setFeedbackPrefs(next);
  try {
    await repo.savePrefs(next);
  } catch {
    // best effort: the toggle still works for this session
  }
}

/** Music plays only when both the master sound switch and the music switch are on. */
export function useMusicEnabled(): boolean {
  const prefs = useFeedbackPrefs();
  return prefs.sound && prefs.music;
}

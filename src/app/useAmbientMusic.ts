import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { ensureAudioMode } from '../feedback/sounds';
import { log } from '../utils/log';

/** Screens where the music box may play. 'celebration' is passed by App.tsx while the reward overlay is up. */
export type AmbientScreen = string;
const MUSIC_SCREENS: ReadonlySet<AmbientScreen> = new Set(['doorstep', 'den', 'celebration']);

export const AMBIENT_VOLUME = 0.5; // file RMS is about -31 dBFS (sparse notes), so 0.5 lands near -37 dBFS on a phone speaker
export const FADE_IN_MS = 1500;
export const FADE_OUT_MS = 1000;
/** After this long on music screens the box goes quiet until the screen changes. */
export const QUIET_AFTER_MS = 5 * 60 * 1000;
const FADE_STEP_MS = 50;

export interface AmbientState {
  screen: AmbientScreen;
  walkActive: boolean;
  enabled: boolean;
  /** App is in the foreground (`AppState === 'active'`). */
  appActive: boolean;
  /** The quiet window elapsed on the current screen. */
  quiet: boolean;
}

/** Pure: should the music box be audible right now? */
export function shouldPlayAmbient(state: AmbientState): boolean {
  return state.enabled && state.appActive && !state.walkActive && !state.quiet && MUSIC_SCREENS.has(state.screen);
}

/** Pure-ish timer wrapper (uses setTimeout, so fake timers work). Returns a cancel function. */
export function startQuietTimer(onElapsed: () => void, afterMs: number = QUIET_AFTER_MS): () => void {
  const id = setTimeout(onElapsed, afterMs);
  return () => clearTimeout(id);
}

// Tiny store so the Settings sound test can show whether the music box is audible right now.
let musicPlaying = false;
const musicListeners = new Set<() => void>();
function setMusicPlaying(v: boolean): void {
  if (musicPlaying === v) return;
  musicPlaying = v;
  musicListeners.forEach((l) => l());
}
export function useMusicPlaying(): boolean {
  return useSyncExternalStore(
    (l) => {
      musicListeners.add(l);
      return () => {
        musicListeners.delete(l);
      };
    },
    () => musicPlaying,
    () => musicPlaying
  );
}

type MusicPlayer = import('expo-audio').AudioPlayer;

function releasePlayer(player: MusicPlayer | null): void {
  try {
    player?.remove();
  } catch {
    // already released natively
  }
}

/**
 * Looping, very quiet kalimba "music box" under the Doorstep, Den and
 * celebration. Never during a walk (the walk is audio-first with its own cues),
 * never when the app is not in front (paused at once, no fade), goes quiet after 5 minutes on one screen.
 */
export function useAmbientMusic({ screen, walkActive, enabled }: { screen: AmbientScreen; walkActive: boolean; enabled: boolean }): void {
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [quiet, setQuiet] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // A new screen ends the quiet window.
  useEffect(() => setQuiet(false), [screen]);

  const wantedIgnoringQuiet = shouldPlayAmbient({ screen, walkActive, enabled, appActive, quiet: false });
  useEffect(() => {
    if (!wantedIgnoringQuiet) return undefined;
    return startQuietTimer(() => setQuiet(true));
  }, [wantedIgnoringQuiet, screen]);

  const wanted = wantedIgnoringQuiet && !quiet;

  const wantedRef = useRef(false);
  const soundRef = useRef<MusicPlayer | null>(null);
  const loadingRef = useRef<Promise<MusicPlayer | null> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const volumeRef = useRef(0);
  const playingRef = useRef(false);
  const unmountedRef = useRef(false);

  const stopFade = () => {
    if (fadeRef.current) clearInterval(fadeRef.current);
    fadeRef.current = null;
  };

  const setPlayerVolume = (player: MusicPlayer, volume: number) => {
    try {
      player.volume = volume;
    } catch {
      // player already released
    }
  };

  const fadeTo = (sound: MusicPlayer, target: number, ms: number, done?: () => void) => {
    stopFade();
    const from = volumeRef.current;
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let i = 0;
    fadeRef.current = setInterval(() => {
      i += 1;
      volumeRef.current = from + ((target - from) * i) / steps;
      setPlayerVolume(sound, volumeRef.current);
      if (i >= steps) {
        stopFade();
        done?.();
      }
    }, FADE_STEP_MS);
  };

  // Loads the file once; resolves null on web or if loading fails (retried on the next want).
  const load = (): Promise<MusicPlayer | null> => {
    if (soundRef.current) return Promise.resolve(soundRef.current);
    if (!loadingRef.current) {
      loadingRef.current = (async () => {
        try {
          await ensureAudioMode();
          const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
          const sound = createAudioPlayer(require('../../assets/sounds/ambient-musicbox.wav'));
          sound.loop = true;
          sound.volume = 0;
          if (unmountedRef.current) {
            releasePlayer(sound);
            return null;
          }
          // Another app/sound taking audio focus can pause us; resume if we are still wanted.
          sound.addListener('playbackStatusUpdate', (status) => {
            // The AppState check keeps this from re-starting the music when the OS pauses it on the way to the background.
            if (status.isLoaded && !status.playing && playingRef.current && wantedRef.current && !fadeRef.current && AppState.currentState === 'active') {
              try {
                sound.play();
              } catch {
                // released
              }
            }
          });
          soundRef.current = sound;
          return sound;
        } catch (e) {
          log('music', { event: 'load-failed', error: e instanceof Error ? e.message : String(e) });
          return null;
        } finally {
          loadingRef.current = null;
        }
      })();
    }
    return loadingRef.current;
  };

  // Start (or resume) playback on `sound` at volume 0, then fade in.
  const startPlayback = async (sound: MusicPlayer) => {
    if (!playingRef.current) {
      volumeRef.current = 0;
      sound.volume = 0;
      sound.play();
      playingRef.current = true;
      setMusicPlaying(true);
    }
    fadeTo(sound, AMBIENT_VOLUME, FADE_IN_MS);
  };

  useEffect(() => {
    wantedRef.current = wanted;
    if (Platform.OS === 'web') return;
    if (wanted) {
      load().then(async (sound) => {
        if (!sound || !wantedRef.current || unmountedRef.current) return;
        try {
          await startPlayback(sound);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          // Native player may be gone (e.g. released by a hot reload): recreate once and resume.
          try {
            stopFade();
            releasePlayer(soundRef.current);
            soundRef.current = null;
            playingRef.current = false;
            const fresh = await load();
            if (!fresh || !wantedRef.current || unmountedRef.current) return;
            log('music', { event: 'reloaded' });
            await startPlayback(fresh);
          } catch (e2) {
            log('music', { event: 'play-failed', error: e2 instanceof Error ? e2.message : String(e2) });
          }
        }
      });
    } else if (soundRef.current && playingRef.current && !appActive) {
      // Not in front: stop at once. A fade would need JS timers that iOS may
      // already have suspended, and nothing may sound in the background.
      const sound = soundRef.current;
      stopFade();
      volumeRef.current = 0;
      playingRef.current = false;
      setMusicPlaying(false);
      setPlayerVolume(sound, 0);
      try {
        sound.pause();
      } catch {
        // released
      }
    } else if (soundRef.current && playingRef.current) {
      const sound = soundRef.current;
      fadeTo(sound, 0, FADE_OUT_MS, () => {
        if (wantedRef.current) return;
        playingRef.current = false;
        setMusicPlaying(false);
        try {
          sound.pause();
        } catch {
          // released
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  useEffect(
    () => () => {
      unmountedRef.current = true;
      stopFade();
      setMusicPlaying(false);
      releasePlayer(soundRef.current);
      soundRef.current = null;
    },
    []
  );
}

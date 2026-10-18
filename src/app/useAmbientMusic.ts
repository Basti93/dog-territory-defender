import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { ensureAudioMode } from '../feedback/sounds';

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

type AvSound = import('expo-av').Audio.Sound;

/**
 * Looping, very quiet kalimba "music box" under the Doorstep, Den and
 * celebration. Never during a walk (the walk is audio-first with its own cues),
 * never in the background, goes quiet after 5 minutes on one screen.
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
  const soundRef = useRef<AvSound | null>(null);
  const loadingRef = useRef<Promise<AvSound | null> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const volumeRef = useRef(0);
  const playingRef = useRef(false);
  const unmountedRef = useRef(false);

  const stopFade = () => {
    if (fadeRef.current) clearInterval(fadeRef.current);
    fadeRef.current = null;
  };

  const fadeTo = (sound: AvSound, target: number, ms: number, done?: () => void) => {
    stopFade();
    const from = volumeRef.current;
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let i = 0;
    fadeRef.current = setInterval(() => {
      i += 1;
      volumeRef.current = from + ((target - from) * i) / steps;
      sound.setVolumeAsync(volumeRef.current).catch(() => {});
      if (i >= steps) {
        stopFade();
        done?.();
      }
    }, FADE_STEP_MS);
  };

  // Loads the file once; resolves null on web or if loading fails (retried on the next want).
  const load = (): Promise<AvSound | null> => {
    if (soundRef.current) return Promise.resolve(soundRef.current);
    if (!loadingRef.current) {
      loadingRef.current = (async () => {
        try {
          await ensureAudioMode();
          const { Audio } = require('expo-av') as typeof import('expo-av');
          const { sound } = await Audio.Sound.createAsync(require('../../assets/sounds/ambient-musicbox.wav'), {
            isLooping: true,
            volume: 0,
            shouldPlay: false,
          });
          if (unmountedRef.current) {
            sound.unloadAsync().catch(() => {});
            return null;
          }
          // Another app/sound taking audio focus can pause us; resume if we are still wanted.
          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && !status.isPlaying && playingRef.current && wantedRef.current && !fadeRef.current) {
              sound.playAsync().catch(() => {});
            }
          });
          soundRef.current = sound;
          return sound;
        } catch {
          return null;
        } finally {
          loadingRef.current = null;
        }
      })();
    }
    return loadingRef.current;
  };

  useEffect(() => {
    wantedRef.current = wanted;
    if (Platform.OS === 'web') return;
    if (wanted) {
      load().then(async (sound) => {
        if (!sound || !wantedRef.current || unmountedRef.current) return;
        try {
          if (!playingRef.current) {
            volumeRef.current = 0;
            await sound.setVolumeAsync(0);
            await sound.playAsync();
            playingRef.current = true;
          }
          fadeTo(sound, AMBIENT_VOLUME, FADE_IN_MS);
        } catch {
          // audio is a bonus; stay silent on failure
        }
      });
    } else if (soundRef.current && playingRef.current) {
      const sound = soundRef.current;
      fadeTo(sound, 0, FADE_OUT_MS, () => {
        if (wantedRef.current) return;
        playingRef.current = false;
        sound.pauseAsync().catch(() => {});
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  useEffect(
    () => () => {
      unmountedRef.current = true;
      stopFade();
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    },
    []
  );
}

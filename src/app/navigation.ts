import { useCallback, useState } from 'react';
import { StoredWalk } from '../storage/WalkRepository';

/**
 * Every full-screen destination behind the first-launch flow and the
 * celebration overlay (those two are resolved separately in App.tsx and always
 * win). 'map' is the live map / idle map; everything else returns to the
 * Doorstep when dismissed, except Territories, which was opened from the map
 * and returns there.
 */
export type Screen =
  | 'doorstep'
  | 'map'
  | 'territories'
  | 'history'
  | 'den'
  | 'debugLog'
  | 'settings'
  | 'stats'
  | 'logMissedWalk';

/** Where a screen's close/dismiss handler lands. */
export function screenAfterClose(screen: Screen): Screen {
  return screen === 'territories' ? 'map' : 'doorstep';
}

/**
 * Key for the FadeSlideIn wrapper, or null for screens that must NOT be
 * wrapped. FadeSlideIn rule: Android WebViews inside an animating-opacity
 * parent can render blank. Never wrap a screen that hosts a WebView (MapView,
 * WalkPortraitScreen, Doorstep/Territories via TerritoryPortrait) in
 * FadeSlideIn. DoorstepScreen fades only its non-portrait children itself.
 */
export function screenKey(screen: Screen): string | null {
  switch (screen) {
    case 'history':
      return 'history';
    case 'den':
      return 'den';
    case 'debugLog':
      return 'debug-log';
    case 'settings':
      return 'settings';
    case 'stats':
      return 'stats';
    case 'logMissedWalk':
      return 'log-missed-walk';
    case 'doorstep':
    case 'map':
    case 'territories':
      return null;
  }
}

export interface Navigation {
  screen: Screen;
  /**
   * The Walk Portrait, rendered above the history list while set (the screen
   * stays 'history' underneath, so dismissing it returns to the history list).
   * It hosts a WebView, so it is never FadeSlideIn-wrapped.
   */
  viewingWalk: StoredWalk | null;
  goTo: (screen: Screen) => void;
  /** Dismiss the current screen to its parent per screenAfterClose. */
  close: () => void;
  goDoorstep: () => void;
  viewWalk: (walk: StoredWalk | null) => void;
}

export function useNavigation(): Navigation {
  // The Doorstep is the app's persistent home screen: shown at cold start and
  // returned to from every other screen's dismiss handler.
  const [screen, setScreen] = useState<Screen>('doorstep');
  const [viewingWalk, setViewingWalk] = useState<StoredWalk | null>(null);
  // A Walk Portrait only lives inside History: leaving History by any route
  // (notification tap, Doorstep, close) drops the viewed walk so History never
  // reopens on a stale Portrait.
  const goTo = useCallback((next: Screen) => {
    if (next !== 'history') setViewingWalk(null);
    setScreen(next);
  }, []);
  const goDoorstep = useCallback(() => {
    setViewingWalk(null);
    setScreen('doorstep');
  }, []);
  const close = useCallback(() => {
    setViewingWalk(null);
    setScreen((current) => screenAfterClose(current));
  }, []);
  return { screen, viewingWalk, goTo, close, goDoorstep, viewWalk: setViewingWalk };
}

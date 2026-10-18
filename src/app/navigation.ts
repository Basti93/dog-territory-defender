import { useCallback, useRef, useState } from 'react';
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
    case 'debugLog':
      return 'debug-log';
    case 'settings':
      return 'settings';
    case 'stats':
      return 'stats';
    case 'logMissedWalk':
      return 'log-missed-walk';
    case 'doorstep':
    case 'den':
    case 'map':
    case 'territories':
      return null;
  }
}

/** How many previous screens "back" remembers; the oldest fall off (the Doorstep fallback covers an empty stack). */
export const MAX_BACK_STACK = 10;

/** The current screen plus the screens "back" returns to (oldest first, the last entry is the one just left). */
export interface NavState {
  screen: Screen;
  stack: Screen[];
}

export const HOME_NAV_STATE: NavState = { screen: 'doorstep', stack: [] };

/** goTo: push the current screen. Going to the current screen is a no-op; going to the Doorstep clears the stack. */
export function navPush(state: NavState, next: Screen): NavState {
  if (next === 'doorstep') return HOME_NAV_STATE;
  if (next === state.screen) return state;
  const top = state.stack[state.stack.length - 1];
  // Dedupe consecutive entries (A -> B -> A -> B would otherwise grow the stack with the same neighbours).
  const pushed = top === state.screen ? state.stack : [...state.stack, state.screen];
  return { screen: next, stack: pushed.slice(-MAX_BACK_STACK) };
}

/**
 * close: today's semantics (screenAfterClose). The stack is unwound to where the target sits in it, so a later
 * back does not walk through screens the player already left.
 */
export function navClose(state: NavState): NavState {
  const target = screenAfterClose(state.screen);
  if (target === 'doorstep') return HOME_NAV_STATE;
  const at = state.stack.lastIndexOf(target);
  return { screen: target, stack: at === -1 ? state.stack : state.stack.slice(0, at) };
}

/** back: pop to the real previous screen. Null on the Doorstep (nothing to go back to). An empty stack falls back to close. */
export function navBack(state: NavState): NavState | null {
  if (state.screen === 'doorstep') return null;
  if (state.stack.length === 0) return navClose(state);
  const stack = state.stack.slice(0, -1);
  const screen = state.stack[state.stack.length - 1];
  return screen === 'doorstep' ? HOME_NAV_STATE : { screen, stack };
}

export interface Navigation {
  screen: Screen;
  /**
   * The Walk Portrait, rendered above the history list while set (the screen
   * stays 'history' underneath, so dismissing it returns to the history list).
   * It hosts a WebView, so it is never FadeSlideIn-wrapped.
   */
  viewingWalk: StoredWalk | null;
  /** Open a screen; "back" returns to the one it was opened from. */
  goTo: (screen: Screen) => void;
  /** Dismiss the current screen to its parent per screenAfterClose. */
  close: () => void;
  /** Pop to the previous screen. Returns false (and does nothing) when already on the Doorstep. */
  back: () => boolean;
  /** Back to the Doorstep and forget the history. */
  goDoorstep: () => void;
  viewWalk: (walk: StoredWalk | null) => void;
}

export function useNavigation(): Navigation {
  // The Doorstep is the app's persistent home screen: shown at cold start and
  // returned to from every other screen's dismiss handler.
  const [navState, setNavState] = useState<NavState>(HOME_NAV_STATE);
  // Mirror of the state so back() can answer synchronously (the hardware back listener needs a boolean).
  const stateRef = useRef(navState);
  const [viewingWalk, setViewingWalk] = useState<StoredWalk | null>(null);
  const apply = useCallback((next: NavState) => {
    stateRef.current = next;
    setNavState(next);
  }, []);
  // A Walk Portrait only lives inside History: leaving History by any route
  // (notification tap, Doorstep, close) drops the viewed walk so History never
  // reopens on a stale Portrait.
  const goTo = useCallback(
    (next: Screen) => {
      if (next !== 'history') setViewingWalk(null);
      apply(navPush(stateRef.current, next));
    },
    [apply]
  );
  const goDoorstep = useCallback(() => {
    setViewingWalk(null);
    apply(HOME_NAV_STATE);
  }, [apply]);
  const close = useCallback(() => {
    setViewingWalk(null);
    apply(navClose(stateRef.current));
  }, [apply]);
  const back = useCallback(() => {
    const next = navBack(stateRef.current);
    if (!next) return false;
    setViewingWalk(null);
    apply(next);
    return true;
  }, [apply]);
  return { screen: navState.screen, viewingWalk, goTo, close, back, goDoorstep, viewWalk: setViewingWalk };
}

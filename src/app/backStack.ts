import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import type { Screen } from './navigation';

/**
 * Back-action registry. Whatever is "on top" of the player's attention (a panel,
 * an in-screen subview, the screen stack) registers a handler while it is
 * active; the one hardware back listener (useHardwareBack, installed in
 * App.tsx) asks the handlers newest-first. The first one that does not return
 * `false` has handled the press. If none does, the press is not consumed and
 * Android does its default (home screen: app goes to the background).
 *
 * Order = order of activation, so an overlay opened later always beats what
 * lies under it. The App-level handler registers first (App mounts before any
 * child renders), so it is the bottom layer.
 *
 * RN `Modal`s on Android swallow back themselves (their onRequestClose runs and
 * BackHandler never fires), so they need no entry here.
 */
export type BackAction = () => boolean | void;

interface Entry {
  readonly run: BackAction;
}

const entries: Entry[] = [];

/** Add a handler on top. Returns the function that removes it again. */
export function registerBackAction(run: BackAction): () => void {
  const entry: Entry = { run };
  entries.push(entry);
  return () => {
    const at = entries.indexOf(entry);
    if (at !== -1) entries.splice(at, 1);
  };
}

/** Ask the handlers newest-first. True = something handled it (back is consumed). */
export function runBackActions(): boolean {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].run() !== false) return true;
  }
  return false;
}

/** Test helper: forget every handler. */
export function resetBackActions(): void {
  entries.length = 0;
}

/**
 * Register `onBack` while `active`. Return `false` from it to pass the press on
 * to the next handler down; anything else (true, void) means "handled". The
 * latest `onBack` is always used without re-registering, so rendering never
 * changes the handler's place in the order.
 */
export function useBackAction(active: boolean, onBack: BackAction): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    return registerBackAction(() => latest.current());
  }, [active]);
}

/** The single Android hardware-back listener. Call once, in App. A no-op on iOS (no hardware back). */
export function useHardwareBack(): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', runBackActions);
    return () => subscription.remove();
  }, []);
}

/** What the App-level (bottom) back handler should do. Pure so the precedence is unit-testable. */
export type AppBackDecision =
  | 'default' // not ours: Android backgrounds the app
  | 'consume' // swallow the press, change nothing
  | 'doorstep'
  | 'pop';

export function resolveAppBack(ctx: {
  /** First-launch flow finished (cards, name, look, primer). */
  firstLaunchDone: boolean;
  /** An own or partner Heimkehr is playing: a one-off reward moment, not skippable by back. */
  homecomingPlaying: boolean;
  screen: Screen;
  walkActive: boolean;
}): AppBackDecision {
  if (!ctx.firstLaunchDone) return 'default';
  if (ctx.homecomingPlaying) return 'consume';
  // The live map leaves to the scene; the walk itself keeps running (back never finishes or cancels it).
  if (ctx.screen === 'map' && ctx.walkActive) return 'doorstep';
  if (ctx.screen === 'doorstep') return 'default';
  return 'pop';
}

// Pure decision for which first-launch screen to show. Order on a fresh
// install: onboarding cards -> dog name -> look picker -> permission primer
// -> Doorstep. Existing installs (a dog name already saved) skip the cards and
// the primer entirely; they only ever see the look picker right after naming.

export type FirstLaunchStep = 'loading' | 'onboarding' | 'dogName' | 'look' | 'primer' | 'done';

export interface FirstLaunchState {
  /** Den state + settings have been read. Until then nothing is gated. */
  loaded: boolean;
  /** Saved dog name, or null before the player has named their dog. */
  dogName: string | null;
  /** Persisted flag: onboarding + primer finished on some earlier launch. */
  onboardingDone: boolean;
  /** True once the player finished (or skipped) the cards during this launch. */
  cardsFinished: boolean;
  /** True when the look picker is up (set right after naming). */
  choosingLook: boolean;
  /** True when the primer is queued (set after the look picker, only if the cards ran this launch). */
  primerPending: boolean;
}

export function resolveFirstLaunchStep(s: FirstLaunchState): FirstLaunchStep {
  if (!s.loaded) return 'loading';
  if (s.dogName === null) {
    // Existing installs always have a name, so `onboardingDone` only matters here.
    return s.onboardingDone || s.cardsFinished ? 'dogName' : 'onboarding';
  }
  if (s.choosingLook) return 'look';
  if (s.primerPending) return 'primer';
  return 'done';
}

/** The primer runs only on the launch that also showed the cards (fresh install, not yet done). */
export function shouldRunOnboardingThisLaunch(dogName: string | null, onboardingDone: boolean): boolean {
  return dogName === null && !onboardingDone;
}

import { FirstLaunchState, resolveFirstLaunchStep, shouldRunOnboardingThisLaunch } from '../firstLaunch';

const base: FirstLaunchState = {
  loaded: true,
  dogName: null,
  onboardingDone: false,
  cardsFinished: false,
  choosingLook: false,
  primerPending: false,
};
const at = (patch: Partial<FirstLaunchState>) => resolveFirstLaunchStep({ ...base, ...patch });

describe('resolveFirstLaunchStep', () => {
  it('gates nothing until state is loaded', () => {
    expect(at({ loaded: false })).toBe('loading');
  });

  it('fresh install walks onboarding -> dogName -> look -> primer -> done', () => {
    expect(at({})).toBe('onboarding');
    expect(at({ cardsFinished: true })).toBe('dogName');
    expect(at({ cardsFinished: true, dogName: 'Rex', choosingLook: true, primerPending: true })).toBe('look');
    expect(at({ cardsFinished: true, dogName: 'Rex', primerPending: true })).toBe('primer');
    expect(at({ cardsFinished: true, dogName: 'Rex' })).toBe('done');
  });

  it('existing user (dog name saved) never sees onboarding or the primer', () => {
    expect(at({ dogName: 'Rex' })).toBe('done');
    expect(at({ dogName: 'Rex', onboardingDone: true })).toBe('done');
  });

  it('existing user who somehow lacks the done flag still skips onboarding', () => {
    expect(at({ dogName: 'Rex', onboardingDone: false })).toBe('done');
  });

  it('onboardingDone with no dog name goes straight to the name prompt', () => {
    expect(at({ onboardingDone: true })).toBe('dogName');
  });

  it('mid-flow: the look picker wins over a queued primer', () => {
    expect(at({ dogName: 'Rex', choosingLook: true, primerPending: true })).toBe('look');
  });
});

describe('shouldRunOnboardingThisLaunch', () => {
  it('is true only for a fresh install', () => {
    expect(shouldRunOnboardingThisLaunch(null, false)).toBe(true);
    expect(shouldRunOnboardingThisLaunch(null, true)).toBe(false);
    expect(shouldRunOnboardingThisLaunch('Rex', false)).toBe(false);
  });
});

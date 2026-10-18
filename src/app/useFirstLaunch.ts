import { useEffect, useState } from 'react';
import { FirstLaunchStep, resolveFirstLaunchStep, shouldRunOnboardingThisLaunch } from '../components/onboarding';
import { requestLocationPermission } from '../utils/gps';
import { log } from '../utils/log';
import { t } from '../i18n';
import { AppRepositories } from './repositories';

/**
 * First-launch flow (onboarding cards -> dog name -> look -> permission
 * primer), decided by the pure resolveFirstLaunchStep. `loaded` flips with
 * dogName in applyLoaded. `onboardingThisLaunch` is true only on a fresh
 * install; it defers the launch-time location request to the primer.
 */
export function useFirstLaunch(
  repos: AppRepositories,
  dog: { dogName: string | null; setDogName: (name: string | null) => void },
  onLocationDenied: (message: string) => void
) {
  const { denEconomyRepository, settingsRepository } = repos;
  const { dogName, setDogName } = dog;
  const [loaded, setLoaded] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [onboardingThisLaunch, setOnboardingThisLaunch] = useState(false);
  const [cardsFinished, setCardsFinished] = useState(false);
  // `choosingLook` is true only right after a brand-new player names their
  // dog; existing players are never gated.
  const [choosingLook, setChoosingLook] = useState(false);
  const [primerPending, setPrimerPending] = useState(false);

  // Initialize location permission. On a fresh install the permission primer
  // asks instead (after the player has been told why), so this waits for the
  // first-launch state and skips that case.
  useEffect(() => {
    if (!loaded || onboardingThisLaunch) return;
    (async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) onLocationDenied(t('app.locationDenied'));
    })();
  }, [loaded, onboardingThisLaunch]); // eslint-disable-line react-hooks/exhaustive-deps

  const step: FirstLaunchStep = resolveFirstLaunchStep({ loaded, dogName, onboardingDone, cardsFinished, choosingLook, primerPending });

  /** Called once by the launch routine with what it read from storage; the setters batch together. */
  const applyLoaded = (saved: { dogName: string | null; onboardingDone: boolean }) => {
    setDogName(saved.dogName);
    setOnboardingDone(saved.onboardingDone);
    setOnboardingThisLaunch(shouldRunOnboardingThisLaunch(saved.dogName, saved.onboardingDone));
    setLoaded(true);
  };

  const submitDogName = async (name: string) => {
    const state = await denEconomyRepository.getState();
    await denEconomyRepository.saveState({ ...state, dogName: name });
    setDogName(name);
    setChoosingLook(true);
  };

  // Look picker finished or skipped: fresh installs continue to the permission
  // primer, existing players go straight on.
  const finishLookStep = () => {
    setChoosingLook(false);
    if (onboardingThisLaunch) setPrimerPending(true);
  };

  const finishPrimer = () => {
    setPrimerPending(false);
    setOnboardingDone(true);
    settingsRepository.saveOnboardingDone(true).catch((err) => log('SETTINGS_ONBOARDING_SAVE_ERROR', { error: String(err) }));
  };

  const primerRequestLocation = async () => {
    const granted = await requestLocationPermission();
    if (!granted) onLocationDenied(t('app.locationDenied'));
    return granted;
  };

  return {
    step,
    dogName,
    applyLoaded,
    finishCards: () => setCardsFinished(true),
    submitDogName,
    finishLookStep,
    finishPrimer,
    primerRequestLocation,
  };
}

import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { getDeviceLocale, LocalePreference, resolveLocale, setLocale, useLocale } from '../i18n';
import { log } from '../utils/log';
import { useAppFonts } from '../ui';
import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { AppRepositories, localePreferenceLoaded } from './repositories';

/**
 * Fonts + language gate, splash hide, and the language switch. While `ready`
 * is false App renders nothing, so no screen flashes the system font or the
 * wrong language.
 */
export function useAppReady(repos: AppRepositories) {
  const { settingsRepository, walkRepository, notificationRepository } = repos;
  const { loaded: fontsLoaded } = useAppFonts();
  useLocale(); // re-render every screen when the language switches
  const [localePreference, setLocalePreference] = useState<LocalePreference>('system');
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    localePreferenceLoaded.then((pref) => {
      setLocalePreference(pref);
      setLocaleReady(true);
    });
  }, []);
  useEffect(() => {
    if (fontsLoaded && localeReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, localeReady]);

  const changeLocalePreference = async (pref: LocalePreference) => {
    setLocalePreference(pref);
    setLocale(resolveLocale(pref, getDeviceLocale()));
    try {
      await settingsRepository.saveLocalePreference(pref);
    } catch (err) {
      log('SETTINGS_LOCALE_SAVE_ERROR', { error: String(err) });
    }
    // Re-plan so already-scheduled reminders pick up the new language.
    await checkAndScheduleWalkReminder({ walkRepository, notificationRepository }).catch((err) =>
      log('WALK_REMINDER_CHECK_ERROR', { error: String(err) })
    );
  };

  return { ready: fontsLoaded && localeReady, localePreference, changeLocalePreference };
}

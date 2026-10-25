import { createSqliteWalkRepository } from '../storage/sqliteWalkRepository';
import { createSqliteHomeRangeRepository } from '../storage/sqliteHomeRangeRepository';
import { createSqliteTerritoryRepository } from '../storage/sqliteTerritoryRepository';
import { createSqliteDenEconomyRepository } from '../storage/sqliteDenEconomyRepository';
import { createSqlitePersonalStatsRepository } from '../storage/sqlitePersonalStatsRepository';
import { createSqliteNotificationRepository } from '../storage/sqliteNotificationRepository';
import { createSqliteBuddyAppearanceRepository } from '../storage/sqliteBuddyAppearanceRepository';
import { createSqliteSettingsRepository } from '../storage/sqliteSettingsRepository';
import { createSqliteSyncRepository } from '../storage/sqliteSyncRepository';
import { createSqliteActiveWalkRepository } from '../storage/sqliteActiveWalkRepository';
import { createSqliteCornerRepository } from '../storage/sqliteCornerRepository';
import { runHomeRangeMigrationIfNeeded } from '../storage/homeRangeMigration';
import { repairLocalWalks } from '../walks/repairLocalWalks';
import { runTerritoryFoldIfNeeded, runTerritoryMigrationIfNeeded } from '../storage/territoryMigration';
import { loadFeedbackPrefsAtStartup } from '../feedback/feedbackRepository';
import { resolveTerritoryName } from '../utils/streetLookup';
import { withTimeout } from '../utils/withTimeout';
import { getDeviceLocale, LocalePreference, resolveLocale, setLocale } from '../i18n';

export interface AppRepositories {
  walkRepository: ReturnType<typeof createSqliteWalkRepository>;
  homeRangeRepository: ReturnType<typeof createSqliteHomeRangeRepository>;
  territoryRepository: ReturnType<typeof createSqliteTerritoryRepository>;
  denEconomyRepository: ReturnType<typeof createSqliteDenEconomyRepository>;
  personalStatsRepository: ReturnType<typeof createSqlitePersonalStatsRepository>;
  notificationRepository: ReturnType<typeof createSqliteNotificationRepository>;
  buddyAppearanceRepository: ReturnType<typeof createSqliteBuddyAppearanceRepository>;
  settingsRepository: ReturnType<typeof createSqliteSettingsRepository>;
  syncRepository: ReturnType<typeof createSqliteSyncRepository>;
  activeWalkRepository: ReturnType<typeof createSqliteActiveWalkRepository>;
  cornerRepository: ReturnType<typeof createSqliteCornerRepository>;
}

export function createAppRepositories(): AppRepositories {
  return {
    walkRepository: createSqliteWalkRepository(),
    homeRangeRepository: createSqliteHomeRangeRepository(),
    territoryRepository: createSqliteTerritoryRepository(),
    denEconomyRepository: createSqliteDenEconomyRepository(),
    personalStatsRepository: createSqlitePersonalStatsRepository(),
    notificationRepository: createSqliteNotificationRepository(),
    buddyAppearanceRepository: createSqliteBuddyAppearanceRepository(),
    settingsRepository: createSqliteSettingsRepository(),
    syncRepository: createSqliteSyncRepository(),
    activeWalkRepository: createSqliteActiveWalkRepository(),
    cornerRepository: createSqliteCornerRepository(),
  };
}

// Import-time side effects, kept exactly as App.tsx had them at module scope.
// They run when this module is first imported (before any render) so the
// feedback prefs and the saved language are loading as early as possible.
export const repos: AppRepositories = createAppRepositories();
loadFeedbackPrefsAtStartup();

// Loads and applies the saved language as early as possible (module import
// time). Everything that produces copy at launch (greeting, away-strip lines,
// territory names, notifications) awaits this first, and the render gate
// waits for it too, so no screen ever flashes in the wrong language.
// Bounded: a wedged database must fall back to the system language, not leave the app blank (no `ready`).
export const LOCALE_LOAD_TIMEOUT_MS = 5_000;
export const localePreferenceLoaded: Promise<LocalePreference> = withTimeout(
  repos.settingsRepository.getLocalePreference(),
  LOCALE_LOAD_TIMEOUT_MS,
  'locale preference'
)
  .catch((): LocalePreference => 'system')
  .then((pref) => {
    setLocale(resolveLocale(pref, getDeviceLocale()));
    return pref;
  });

/**
 * One-time backfill of every previously saved tracked walk into the Home
 * Range grid, then (only once that's done, since it needs a populated Range to
 * cluster, docs/decisions/territories.md task 3.3) the one-time
 * Territory partition backfill. Both are idempotent (guarded by their own
 * DenEconomyState flags), safe to call on every app load.
 */
export function runStartupMigrations(r: AppRepositories): Promise<void> {
  return runHomeRangeMigrationIfNeeded({
    walkRepository: r.walkRepository,
    homeRangeRepository: r.homeRangeRepository,
    denEconomyRepository: r.denEconomyRepository,
  }).then(() =>
    runTerritoryMigrationIfNeeded({
      homeRangeRepository: r.homeRangeRepository,
      territoryRepository: r.territoryRepository,
      denEconomyRepository: r.denEconomyRepository,
      resolveTerritoryName,
    })
  ).then(async () => {
    // Joined households fold on the server and receive the result with the next snapshot.
    if (await r.settingsRepository.getSyncIdentity()) return;
    await runTerritoryFoldIfNeeded({ homeRangeRepository: r.homeRangeRepository, territoryRepository: r.territoryRepository });
  }).then(async () => {
    // Statistics hygiene: walks the server does not know get the same stats view the server computes (walkRepair.ts).
    await repairLocalWalks(r.walkRepository);
  });
}

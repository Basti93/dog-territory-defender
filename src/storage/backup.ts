// Backup & Restore (data safety only — no game mechanics). One human-readable
// JSON file holding everything the repositories persist. Pure with respect to
// the file system: backupIO.ts does the sharing/picking, this file only maps
// repositories <-> BackupFile so it can be tested against the in-memory fakes.

import { BuddyAppearance, normalizeAppearance } from '../buddy/buddyAppearance';
import { DenEconomyState } from '../economy/denEconomy';
import { PersonalStatsState } from '../economy/personalStats';
import { NotificationBookkeepingState } from '../notifications/notificationDecision';
import { LocalePreference } from '../i18n/types';
import { BuddyAppearanceRepository } from './BuddyAppearanceRepository';
import { DenEconomyRepository } from './DenEconomyRepository';
import { FeedbackPrefs, FeedbackPrefsRepository, normalizeFeedbackPrefs } from './FeedbackPrefsRepository';
import { Cell, HomeRangeRepository, NewGroundEvent } from './HomeRangeRepository';
import { NotificationRepository } from './NotificationRepository';
import { PersonalStatsRepository, UnlockedAchievement } from './PersonalStatsRepository';
import { normalizeLocalePreference, SettingsRepository } from './SettingsRepository';
import { Territory, TerritoryRepository } from './TerritoryRepository';
import { StoredWalk, WalkRepository } from './WalkRepository';
import { Walk } from '../types';

export const BACKUP_APP_MARKER = 'dog-territory-defender';
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupRepositories {
  walks: WalkRepository;
  denEconomy: DenEconomyRepository;
  personalStats: PersonalStatsRepository;
  notification: NotificationRepository;
  homeRange: HomeRangeRepository;
  territories: TerritoryRepository;
  buddyAppearance: BuddyAppearanceRepository;
  settings: SettingsRepository;
  feedbackPrefs: FeedbackPrefsRepository;
}

export interface BackupFile {
  schemaVersion: number;
  exportedAt: string; // ISO timestamp
  app: typeof BACKUP_APP_MARKER;
  data: {
    walks: Walk[];
    denEconomy: DenEconomyState;
    personalStats: { state: PersonalStatsState; achievements: UnlockedAchievement[] };
    notification: NotificationBookkeepingState;
    homeRange: { cells: Cell[]; newGroundEvent: NewGroundEvent | null };
    territories: Territory[];
    buddyAppearance: { chosen: boolean; appearance: BuddyAppearance };
    settings: { localePreference: LocalePreference; onboardingDone: boolean };
    feedbackPrefs: FeedbackPrefs;
  };
}

export interface BackupCounts {
  walks: number;
  cells: number;
  territories: number;
  achievements: number;
}

export async function exportBackup(repos: BackupRepositories): Promise<BackupFile> {
  const [walks, denEconomy, personalStats, achievements, notification, cells, newGroundEvent, territories, chosen, appearance, localePreference, onboardingDone, feedbackPrefs] =
    await Promise.all([
      repos.walks.getWalks(),
      repos.denEconomy.getState(),
      repos.personalStats.getState(),
      repos.personalStats.getUnlockedAchievements(),
      repos.notification.getState(),
      repos.homeRange.getCells(),
      repos.homeRange.getLastNewGroundEvent(),
      repos.territories.getTerritories(),
      repos.buddyAppearance.hasChosen(),
      repos.buddyAppearance.getAppearance(),
      repos.settings.getLocalePreference(),
      repos.settings.getOnboardingDone(),
      repos.feedbackPrefs.getPrefs(),
    ]);

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: BACKUP_APP_MARKER,
    data: {
      // syncedAt is server-sync bookkeeping that doesn't exist yet; not worth carrying.
      walks: walks.map(({ syncedAt: _syncedAt, ...walk }: StoredWalk) => walk),
      denEconomy,
      personalStats: { state: personalStats, achievements },
      notification,
      homeRange: { cells, newGroundEvent },
      territories,
      buddyAppearance: { chosen, appearance },
      settings: { localePreference, onboardingDone },
      feedbackPrefs,
    },
  };
}

// ---------------------------------------------------------------- validation

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Shape check only (types of the parts we iterate or rely on) — not deep game-rule validation. */
export function validateBackup(json: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(json)) {
    return { ok: false, errors: ['Backup is not a JSON object'] };
  }
  if (json.app !== BACKUP_APP_MARKER) {
    errors.push('Not a Tails Up backup (app marker missing or wrong)');
  }
  if (typeof json.schemaVersion !== 'number') {
    errors.push('schemaVersion missing');
  } else if (json.schemaVersion > BACKUP_SCHEMA_VERSION) {
    errors.push(`Backup was made by a newer app version (schema ${json.schemaVersion}, this app understands ${BACKUP_SCHEMA_VERSION})`);
  } else if (json.schemaVersion < 1) {
    errors.push(`Unsupported schemaVersion ${json.schemaVersion}`);
  }
  if (typeof json.exportedAt !== 'string') {
    errors.push('exportedAt missing');
  }

  const data = json.data;
  if (!isObject(data)) {
    errors.push('data section missing');
    return { ok: false, errors };
  }

  const requireArray = (value: unknown, path: string) => {
    if (!Array.isArray(value)) errors.push(`${path} must be an array`);
  };
  const requireObject = (value: unknown, path: string) => {
    if (!isObject(value)) errors.push(`${path} must be an object`);
  };

  requireArray(data.walks, 'data.walks');
  if (Array.isArray(data.walks)) {
    data.walks.forEach((w, i) => {
      if (!isObject(w) || typeof w.id !== 'string' || typeof w.startTime !== 'number' || !Array.isArray(w.locations)) {
        errors.push(`data.walks[${i}] is not a valid walk`);
      }
    });
  }
  requireObject(data.denEconomy, 'data.denEconomy');
  requireObject(data.notification, 'data.notification');
  requireObject(data.feedbackPrefs, 'data.feedbackPrefs');
  requireObject(data.settings, 'data.settings');
  requireObject(data.buddyAppearance, 'data.buddyAppearance');
  requireObject(data.personalStats, 'data.personalStats');
  if (isObject(data.personalStats)) {
    requireObject(data.personalStats.state, 'data.personalStats.state');
    requireArray(data.personalStats.achievements, 'data.personalStats.achievements');
  }
  requireObject(data.homeRange, 'data.homeRange');
  if (isObject(data.homeRange)) {
    requireArray(data.homeRange.cells, 'data.homeRange.cells');
    if (Array.isArray(data.homeRange.cells)) {
      data.homeRange.cells.forEach((c, i) => {
        if (!isObject(c) || typeof c.ix !== 'number' || typeof c.iy !== 'number' || typeof c.visits !== 'number') {
          errors.push(`data.homeRange.cells[${i}] is not a valid cell`);
        }
      });
    }
    const ev = data.homeRange.newGroundEvent;
    if (ev !== null && ev !== undefined && !isObject(ev)) {
      errors.push('data.homeRange.newGroundEvent must be an object or null');
    }
  }
  requireArray(data.territories, 'data.territories');
  if (Array.isArray(data.territories)) {
    data.territories.forEach((t, i) => {
      if (!isObject(t) || typeof t.id !== 'string' || typeof t.name !== 'string') {
        errors.push(`data.territories[${i}] is not a valid territory`);
      }
    });
  }

  // Cap the noise: a badly broken file shouldn't produce thousands of lines.
  return { ok: errors.length === 0, errors: errors.slice(0, 20) };
}

// -------------------------------------------------------------------- import

/**
 * Replaces everything with the backup's contents. Best-effort ordering, not a
 * cross-repository transaction (each repo owns its own connection): the
 * validator runs first so a bad file never touches data; within a repo,
 * the sqlite replaceAll methods run in a transaction.
 */
export async function importBackup(
  repos: BackupRepositories,
  file: unknown,
  _options: { mode: 'replace' } = { mode: 'replace' }
): Promise<BackupCounts> {
  const validation = validateBackup(file);
  if (!validation.ok) {
    throw new Error(`Invalid backup: ${validation.errors.join('; ')}`);
  }
  const { data } = file as BackupFile;

  // Order: small tables first, big ones last, so a failure midway is most
  // likely to leave the large (and most valuable) data untouched. Each repo is
  // atomic on its own, but atomicity ACROSS repos is not guaranteed.
  await repos.settings.saveLocalePreference(normalizeLocalePreference(data.settings.localePreference));
  await repos.settings.saveOnboardingDone(data.settings.onboardingDone === true);
  await repos.feedbackPrefs.savePrefs(normalizeFeedbackPrefs(data.feedbackPrefs));
  if (data.buddyAppearance.chosen) {
    await repos.buddyAppearance.saveAppearance(normalizeAppearance(data.buddyAppearance.appearance));
  } else {
    await repos.buddyAppearance.reset();
  }
  await repos.notification.saveState(data.notification);
  // lastTickAt = now: a restored backup must not grant passive accrual for the
  // time since it was exported, nor inflate lifetime stats.
  await repos.denEconomy.saveState({ ...data.denEconomy, lastTickAt: Date.now() });
  await repos.personalStats.saveState(data.personalStats.state);
  await repos.personalStats.replaceUnlockedAchievements(data.personalStats.achievements);

  // Territories before cells so every cell.territoryId already exists.
  await repos.territories.replaceAll(data.territories);
  await repos.homeRange.replaceAll(data.homeRange.cells, data.homeRange.newGroundEvent ?? null);
  await repos.walks.replaceAll(data.walks);

  return {
    walks: data.walks.length,
    cells: data.homeRange.cells.length,
    territories: data.territories.length,
    achievements: data.personalStats.achievements.length,
  };
}

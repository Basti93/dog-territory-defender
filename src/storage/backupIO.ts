// Device-facing half of Backup & Restore: writes/reads the JSON file and talks
// to the share sheet / document picker. Uses expo-file-system's new File/Paths
// API (same as DebugLogScreen's share flow). The data mapping itself lives in
// backup.ts. Not unit-tested (native modules); see the device checklist in the
// change notes.

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { checkAndScheduleWalkReminder } from '../notifications/walkReminder';
import { BACKUP_SCHEMA_VERSION, BackupCounts, BackupRepositories, exportBackup, importBackup, validateBackup } from './backup';
import { createSqliteBuddyAppearanceRepository } from './sqliteBuddyAppearanceRepository';
import { createSqliteDenEconomyRepository } from './sqliteDenEconomyRepository';
import { createSqliteFeedbackPrefsRepository } from './sqliteFeedbackPrefsRepository';
import { createSqliteHomeRangeRepository } from './sqliteHomeRangeRepository';
import { createSqliteNotificationRepository } from './sqliteNotificationRepository';
import { createSqlitePersonalStatsRepository } from './sqlitePersonalStatsRepository';
import { createSqliteSettingsRepository } from './sqliteSettingsRepository';
import { createSqliteTerritoryRepository } from './sqliteTerritoryRepository';
import { createSqliteWalkRepository } from './sqliteWalkRepository';

// Created lazily: these open the same sqlite file App.tsx's repositories use,
// so Settings needs no extra props. Safe because repos hold no cached state.
let cachedRepos: BackupRepositories | null = null;
function defaultRepos(): BackupRepositories {
  if (!cachedRepos) {
    cachedRepos = {
      walks: createSqliteWalkRepository(),
      denEconomy: createSqliteDenEconomyRepository(),
      personalStats: createSqlitePersonalStatsRepository(),
      notification: createSqliteNotificationRepository(),
      homeRange: createSqliteHomeRangeRepository(),
      territories: createSqliteTerritoryRepository(),
      buddyAppearance: createSqliteBuddyAppearanceRepository(),
      settings: createSqliteSettingsRepository(),
      feedbackPrefs: createSqliteFeedbackPrefsRepository(),
    };
  }
  return cachedRepos;
}

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type ShareBackupResult = { shared: true; uri: string } | { shared: false; uri: string };

/** Writes the backup JSON to the cache dir and opens the share sheet. `shared: false` means no share sheet exists; the file is at `uri`. */
export async function shareBackup(): Promise<ShareBackupResult> {
  const backup = await exportBackup(defaultRepos());
  const file = new File(Paths.cache, `tails-up-backup-${todayStamp()}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(backup, null, 1));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
    return { shared: true, uri: file.uri };
  }
  return { shared: false, uri: file.uri };
}

export type PickAndImportResult =
  | { status: 'cancelled' }
  | { status: 'invalid'; reason: 'invalid' | 'newer-schema' | 'unreadable'; errors: string[] }
  | { status: 'imported'; counts: BackupCounts };

/** Lets the player pick a backup file; replaces ALL local data with it. Callers must confirm with the player first. */
export async function pickAndImportBackup(): Promise<PickAndImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'], // cloud providers often label .json as text/plain or octet-stream
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets?.[0]) {
    return { status: 'cancelled' };
  }

  const cacheFile = new File(picked.assets[0].uri);
  let json: unknown;
  try {
    json = JSON.parse(await cacheFile.text());
  } catch {
    return { status: 'invalid', reason: 'unreadable', errors: ['Not a readable JSON file'] };
  } finally {
    try {
      cacheFile.delete(); // best effort: the picker's cache copy holds all the player's data
    } catch {
      // ignore
    }
  }

  const validation = validateBackup(json);
  if (!validation.ok) {
    const newer =
      typeof json === 'object' && json !== null && typeof (json as { schemaVersion?: unknown }).schemaVersion === 'number' &&
      (json as { schemaVersion: number }).schemaVersion > BACKUP_SCHEMA_VERSION;
    return { status: 'invalid', reason: newer ? 'newer-schema' : 'invalid', errors: validation.errors };
  }
  const repos = defaultRepos();
  const counts = await importBackup(repos, json, { mode: 'replace' });
  // Reminder slots came from the backup: replan so the OS schedule matches (best effort).
  await checkAndScheduleWalkReminder({ walkRepository: repos.walks, notificationRepository: repos.notification }).catch(() => {});
  return { status: 'imported', counts };
}

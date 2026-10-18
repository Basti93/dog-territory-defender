import { defaultBuddyAppearance } from '../../buddy/buddyAppearance';
import { BACKUP_APP_MARKER, BackupRepositories, exportBackup, importBackup, validateBackup } from '../backup';
import { createInMemoryBuddyAppearanceRepository } from '../inMemoryBuddyAppearanceRepository';
import { createInMemoryDenEconomyRepository } from '../inMemoryDenEconomyRepository';
import { createInMemoryFeedbackPrefsRepository } from '../inMemoryFeedbackPrefsRepository';
import { createInMemoryHomeRangeRepository } from '../inMemoryHomeRangeRepository';
import { createInMemoryNotificationRepository } from '../inMemoryNotificationRepository';
import { createInMemoryPersonalStatsRepository } from '../inMemoryPersonalStatsRepository';
import { createInMemorySettingsRepository } from '../inMemorySettingsRepository';
import { createInMemoryTerritoryRepository } from '../inMemoryTerritoryRepository';
import { createInMemoryWalkRepository } from '../inMemoryWalkRepository';

function freshRepos(): BackupRepositories {
  return {
    walks: createInMemoryWalkRepository(),
    denEconomy: createInMemoryDenEconomyRepository(),
    personalStats: createInMemoryPersonalStatsRepository(),
    notification: createInMemoryNotificationRepository(),
    homeRange: createInMemoryHomeRangeRepository(),
    territories: createInMemoryTerritoryRepository(),
    buddyAppearance: createInMemoryBuddyAppearanceRepository(),
    settings: createInMemorySettingsRepository(),
    feedbackPrefs: createInMemoryFeedbackPrefsRepository(),
  };
}

async function populate(repos: BackupRepositories) {
  await repos.walks.saveWalk({
    id: 'w1',
    startTime: 1000,
    locations: [{ latitude: 52.5, longitude: 13.4, timestamp: 1000, accuracy: 5 }],
    closed: true,
    startSource: 'button',
    treatsEarned: 7,
  });
  const territoryId = await repos.territories.createTerritory('Hauptstraße', 500);
  await repos.territories.incrementTerritoryStats(territoryId, { walksIncrement: 3, treatsIncrement: 12 });
  await repos.homeRange.paintCells([
    { ix: 1, iy: 2, refreshedAt: 2000, tracked: true, territoryId },
    { ix: 3, iy: 4, refreshedAt: 3000, tracked: true, territoryId },
  ]);
  await repos.homeRange.recordNewGroundEvent(3000, ['1,2']);
  const den = await repos.denEconomy.getState();
  await repos.denEconomy.saveState({ ...den, treats: 42, dogName: 'Rex' });
  await repos.personalStats.unlockAchievements(['first-walk' as never], 1234);
  await repos.buddyAppearance.saveAppearance({ ...defaultBuddyAppearance(), coat: 'charcoal' });
  await repos.settings.saveLocalePreference('de');
  await repos.settings.saveOnboardingDone(true);
  await repos.feedbackPrefs.savePrefs({ sound: false, haptics: true });
  return territoryId;
}

describe('validateBackup', () => {
  it('accepts a real export', async () => {
    const repos = freshRepos();
    await populate(repos);
    const json = JSON.parse(JSON.stringify(await exportBackup(repos)));
    expect(validateBackup(json)).toEqual({ ok: true, errors: [] });
  });

  it('rejects non-objects, wrong app marker, newer schema, missing arrays', async () => {
    const good = JSON.parse(JSON.stringify(await exportBackup(freshRepos())));
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup([]).ok).toBe(false);
    expect(validateBackup({ ...good, app: 'something-else' }).ok).toBe(false);
    expect(validateBackup({ ...good, schemaVersion: 2 }).errors.join()).toMatch(/newer/);
    expect(validateBackup({ ...good, data: { ...good.data, walks: 'nope' } }).ok).toBe(false);
    expect(validateBackup({ ...good, data: { ...good.data, homeRange: { cells: {} } } }).ok).toBe(false);
    expect(validateBackup({ ...good, data: undefined }).ok).toBe(false);
  });
});

describe('export -> import round trip', () => {
  it('restores walks, cells, territories, appearance, settings and more into fresh repos', async () => {
    const source = freshRepos();
    const territoryId = await populate(source);
    const json = JSON.parse(JSON.stringify(await exportBackup(source)));
    expect(json.app).toBe(BACKUP_APP_MARKER);

    const target = freshRepos();
    // Pre-existing data must be replaced, not merged.
    await target.walks.saveWalk({ id: 'old', startTime: 1, locations: [], closed: false, startSource: 'button' });
    await target.territories.createTerritory('Old', 1);
    await target.homeRange.paintCells([{ ix: 99, iy: 99, refreshedAt: 5, tracked: true }]);

    const counts = await importBackup(target, json, { mode: 'replace' });
    expect(counts).toEqual({ walks: 1, cells: 2, territories: 1, achievements: 1 });

    expect((await target.walks.getWalks()).map((w) => w.id)).toEqual(['w1']);
    expect((await target.walks.getWalk('w1'))?.treatsEarned).toBe(7);
    expect(await target.territories.getTerritories()).toEqual(await source.territories.getTerritories());
    expect((await target.homeRange.getCells()).sort((a, b) => a.ix - b.ix)).toEqual(
      (await source.homeRange.getCells()).sort((a, b) => a.ix - b.ix)
    );
    expect(await target.homeRange.getCellsByTerritory(territoryId)).toHaveLength(2);
    expect(await target.homeRange.getLastNewGroundEvent()).toEqual({ occurredAt: 3000, cellIds: ['1,2'] });
    expect((await target.denEconomy.getState()).dogName).toBe('Rex');
    expect((await target.denEconomy.getState()).treats).toBe(42);
    expect(await target.personalStats.getUnlockedAchievements()).toEqual([{ id: 'first-walk', unlockedAt: 1234 }]);
    expect((await target.buddyAppearance.getAppearance()).coat).toBe('charcoal');
    expect(await target.settings.getLocalePreference()).toBe('de');
    expect(await target.settings.getOnboardingDone()).toBe(true);
    expect(await target.feedbackPrefs.getPrefs()).toEqual({ sound: false, haptics: true });
  });

  it('does not grant passive accrual for time since export (lastTickAt reset to now)', async () => {
    const source = freshRepos();
    const den = await source.denEconomy.getState();
    await source.denEconomy.saveState({ ...den, lastTickAt: 1000 });
    const json = JSON.parse(JSON.stringify(await exportBackup(source)));
    const before = Date.now();
    const target = freshRepos();
    await importBackup(target, json);
    expect((await target.denEconomy.getState()).lastTickAt).toBeGreaterThanOrEqual(before);
  });

  it('resets the target appearance when the backup never chose one', async () => {
    const target = freshRepos();
    await target.buddyAppearance.saveAppearance({ ...defaultBuddyAppearance(), coat: 'charcoal' });
    const json = JSON.parse(JSON.stringify(await exportBackup(freshRepos())));
    await importBackup(target, json);
    expect(await target.buddyAppearance.hasChosen()).toBe(false);
    expect(await target.buddyAppearance.getAppearance()).toEqual(defaultBuddyAppearance());
  });

  it('clears the New Ground event when the backup has none', async () => {
    const target = freshRepos();
    await target.homeRange.recordNewGroundEvent(1, []);
    const json = JSON.parse(JSON.stringify(await exportBackup(freshRepos())));
    await importBackup(target, json);
    expect(await target.homeRange.getLastNewGroundEvent()).toBeNull();
  });

  it('rejects a wrong app marker or newer schema without touching existing data', async () => {
    const target = freshRepos();
    await target.walks.saveWalk({ id: 'keep', startTime: 1, locations: [], closed: false, startSource: 'button' });
    const good = JSON.parse(JSON.stringify(await exportBackup(freshRepos())));

    await expect(importBackup(target, { ...good, app: 'other' })).rejects.toThrow(/Invalid backup/);
    await expect(importBackup(target, { ...good, schemaVersion: 99 })).rejects.toThrow(/newer/);
    expect((await target.walks.getWalks()).map((w) => w.id)).toEqual(['keep']);
  });
});

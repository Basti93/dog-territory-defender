import { createInMemoryHomeRangeRepository } from '../inMemoryHomeRangeRepository';
import { createInMemorySettingsRepository } from '../inMemorySettingsRepository';
import { createInMemorySyncRepository } from '../inMemorySyncRepository';
import { createInMemoryTerritoryRepository } from '../inMemoryTerritoryRepository';
import { createInMemoryWalkRepository } from '../inMemoryWalkRepository';
import { exportBackup } from '../backup';
import { createInMemoryBuddyAppearanceRepository } from '../inMemoryBuddyAppearanceRepository';
import { createInMemoryDenEconomyRepository } from '../inMemoryDenEconomyRepository';
import { createInMemoryFeedbackPrefsRepository } from '../inMemoryFeedbackPrefsRepository';
import { createInMemoryNotificationRepository } from '../inMemoryNotificationRepository';
import { createInMemoryPersonalStatsRepository } from '../inMemoryPersonalStatsRepository';

describe('SyncRepository contract (in-memory fake)', () => {
  it('returns live items oldest first, ignores a duplicate id, and removes acknowledged ones', async () => {
    const repo = createInMemorySyncRepository();
    await repo.enqueue({ id: 'b', kind: 'command', payload: { n: 2 }, createdAt: 20 });
    await repo.enqueue({ id: 'a', kind: 'walk.upload', payload: { n: 1 }, createdAt: 10 });
    await repo.enqueue({ id: 'a', kind: 'walk.upload', payload: { n: 99 }, createdAt: 11 });
    expect((await repo.getPending()).map((i) => i.id)).toEqual(['a', 'b']);
    expect((await repo.getPending())[0].payload).toEqual({ n: 1 });
    await repo.remove('a');
    expect((await repo.getPending()).map((i) => i.id)).toEqual(['b']);
  });

  it('records failures (attempts, error, next time) and keeps dead items out of the pending list', async () => {
    const repo = createInMemorySyncRepository();
    await repo.enqueue({ id: 'a', kind: 'command', payload: {}, createdAt: 1 });
    await repo.recordFailure('a', 'boom', 500, null);
    expect((await repo.getPending())[0]).toMatchObject({ attempts: 1, lastError: 'boom', nextAttemptAt: 500, deadAt: null });
    await repo.recordFailure('a', 'boom', 900, 900);
    expect(await repo.getPending()).toEqual([]);
    expect(await repo.counts()).toEqual({ pending: 0, dead: 1 });
  });

  it('keeps sync state as a patchable singleton and clear() resets everything', async () => {
    const repo = createInMemorySyncRepository();
    expect(await repo.getState()).toMatchObject({ cursor: 0, denRev: 0, lastSyncAt: null });
    await repo.saveState({ cursor: 5 });
    await repo.saveState({ denRev: 2 });
    expect(await repo.getState()).toMatchObject({ cursor: 5, denRev: 2 });
    await repo.enqueue({ id: 'a', kind: 'command', payload: {}, createdAt: 1 });
    await repo.clear();
    expect(await repo.getState()).toMatchObject({ cursor: 0, denRev: 0 });
    expect(await repo.counts()).toEqual({ pending: 0, dead: 0 });
  });
});

describe('sync identity in SettingsRepository', () => {
  const identity = { serverUrl: 'https://x', token: 'secret-token-123', householdId: 'h', playerId: 'p', deviceId: 'd', playerName: 'B' };

  it('round-trips, is independent of other settings, and null disconnects', async () => {
    const repo = createInMemorySettingsRepository();
    expect(await repo.getSyncIdentity()).toBeNull();
    await repo.saveSyncIdentity(identity);
    await repo.saveLocalePreference('de');
    expect(await repo.getSyncIdentity()).toEqual(identity);
    await repo.saveSyncIdentity(null);
    expect(await repo.getSyncIdentity()).toBeNull();
    expect(await repo.getLocalePreference()).toBe('de');
  });

  it('rejects an incomplete identity', async () => {
    const repo = createInMemorySettingsRepository();
    await repo.saveSyncIdentity({ ...identity, token: '' });
    expect(await repo.getSyncIdentity()).toBeNull();
  });

  it('never leaks into the Backup JSON', async () => {
    const settings = createInMemorySettingsRepository();
    await settings.saveSyncIdentity(identity);
    const backup = await exportBackup({
      walks: createInMemoryWalkRepository(),
      denEconomy: createInMemoryDenEconomyRepository(),
      personalStats: createInMemoryPersonalStatsRepository(),
      notification: createInMemoryNotificationRepository(),
      homeRange: createInMemoryHomeRangeRepository(),
      territories: createInMemoryTerritoryRepository(),
      buddyAppearance: createInMemoryBuddyAppearanceRepository(),
      settings,
      feedbackPrefs: createInMemoryFeedbackPrefsRepository(),
    });
    const json = JSON.stringify(backup);
    expect(json).not.toContain('"token"');
    expect(json).not.toContain(identity.token);
    expect(json).not.toContain('serverUrl');
  });
});

describe('household additions to the other repositories', () => {
  it('WalkRepository.markSynced sets syncedAt and ignores unknown ids', async () => {
    const repo = createInMemoryWalkRepository();
    await repo.saveWalk({ id: 'w', startTime: 1, locations: [], closed: true, startSource: 'button' });
    await repo.markSynced('w', 55);
    await repo.markSynced('nope', 55);
    expect((await repo.getWalk('w'))?.syncedAt).toBe(55);
    await repo.saveWalk({ id: 'w', startTime: 1, locations: [], closed: false, startSource: 'button' });
    expect((await repo.getWalk('w'))?.syncedAt).toBe(55); // a patch write keeps it
  });

  it('HomeRangeRepository.mergeCells never lowers a cell and fills territoryId only when the server has one', async () => {
    const repo = createInMemoryHomeRangeRepository();
    await repo.replaceAll([{ ix: 0, iy: 0, visits: 3, lastTracked: 500, lastRefreshed: 600, territoryId: 'a' }], null);
    await repo.mergeCells([{ ix: 0, iy: 0, visits: 1, lastTracked: 100, lastRefreshed: 100, territoryId: null }]);
    expect((await repo.getCells())[0]).toEqual({ ix: 0, iy: 0, visits: 3, lastTracked: 500, lastRefreshed: 600, territoryId: 'a' });
  });

  it('TerritoryRepository.removeTerritories drops only the given ids', async () => {
    const repo = createInMemoryTerritoryRepository();
    await repo.upsertTerritories([
      { id: 'a', name: 'A', createdAt: 1, walksHere: 0, treatsEarnedHere: 0 },
      { id: 'b', name: 'B', createdAt: 2, walksHere: 0, treatsEarnedHere: 0 },
    ]);
    await repo.removeTerritories(['a']);
    expect((await repo.getTerritories()).map((t) => t.id)).toEqual(['b']);
  });
});

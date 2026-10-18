import { defaultDenEconomyState } from '../economy/denEconomy';
import { createInMemoryCornerRepository } from '../storage/inMemoryCornerRepository';
import { createInMemoryDenEconomyRepository } from '../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../storage/inMemoryHomeRangeRepository';
import { createInMemoryPersonalStatsRepository } from '../storage/inMemoryPersonalStatsRepository';
import { createInMemorySettingsRepository } from '../storage/inMemorySettingsRepository';
import { createInMemorySyncRepository } from '../storage/inMemorySyncRepository';
import { createInMemoryTerritoryRepository } from '../storage/inMemoryTerritoryRepository';
import { createInMemoryWalkRepository } from '../storage/inMemoryWalkRepository';
import { ApiClient, createApiClient } from '../sync/apiClient';
import type { ApiDenState, SnapshotResponse } from '../sync/apiContract';
import { createSyncEngine } from '../sync/syncEngine';

export function makeRepos() {
  return {
    settings: createInMemorySettingsRepository(),
    sync: createInMemorySyncRepository(),
    walks: createInMemoryWalkRepository(),
    homeRange: createInMemoryHomeRangeRepository(),
    territories: createInMemoryTerritoryRepository(),
    denEconomy: createInMemoryDenEconomyRepository(),
    corners: createInMemoryCornerRepository(),
    stats: createInMemoryPersonalStatsRepository(),
  };
}

export const IDENTITY = {
  serverUrl: 'https://example.test',
  token: 'tok',
  householdId: 'h1',
  playerId: 'p-me',
  deviceId: 'd1',
  playerName: 'Sam',
};

export function apiDen(overrides: Partial<ApiDenState> = {}): ApiDenState {
  return {
    treats: 100,
    doghouseLevel: 1,
    bakeryLevel: 2,
    sniffGardenLevel: 1,
    lastTickAt: 1_000,
    xp: 10,
    level: 3,
    territoryIncomeRevealed: false,
    rev: 1,
    ...overrides,
  };
}

export function snapshot(overrides: Partial<SnapshotResponse> = {}): SnapshotResponse {
  return {
    serverTime: 5_000,
    seq: 7,
    household: { id: 'h1', name: 'Haus', timezone: 'Europe/Berlin' },
    me: { playerId: 'p-me', deviceId: 'd1', displayName: 'Sam' },
    players: [
      { id: 'p-me', displayName: 'Sam', joinedAt: 1 },
      { id: 'p-lisa', displayName: 'Lisa', joinedAt: 2 },
    ],
    dog: { id: 'dog1', name: 'Rex', appearance: {}, updatedAt: 1 },
    den: apiDen(),
    cells: [],
    territories: [],
    walks: [],
    ...overrides,
  };
}

export function makeEngine(
  repos: ReturnType<typeof makeRepos>,
  client: Partial<ApiClient>,
  clock: { now: number } = { now: 1_000_000 }
) {
  return createSyncEngine({
    ...repos,
    createClient: () => client as ApiClient,
    now: () => clock.now,
  });
}

/** Real api client over a scripted fetch, for the join flow. */
export function engineWithFetch(repos: ReturnType<typeof makeRepos>, fetchImpl: typeof fetch) {
  return createSyncEngine({
    ...repos,
    createClient: (baseUrl, token) => createApiClient({ baseUrl, token, fetchImpl }),
    now: () => 1_000_000,
  });
}

export function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

export { defaultDenEconomyState };

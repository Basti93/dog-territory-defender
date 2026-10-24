import { createInMemoryCornerRepository } from '../../storage/inMemoryCornerRepository';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryNotificationRepository } from '../../storage/inMemoryNotificationRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { createInMemorySettingsRepository } from '../../storage/inMemorySettingsRepository';
import { createInMemoryTerritoryRepository } from '../../storage/inMemoryTerritoryRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import type { Location, Walk } from '../../types';
import { finishTrackedWalk, shouldShowIncomeBeat, type WalkRewardsOutcome } from '../finishTrackedWalk';
import type { AppRepositories } from '../repositories';

jest.mock('../../notifications/walkReminder', () => ({ checkAndScheduleWalkReminder: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/logShipper', () => ({ flushLogShipper: jest.fn().mockResolvedValue(undefined), shipLog: jest.fn() }));
jest.mock('../../utils/streetLookup', () => ({
  resolveTerritoryName: jest.fn().mockResolvedValue('Rex territory on Aue'),
  resolveStreetForPoint: jest.fn().mockResolvedValue(null),
}));

const LAT = 52.5;
const LON = 13.4;
const M_PER_DEG_LON = 111320 * Math.cos((LAT * Math.PI) / 180);
const DAY = 24 * 3600 * 1000;
const T0 = new Date(2026, 8, 1, 10, 0, 0).getTime();

/** A 700 m walk east, `northKm` north of home. */
function eastWalk(id: string, day: number, northKm = 0): Walk {
  const start = T0 + day * DAY;
  const locations: Location[] = Array.from({ length: 71 }, (_, i) => ({
    latitude: LAT + (northKm * 1000) / 111320,
    longitude: LON + (10 * i) / M_PER_DEG_LON,
    timestamp: start + i * 5000,
    accuracy: 5,
  }));
  return { id, startTime: start, locations, closed: false, startSource: 'button' };
}

function makeRepos() {
  return {
    walkRepository: createInMemoryWalkRepository(),
    homeRangeRepository: createInMemoryHomeRangeRepository(),
    territoryRepository: createInMemoryTerritoryRepository(),
    denEconomyRepository: createInMemoryDenEconomyRepository(),
    personalStatsRepository: createInMemoryPersonalStatsRepository(),
    notificationRepository: createInMemoryNotificationRepository(),
    cornerRepository: createInMemoryCornerRepository(),
    settingsRepository: createInMemorySettingsRepository(),
  } as unknown as AppRepositories;
}

async function finish(walk: Walk, repos: AppRepositories, joined = false) {
  const outcomes: WalkRewardsOutcome[] = [];
  const hints: Array<string | null> = [];
  await finishTrackedWalk(walk, {
    repos,
    dogName: 'Rex',
    onFinishCue: () => null,
    playCue: () => undefined,
    onWalkFinished: () => undefined,
    onRangeChanged: () => undefined,
    onRewards: (o) => outcomes.push(o),
    sync: joined ? { enqueueWalk: async (_w, hint) => void hints.push(hint) } : undefined,
  });
  return { outcomes, hints };
}

describe('finishTrackedWalk territories', () => {
  it('offline: far ground stays home until the second walk there, which births the territory with the new-territory beat', async () => {
    const repos = makeRepos();
    await finish(eastWalk('w1', 0), repos);
    const far1 = await finish(eastWalk('w2', 1, 4), repos);
    expect(far1.outcomes[0].territoryBeat?.newTerritoryName ?? null).toBeNull();
    expect(await repos.territoryRepository.getTerritories()).toHaveLength(1);

    const far2 = await finish(eastWalk('w3', 2, 4), repos);
    expect(far2.outcomes[0].territoryBeat?.newTerritoryName).toBe('Rex territory on Aue');
    const territories = await repos.territoryRepository.getTerritories();
    expect(territories).toHaveLength(2);
    const created = territories.find((t) => t.id === far2.outcomes[0].territoryBeat?.newTerritoryId)!;
    expect(created.walksHere).toBe(2);
    expect((await repos.homeRangeRepository.getCellsByTerritory(created.id)).length).toBeGreaterThanOrEqual(40);
  });

  it('income beat: at most once per local day, and only after a rise of 0.2/h over the last one shown', () => {
    expect(shouldShowIncomeBeat(null, '2026-10-24', 0.3)).toBe(true);
    expect(shouldShowIncomeBeat({ day: '2026-10-24', rate: 0.1 }, '2026-10-24', 0.9)).toBe(false); // same day
    expect(shouldShowIncomeBeat({ day: '2026-10-23', rate: 0.4 }, '2026-10-24', 0.5)).toBe(false); // rose only 0.1
    expect(shouldShowIncomeBeat({ day: '2026-10-23', rate: 0.4 }, '2026-10-24', 0.6)).toBe(true);
  });

  it('joined: the phone births no territory, merges nothing and credits nothing; it hints the name for the server', async () => {
    const repos = makeRepos();
    await repos.settingsRepository.saveSyncIdentity({ serverUrl: 'https://x.test', token: 't', householdId: 'h', playerId: 'p', deviceId: 'd', playerName: 'Sam' });
    const first = await finish(eastWalk('w1', 0), repos, true);
    expect(await repos.territoryRepository.getTerritories()).toHaveLength(0);
    expect(first.hints[0]).toBe('Rex territory on Aue'); // the server names its first territory with this

    await repos.territoryRepository.upsertTerritories([{ id: 'srv-home', name: 'Home', createdAt: 1, walksHere: 1, treatsEarnedHere: 0 }]);
    await repos.homeRangeRepository.assignTerritoryToCells((await repos.homeRangeRepository.getCells()).map((c) => `${c.ix},${c.iy}`), 'srv-home');
    await finish(eastWalk('w2', 1, 4), repos, true);
    const far = await finish(eastWalk('w3', 2, 4), repos, true);
    expect(far.outcomes[0].territoryBeat?.newTerritoryName).toBe('Rex territory on Aue'); // predicted for the homecoming
    expect(far.hints[0]).toBe('Rex territory on Aue');
    const ids = (await repos.territoryRepository.getTerritories()).map((t) => t.id);
    expect(ids).toEqual(['srv-home']); // the server's id arrives with the sync, never a local one
    expect((await repos.territoryRepository.getTerritory('srv-home'))?.walksHere).toBe(1); // no local credit
  });
});

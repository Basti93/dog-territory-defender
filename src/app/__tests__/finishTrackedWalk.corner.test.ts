import { createInMemoryCornerRepository } from '../../storage/inMemoryCornerRepository';
import { createInMemoryDenEconomyRepository } from '../../storage/inMemoryDenEconomyRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryNotificationRepository } from '../../storage/inMemoryNotificationRepository';
import { createInMemoryPersonalStatsRepository } from '../../storage/inMemoryPersonalStatsRepository';
import { createInMemoryTerritoryRepository } from '../../storage/inMemoryTerritoryRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import type { Location, Walk } from '../../types';
import { finishTrackedWalk, type WalkRewardsOutcome } from '../finishTrackedWalk';
import type { AppRepositories } from '../repositories';

jest.mock('../../notifications/walkReminder', () => ({ checkAndScheduleWalkReminder: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/logShipper', () => ({ flushLogShipper: jest.fn().mockResolvedValue(undefined), shipLog: jest.fn() }));
jest.mock('../../utils/streetLookup', () => ({
  resolveTerritoryName: jest.fn().mockResolvedValue('Rex Range'),
  resolveStreetForPoint: jest.fn().mockResolvedValue('Lindenstraße'),
}));

const HOME_LAT = 52.5;
const HOME_LON = 13.4;
const M_PER_DEG_LON = 111320 * Math.cos((HOME_LAT * Math.PI) / 180);
const DAY = 24 * 3600 * 1000;
const T0 = new Date(2026, 8, 1, 10, 0, 0).getTime();

/** A 600 m walk east along one street, starting 300 m from the first walk's start so the home block is not in play. */
function streetWalk(id: string, day: number): Walk {
  const start = T0 + day * DAY;
  const locations: Location[] = Array.from({ length: 61 }, (_, i) => ({ latitude: HOME_LAT, longitude: HOME_LON + (300 + 10 * i) / M_PER_DEG_LON, timestamp: start + i * 5000, accuracy: 5 }));
  return { id, startTime: start, locations, closed: false, startSource: 'button' };
}

async function finish(walk: Walk, repos: AppRepositories) {
  const outcomes: WalkRewardsOutcome[] = [];
  await finishTrackedWalk(walk, {
    repos,
    dogName: 'Rex',
    onFinishCue: () => null,
    playCue: () => undefined,
    onWalkFinished: () => undefined,
    onRangeChanged: () => undefined,
    onRewards: (o) => outcomes.push(o),
  });
  return outcomes;
}

function makeRepos(): AppRepositories {
  return {
    walkRepository: createInMemoryWalkRepository(),
    homeRangeRepository: createInMemoryHomeRangeRepository(),
    territoryRepository: createInMemoryTerritoryRepository(),
    denEconomyRepository: createInMemoryDenEconomyRepository(),
    personalStatsRepository: createInMemoryPersonalStatsRepository(),
    notificationRepository: createInMemoryNotificationRepository(),
    cornerRepository: createInMemoryCornerRepository(),
  } as unknown as AppRepositories;
}

describe('finishTrackedWalk and "Unsere Ecken"', () => {
  it('the walk that completes the fourth day hands the new corner (with its street) to the homecoming; walks before it do not, and the next one waits a week', async () => {
    const repos = makeRepos();
    const outcomes: WalkRewardsOutcome[] = [];
    for (const [i, day] of [0, 1, 2, 3, 4].entries()) outcomes.push(...(await finish(streetWalk(`w${i}`, day), repos)));
    expect(outcomes).toHaveLength(5);
    for (const i of [0, 1, 2]) expect(outcomes[i].newCorner).toBeUndefined();
    expect(outcomes[3].newCorner).toEqual({ id: expect.stringMatching(/^-?\d+,-?\d+$/), street: 'Lindenstraße' });
    // The 600 m street is long enough for a second corner (200 m apart), but one naming moment per week at most.
    expect(outcomes[4].newCorner).toBeUndefined();
    outcomes.push(...(await finish(streetWalk('w10', 10), repos)));
    expect(outcomes[5].newCorner).toBeDefined();
    expect(outcomes[5].newCorner!.id).not.toBe(outcomes[3].newCorner!.id);
    const stored = await repos.cornerRepository.getCorners();
    expect(stored.map((c) => c.walkId).sort()).toEqual(['w10', 'w3']);
    expect(stored.find((c) => c.walkId === 'w3')).toMatchObject({ id: outcomes[3].newCorner!.id, name: null });
  });

  it('a problem with the corner store never breaks the finish', async () => {
    const repos = makeRepos();
    repos.cornerRepository.getCorners = async () => {
      throw new Error('disk full');
    };
    const outcomes = await finish(streetWalk('w0', 0), repos);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].newCorner).toBeUndefined();
  });
});

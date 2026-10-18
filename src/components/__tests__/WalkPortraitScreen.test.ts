import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { Walk } from '../../types';
import { walkDistanceMeters } from '../../utils/geometry';
import { cellForLocation, cellKey, splitTrailByNewGround } from '../../utils/grid';
import { resolveWalkPortraitState } from '../WalkPortraitScreen';

// Mirrors SomewhereWildCard.test.ts's pattern: the state-resolution logic is
// a plain exported async function, exercised directly here with no React
// renderer needed.

function makeWalk(overrides: Partial<Walk> = {}): Walk {
  return {
    id: overrides.id ?? 'walk-1',
    startTime: overrides.startTime ?? 1000,
    locations: overrides.locations ?? [{ latitude: 52.5, longitude: 13.4, timestamp: 1000, accuracy: 5 }],
    closed: overrides.closed ?? true,
    startSource: overrides.startSource ?? 'button',
    ...overrides,
  };
}

describe('resolveWalkPortraitState (docs/decisions/walk-portrait/design.md Decision 2, tasks.md task 4.1)', () => {
  it('(a) a walk with its own recorded trail resolves to the trail state using its own record', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const walk = makeWalk({ id: 'tracked' });
    await walkRepository.saveWalk(walk);
    const stored = (await walkRepository.getWalk('tracked'))!;

    const result = await resolveWalkPortraitState(stored, walkRepository);

    expect(result).toEqual({ kind: 'trail', trailSource: stored });
  });

  it('(b) a manual log with a linked route that still exists resolves to the trail state using the linked route', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const route = makeWalk({ id: 'route-1', startSource: 'button' });
    await walkRepository.saveWalk(route);
    const manualLog = makeWalk({
      id: 'manual-1',
      startSource: 'manual-log',
      locations: [],
      refreshedRouteWalkId: 'route-1',
    });
    await walkRepository.saveWalk(manualLog);
    const storedManualLog = (await walkRepository.getWalk('manual-1'))!;
    const storedRoute = (await walkRepository.getWalk('route-1'))!;

    const result = await resolveWalkPortraitState(storedManualLog, walkRepository);

    expect(result).toEqual({ kind: 'trail', trailSource: storedRoute });
  });

  it('(c) a manual log with no linked route resolves to the fallback state', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const manualLog = makeWalk({ id: 'manual-2', startSource: 'manual-log', locations: [] });
    await walkRepository.saveWalk(manualLog);
    const stored = (await walkRepository.getWalk('manual-2'))!;

    const result = await resolveWalkPortraitState(stored, walkRepository);

    expect(result).toEqual({ kind: 'fallback' });
  });

  it('(c) a manual log whose linked route has since been deleted falls through to the fallback state, not an error', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const manualLog = makeWalk({
      id: 'manual-3',
      startSource: 'manual-log',
      locations: [],
      refreshedRouteWalkId: 'deleted-route',
    });
    await walkRepository.saveWalk(manualLog);
    const stored = (await walkRepository.getWalk('manual-3'))!;
    // 'deleted-route' was never saved — getWalk resolves null, mirroring a
    // route that existed once and was later deleted from history.

    const result = await resolveWalkPortraitState(stored, walkRepository);

    expect(result).toEqual({ kind: 'fallback' });
  });
});

// tasks.md task 8.2's "full path" coverage: chains the same pure functions
// WalkPortraitScreen.tsx itself calls (resolveWalkPortraitState,
// splitTrailByNewGround, walkDistanceMeters, and reading walk.treatsEarned)
// for each of the four required scenarios, confirming the right state AND
// the right derived metadata together — not just each unit in isolation.
// This project has no React component-renderer test setup (see
// SomewhereWildCard.test.ts/DoorstepScreen.test.ts's own precedent of
// testing extracted pure logic instead), so this is the closest equivalent
// to an end-to-end test available here.
describe('Walk Portrait full path (tasks.md task 8.2)', () => {
  it('a synthetic tracked walk with New Ground cells and treatsEarned resolves to its own trail, with the New Ground segment split out and treats present', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const locations = [
      { latitude: 48.1374, longitude: 11.5755, timestamp: 1000, accuracy: 5 },
      { latitude: 48.1376, longitude: 11.5755, timestamp: 21000, accuracy: 5 },
      { latitude: 48.1378, longitude: 11.5755, timestamp: 41000, accuracy: 5 },
    ];
    const walk = makeWalk({
      id: 'tracked-full-path',
      locations,
      newGroundCellIds: [], // filled in below once we know the real cell id
      treatsEarned: 12,
    });
    // The last point's own cell is this walk's New Ground discovery.
    const lastCell = cellForLocation(locations[2].latitude, locations[2].longitude);
    walk.newGroundCellIds = [cellKey(lastCell.ix, lastCell.iy)];
    await walkRepository.saveWalk(walk);
    const stored = (await walkRepository.getWalk('tracked-full-path'))!;

    const state = await resolveWalkPortraitState(stored, walkRepository);
    expect(state.kind).toBe('trail');
    if (state.kind !== 'trail') throw new Error('expected trail state');

    const runs = splitTrailByNewGround(state.trailSource.locations, state.trailSource.newGroundCellIds);
    expect(runs.map((r) => r.color)).toEqual(['base', 'new-ground']);
    expect(walkDistanceMeters(state.trailSource)).toBeGreaterThan(0);
    expect(stored.treatsEarned).toBe(12);
  });

  it('a manual log with a linked route resolves to the route\'s own trail, while treatsEarned still comes from the manual log itself', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const route = makeWalk({ id: 'route-full-path', startSource: 'button' });
    await walkRepository.saveWalk(route);
    const manualLog = makeWalk({
      id: 'manual-full-path',
      startSource: 'manual-log',
      locations: [],
      refreshedRouteWalkId: 'route-full-path',
      treatsEarned: 5,
    });
    await walkRepository.saveWalk(manualLog);
    const stored = (await walkRepository.getWalk('manual-full-path'))!;

    const state = await resolveWalkPortraitState(stored, walkRepository);
    expect(state.kind).toBe('trail');
    if (state.kind !== 'trail') throw new Error('expected trail state');
    expect(state.trailSource.id).toBe('route-full-path');
    expect(walkDistanceMeters(state.trailSource)).toBeGreaterThanOrEqual(0);
    expect(stored.treatsEarned).toBe(5); // sourced from the manual log's own record, not the route's
  });

  it('a manual log with no linked route resolves to the fallback state, with only date + treats meaningful', async () => {
    const walkRepository = createInMemoryWalkRepository();
    const manualLog = makeWalk({
      id: 'manual-no-route-full-path',
      startSource: 'manual-log',
      locations: [],
      treatsEarned: 8,
    });
    await walkRepository.saveWalk(manualLog);
    const stored = (await walkRepository.getWalk('manual-no-route-full-path'))!;

    const state = await resolveWalkPortraitState(stored, walkRepository);
    expect(state).toEqual({ kind: 'fallback' });
    expect(stored.treatsEarned).toBe(8);
  });

  it("a manual log whose linked route has been deleted resolves to the fallback state, not a crash, with treats still present", async () => {
    const walkRepository = createInMemoryWalkRepository();
    const route = makeWalk({ id: 'route-to-delete', startSource: 'button' });
    await walkRepository.saveWalk(route);
    const manualLog = makeWalk({
      id: 'manual-dangling-full-path',
      startSource: 'manual-log',
      locations: [],
      refreshedRouteWalkId: 'route-to-delete',
      treatsEarned: 3,
    });
    await walkRepository.saveWalk(manualLog);
    await walkRepository.deleteWalk('route-to-delete');
    const stored = (await walkRepository.getWalk('manual-dangling-full-path'))!;

    const state = await resolveWalkPortraitState(stored, walkRepository);
    expect(state).toEqual({ kind: 'fallback' });
    expect(stored.treatsEarned).toBe(3);
  });
});

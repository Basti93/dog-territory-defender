import { Location as LocationType } from '../types';

export interface MockWalkHandle {
  remove(): void;
}

/**
 * Dev-only stand-in for startWatchingLocation: replays a canned fixture into
 * the same callback shape, at the same ~1s cadence as the real GPS watch.
 */
export function startMockWalk(
  fixture: LocationType[],
  callback: (location: LocationType) => void
): MockWalkHandle {
  let index = 0;
  const interval = setInterval(() => {
    if (index >= fixture.length) {
      clearInterval(interval);
      return;
    }
    callback(fixture[index]);
    index += 1;
  }, 1000);

  return {
    remove() {
      clearInterval(interval);
    },
  };
}

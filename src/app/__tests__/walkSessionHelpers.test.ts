import { WalkCueTracker } from '../../feedback/walkCues';
import { AppState, Location } from '../../types';
import { appendLocation, applyLocationToCues, createWalkCueState, startWalkCueState } from '../walkSessionHelpers';
import { newGroundCells, paintedCells } from '../../utils/grid';

const loc = (latitude: number, longitude: number): Location => ({ latitude, longitude, timestamp: 0, accuracy: 5 });

function fakeTracker() {
  const calls: Array<[number, number]> = [];
  const tracker: WalkCueTracker = {
    onCells: (painted, newGround) => {
      calls.push([painted, newGround]);
      return 'new-street';
    },
    onFinish: () => null,
    reset: () => {},
  };
  return { tracker, calls };
}

describe('appendLocation', () => {
  it('ignores fixes while there is no walk', () => {
    const prev: AppState = { walk: null, isTracking: false, error: null };
    expect(appendLocation(prev, loc(1, 1))).toBe(prev);
  });

  it('appends without mutating the previous state', () => {
    const first = loc(52.5, 13.4);
    const prev: AppState = {
      walk: { id: 'w', startTime: 0, locations: [first], closed: false, startSource: 'button' },
      isTracking: true,
      error: null,
    };
    const next = appendLocation(prev, loc(52.6, 13.5));
    expect(next.walk?.locations).toHaveLength(2);
    expect(prev.walk?.locations).toHaveLength(1);
    expect(next.isTracking).toBe(true);
  });
});

describe('walk cue state', () => {
  it('does nothing while inactive', () => {
    const { tracker, calls } = fakeTracker();
    expect(applyLocationToCues(createWalkCueState(), loc(52.5, 13.4), tracker)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('starts from the initial fix and accumulates painted cells', () => {
    const { tracker, calls } = fakeTracker();
    const start = loc(52.5, 13.4);
    const state = createWalkCueState();
    startWalkCueState(state, start);
    expect(state.active).toBe(true);
    expect(state.painted).toEqual(paintedCells([start]));

    const next = loc(52.5, 13.4004);
    expect(applyLocationToCues(state, next, tracker)).toBe('new-street');
    expect(state.last).toBe(next);
    expect(calls[0][0]).toBe(state.painted.size);
    expect(calls[0][1]).toBe(0); // range not loaded yet: no new-ground counting
  });

  it('counts new ground (via newGroundCells) once the range snapshot has loaded', () => {
    const { tracker, calls } = fakeTracker();
    const start = loc(52.5, 13.4);
    const state = createWalkCueState();
    startWalkCueState(state, start);
    state.range = new Set(paintedCells([start])); // start cell already known
    const far = loc(52.5, 13.4006);
    applyLocationToCues(state, far, tracker);
    const known = new Set(state.range);
    const expectedNew = newGroundCells(state.painted, known).size;
    expect(calls[0][1]).toBe(expectedNew);
  });

  it('a fix too rough to paint from (30-50 m) neither paints nor moves the path end', () => {
    const { tracker, calls } = fakeTracker();
    const start = loc(52.5, 13.4);
    const state = createWalkCueState();
    startWalkCueState(state, start);
    const before = new Set(state.painted);
    expect(applyLocationToCues(state, { ...loc(52.5, 13.4004), accuracy: 45 }, tracker)).toBeNull();
    expect(state.last).toBe(start);
    expect(state.painted).toEqual(before);
    expect(calls).toHaveLength(0);
  });
});

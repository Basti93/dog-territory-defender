import {
  AUTO_FINISH_MIN_WALK_MS as MIN,
  AutoFinishState,
  evaluateAutoFinish,
  HOME_DWELL_MS,
  homeCountdownMinutes,
  startAutoFinish,
  STILL_MS,
} from '../autoFinish';

// 0.001 deg latitude is about 111 m.
const at = (metresNorth: number) => ({ latitude: 52 + metresNorth / 111000, longitude: 13 });
const START = at(0);
const MIN_MS = 60 * 1000;

/** Feed fixes at given minutes; returns the last result. */
function run(fixes: Array<[number, number]>, enabled = true) {
  let state: AutoFinishState = startAutoFinish(START, 0, enabled);
  let last = { state, decision: null as ReturnType<typeof evaluateAutoFinish>['decision'] };
  for (const [minute, metres] of fixes) {
    last = evaluateAutoFinish(state, at(metres), minute * MIN_MS);
    state = last.state;
    if (last.decision) break;
  }
  return last;
}

describe('evaluateAutoFinish', () => {
  it('finishes after the home dwell when back at the start', () => {
    const r = run([[5, 400], [10, 600], [14, 10], [15, 5], [17, 5], [18, 5], [18.5, 5]]);
    expect(r.decision).toBe('home');
  });

  it('works for a park trip (start = the car, walk away and back)', () => {
    const r = run([[3, 300], [9, 900], [12, 20], [15.5, 20]]);
    expect(r.decision).toBe('home');
  });

  it('does not finish while still inside the dwell time', () => {
    expect(run([[5, 400], [10, 600], [14, 10], [15, 5], [16, 5]]).decision).toBeNull();
  });

  it('never finishes a walk that never left (no 150 m excursion)', () => {
    const r = run([[1, 30], [5, 80], [10, 20], [14, 10], [20, 10]].map(([m, d]) => [m, d] as [number, number]));
    // still-rule may fire eventually, but not the home rule
    expect(r.decision).not.toBe('home');
  });

  it('does not finish before the minimum walk length even when home and dwelled', () => {
    const r = run([[1, 200], [2, 10], [5.5, 10]]);
    expect(r.decision).toBeNull();
  });

  it('leaving the home radius resets the dwell', () => {
    const r = run([[2, 300], [8, 10], [9, 100], [11, 10], [13, 10]]);
    expect(r.decision).toBeNull();
    expect(r.state.homeSince).toBe(11 * MIN_MS);
  });

  it('safety net: no movement for STILL_MS finishes with "still"', () => {
    const r = run([[1, 500], [2, 600], [10, 605], [21, 610], [23, 610]]);
    expect(r.decision).toBe('still');
  });

  it('a disabled flag never finishes', () => {
    const r = run([[5, 400], [10, 600], [14, 10], [20, 5], [60, 5]], false);
    expect(r.decision).toBeNull();
  });

  it('timer tick (no fix) re-evaluates with the last fix', () => {
    let { state } = run([[5, 400], [10, 600], [14, 10]]);
    expect(evaluateAutoFinish(state, null, 15 * MIN_MS).decision).toBeNull();
    expect(evaluateAutoFinish(state, null, 14 * MIN_MS + HOME_DWELL_MS).decision).toBe('home');
    // GPS silent while parked far away: the tick alone triggers the still rule
    state = run([[5, 400], [10, 600]]).state;
    expect(evaluateAutoFinish(state, null, 10 * MIN_MS + STILL_MS).decision).toBe('still');
  });

  it('keeps the minimum constants honest', () => {
    expect(MIN).toBe(8 * MIN_MS);
  });
});

describe('homeCountdownMinutes', () => {
  it('is null until the home dwell has begun', () => {
    const { state } = run([[5, 400], [10, 600]]);
    expect(homeCountdownMinutes(state, 10 * MIN_MS)).toBeNull();
  });

  it('counts whole minutes down, never below 1', () => {
    const { state } = run([[5, 400], [10, 600], [14, 10]]);
    expect(homeCountdownMinutes(state, 14 * MIN_MS)).toBe(3);
    expect(homeCountdownMinutes(state, 16.5 * MIN_MS)).toBe(1);
    expect(homeCountdownMinutes(state, 30 * MIN_MS)).toBe(1);
  });
});

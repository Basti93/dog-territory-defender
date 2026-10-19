import {
  AUTO_FINISH_MIN_WALK_MS as MIN,
  AutoFinishState,
  evaluateAutoFinish,
  GPS_GAP_MAX_MS,
  GPS_GAP_MS,
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

  it('safety net: fixes that keep arriving within the radius for STILL_MS finish with "still"', () => {
    const r = run([[1, 500], [2, 600], [6, 605], [10, 605], [14, 610], [18, 605], [22, 610], [23, 610]]);
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
  });

  describe('GPS gap: absence of fixes is not evidence', () => {
    it('a timer tick long after the last fix never finishes as "still" and reports the gap', () => {
      const { state } = run([[5, 400], [10, 600]]);
      const tick = evaluateAutoFinish(state, null, 10 * MIN_MS + 23 * MIN_MS);
      expect(tick.decision).toBeNull();
      expect(tick.gapMs).toBe(23 * MIN_MS);
    });

    it('no gap is reported while fixes keep coming, and a short silence is not a gap', () => {
      const { state } = run([[5, 400], [10, 600]]);
      expect(evaluateAutoFinish(state, null, 10 * MIN_MS + GPS_GAP_MS - 1).gapMs).toBeNull();
      expect(evaluateAutoFinish(state, null, 10 * MIN_MS + GPS_GAP_MS).gapMs).toBe(GPS_GAP_MS);
    });

    it('the first fix after a long gap restarts the still clock (it must not finish at once)', () => {
      const { state } = run([[5, 400], [10, 600]]);
      const back = evaluateAutoFinish(state, at(603), 10 * MIN_MS + 23 * MIN_MS); // 3 m from the old anchor
      expect(back.decision).toBeNull();
      expect(back.gapEndedMs).toBe(23 * MIN_MS);
      expect(back.state.anchorAt).toBe(33 * MIN_MS);
      // ...and it takes a full STILL_MS of fixes from there.
      expect(evaluateAutoFinish(back.state, at(603), 33 * MIN_MS + 4 * MIN_MS).decision).toBeNull();
    });

    it('the home dwell is not carried across a gap either', () => {
      const { state } = run([[5, 400], [10, 600], [14, 10]]);
      const tick = evaluateAutoFinish(state, null, 14 * MIN_MS + 6 * MIN_MS);
      expect(tick.decision).toBeNull(); // 6 min of silence at home: unknown, not "home for 3 minutes"
      const back = evaluateAutoFinish(state, at(10), 14 * MIN_MS + 6 * MIN_MS);
      expect(back.state.homeSince).toBe(20 * MIN_MS);
      expect(back.decision).toBeNull();
    });
  });

  describe('GPS gap cap and rough fixes', () => {
    it('a gap of GPS_GAP_MAX_MS finishes the walk after all, even with auto-finish off', () => {
      for (const enabled of [true, false]) {
        const { state } = run([[5, 400], [10, 600]], enabled);
        expect(evaluateAutoFinish(state, null, 10 * MIN_MS + GPS_GAP_MAX_MS - 1).decision).toBeNull();
        expect(evaluateAutoFinish(state, null, 10 * MIN_MS + GPS_GAP_MAX_MS).decision).toBe('still');
      }
    });

    it('a fix arriving after a huge gap is evidence the walk lives: no finish', () => {
      const { state } = run([[5, 400], [10, 600]]);
      expect(evaluateAutoFinish(state, at(900), 10 * MIN_MS + GPS_GAP_MAX_MS + MIN_MS).decision).toBeNull();
    });

    it('the home countdown is not shown during a gap', () => {
      const { state } = run([[5, 400], [10, 600], [14, 10]]);
      expect(homeCountdownMinutes(state, 14 * MIN_MS + GPS_GAP_MS)).toBeNull();
    });

    it('rough fixes jittering 45 m do not keep resetting the still clock; real walking still does', () => {
      const rough = (metres: number) => ({ ...at(metres), accuracy: 45 });
      let state: AutoFinishState = startAutoFinish(START, 0, true);
      // Phone left standing, fixes 45 m apart every 2 minutes for 25 minutes.
      let decision: ReturnType<typeof evaluateAutoFinish>['decision'] = null;
      for (let minute = 2; minute <= 25 && !decision; minute += 2) {
        const step = evaluateAutoFinish(state, rough(minute % 4 === 0 ? 45 : 0), minute * MIN_MS);
        state = step.state;
        decision = step.decision;
      }
      expect(decision).toBe('still');
      // The same jitter with accurate fixes keeps the walk going (it is real movement then).
      let accurate: AutoFinishState = startAutoFinish(START, 0, true);
      for (let minute = 2; minute <= 25; minute += 2) {
        const step = evaluateAutoFinish(accurate, at(minute % 4 === 0 ? 45 : 0), minute * MIN_MS);
        accurate = step.state;
        expect(step.decision).toBeNull();
      }
    });
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
    expect(homeCountdownMinutes(state, 18 * MIN_MS)).toBe(1);
  });
});

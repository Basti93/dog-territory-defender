import { createWalkCueTracker } from '../walkCues';

function make(minCells = 25) {
  let t = 1_000_000;
  const tracker = createWalkCueTracker({ now: () => t, minCells, newGroundMin: 3 });
  return { tracker, advance: (ms: number) => (t += ms) };
}

describe('walk cue tracker', () => {
  it('dings new-street only after 3 new cells', () => {
    const { tracker } = make();
    expect(tracker.onCells(5, 2)).toBeNull();
    expect(tracker.onCells(6, 3)).toBe('new-street');
  });

  it('debounces new-street to once per 20 s and re-counts from the last cue', () => {
    const { tracker, advance } = make();
    expect(tracker.onCells(5, 3)).toBe('new-street');
    advance(5_000);
    expect(tracker.onCells(9, 8)).toBeNull(); // enough cells, too soon
    advance(15_000);
    expect(tracker.onCells(10, 8)).toBe('new-street'); // 5 new since last cue
    advance(20_000);
    expect(tracker.onCells(11, 9)).toBeNull(); // only 1 new
  });

  it('fires reward-reached once, at the threshold', () => {
    const { tracker, advance } = make(25);
    expect(tracker.onCells(24, 0)).toBeNull();
    expect(tracker.onCells(25, 0)).toBe('reward-reached');
    advance(60_000);
    expect(tracker.onCells(40, 0)).toBeNull();
  });

  it('reward counts as a cue for the new-street debounce', () => {
    const { tracker, advance } = make(25);
    expect(tracker.onCells(25, 10)).toBe('reward-reached');
    advance(1_000);
    expect(tracker.onCells(26, 14)).toBeNull();
    advance(20_000);
    expect(tracker.onCells(27, 14)).toBe('new-street'); // 4 new since the reward cue
  });

  it('onFinish: chime unless qualified; silences later cells', () => {
    const a = make();
    expect(a.tracker.onFinish(false)).toBe('walk-done');
    expect(a.tracker.onCells(5, 9)).toBeNull();
    const b = make();
    expect(b.tracker.onFinish(true)).toBeNull();
  });

  it('reset starts a fresh walk', () => {
    const { tracker } = make(25);
    tracker.onCells(25, 0);
    tracker.onFinish(false);
    tracker.reset();
    expect(tracker.onCells(25, 0)).toBe('reward-reached');
  });
});

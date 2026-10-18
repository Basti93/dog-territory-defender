import { act, renderHook } from '@testing-library/react-native';
import { setLocale, t } from '../../i18n';
import { useWalkEndFlow } from '../useWalkEndFlow';
import type { FinishOutcome } from '../useWalkSession';

async function setup(hasMovement: boolean, finishOutcome: FinishOutcome = 'saved') {
  const session = {
    cancelWalk: jest.fn().mockResolvedValue(undefined),
    finishWalk: jest.fn().mockResolvedValue(finishOutcome),
    currentWalkHasMovement: jest.fn(() => hasMovement),
    isFinishing: jest.fn(() => false),
    isTracking: true,
  };
  const goDoorstep = jest.fn();
  const hook = await renderHook(() => useWalkEndFlow(session, goDoorstep));
  return { session, goDoorstep, ...hook };
}

beforeEach(() => setLocale('de'));

describe('cancel from the scene link or the live map', () => {
  it('asks once when the walk has moved; nothing is cancelled until the player says Verwerfen', async () => {
    const { result, session, goDoorstep } = await setup(true);
    await act(async () => result.current.requestCancelWalk());
    expect(result.current.discardPromptOpen).toBe(true);
    expect(session.cancelWalk).not.toHaveBeenCalled();
    expect(goDoorstep).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.cancelWalkNow();
    });
    expect(session.cancelWalk).toHaveBeenCalledTimes(1);
    expect(result.current.discardPromptOpen).toBe(false);
    expect(goDoorstep).toHaveBeenCalledTimes(1);
    expect(result.current.walkEndNote?.text).toBe('Dann eben später!');
  });

  it('"Weiterlaufen" closes the question and touches nothing', async () => {
    const { result, session, goDoorstep } = await setup(true);
    await act(async () => result.current.requestCancelWalk());
    await act(async () => result.current.keepWalking());
    expect(result.current.discardPromptOpen).toBe(false);
    expect(session.cancelWalk).not.toHaveBeenCalled();
    expect(goDoorstep).not.toHaveBeenCalled();
    expect(result.current.walkEndNote).toBeNull();
  });

  it('skips the question for a walk without movement and cancels at once', async () => {
    const { result, session, goDoorstep } = await setup(false);
    await act(async () => result.current.requestCancelWalk());
    expect(result.current.discardPromptOpen).toBe(false);
    expect(session.cancelWalk).toHaveBeenCalledTimes(1);
    expect(goDoorstep).toHaveBeenCalledTimes(1);
  });
});

describe('races with a finish', () => {
  it('a Verwerfen tap while a finish is already running cancels nothing (the walk gets saved)', async () => {
    const { result, session, goDoorstep } = await setup(true);
    await act(async () => result.current.requestCancelWalk());
    expect(result.current.discardPromptOpen).toBe(true);
    session.isFinishing.mockReturnValue(true); // auto-finish fired while the question was open
    await act(async () => {
      await result.current.cancelWalkNow();
    });
    expect(session.cancelWalk).not.toHaveBeenCalled();
    expect(goDoorstep).not.toHaveBeenCalled();
    expect(result.current.walkEndNote).toBeNull();
    expect(result.current.discardPromptOpen).toBe(false);
  });

  it('a cancel link tap while a finish is running does nothing at all', async () => {
    const { result, session } = await setup(false);
    session.isFinishing.mockReturnValue(true);
    await act(async () => result.current.requestCancelWalk());
    expect(session.cancelWalk).not.toHaveBeenCalled();
  });

  it('the question does not come back over the next walk when the first one ended by itself', async () => {
    let tracking = true;
    const session = {
      cancelWalk: jest.fn().mockResolvedValue(undefined),
      finishWalk: jest.fn().mockResolvedValue('saved'),
      currentWalkHasMovement: jest.fn(() => true),
      isFinishing: jest.fn(() => false),
      get isTracking() {
        return tracking;
      },
    };
    const { result, rerender } = await renderHook(() => useWalkEndFlow(session, jest.fn()));
    await act(async () => result.current.requestCancelWalk());
    expect(result.current.discardPromptOpen).toBe(true);
    tracking = false; // auto-finish saved the walk
    await rerender({});
    expect(result.current.discardPromptOpen).toBe(false);
    tracking = true; // the next walk
    await rerender({});
    expect(result.current.discardPromptOpen).toBe(false);
  });
});

describe('Finish', () => {
  it('a saved walk changes nothing here (the homecoming takes over)', async () => {
    const { result, goDoorstep } = await setup(true, 'saved');
    await act(async () => {
      await result.current.finishWalkNow();
    });
    expect(goDoorstep).not.toHaveBeenCalled();
    expect(result.current.walkEndNote).toBeNull();
  });

  it('a discarded walk (no movement) goes home with the gentle note', async () => {
    const { result, goDoorstep } = await setup(false, 'discarded');
    await act(async () => {
      await result.current.finishWalkNow();
    });
    expect(goDoorstep).toHaveBeenCalledTimes(1);
    expect(result.current.walkEndNote?.text).toBe('Noch keine Strecke, nichts zu speichern.');
  });
});

describe('copy', () => {
  it('has no guilt wording, in both languages', () => {
    for (const locale of ['de', 'en'] as const) {
      setLocale(locale);
      for (const key of ['walk.cancelled.line', 'walk.noRoute.line', 'walk.discard.title', 'walk.discard.body'] as const) {
        expect(t(key)).not.toMatch(/leider|schade|failed|sorry|gave up|aufgegeben|verloren|lost/i);
      }
    }
  });
});

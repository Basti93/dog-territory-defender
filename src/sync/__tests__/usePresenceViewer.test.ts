import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { usePresenceViewer } from '../usePresenceViewer';

function setup(initial: string) {
  let handler: (s: string) => void = () => undefined;
  const remove = jest.fn();
  Object.defineProperty(AppState, 'currentState', { value: initial, configurable: true, writable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
    handler = h;
    return { remove };
  }) as never);
  const viewer = { start: jest.fn(), stop: jest.fn() };
  let notify: () => void = () => undefined;
  const engine = {
    subscribe: (l: () => void) => {
      notify = l;
      return () => undefined;
    },
  };
  return { viewer, engine, remove, emit: (s: string) => handler(s), notify: () => notify(), setState: (s: string) => ((AppState as { currentState: string }).currentState = s) };
}

afterEach(() => jest.restoreAllMocks());

describe('usePresenceViewer', () => {
  it('polls only while the app is in front: starts when active, stops (aborting the long-poll) when it leaves', async () => {
    const env = setup('active');
    const { unmount } = await renderHook(() => usePresenceViewer(env.viewer, env.engine));
    expect(env.viewer.start).toHaveBeenCalledTimes(1);
    env.emit('background');
    expect(env.viewer.stop).toHaveBeenCalledTimes(1);
    env.emit('active');
    expect(env.viewer.start).toHaveBeenCalledTimes(2);
    await unmount();
    expect(env.viewer.stop).toHaveBeenCalledTimes(2);
    expect(env.remove).toHaveBeenCalled();
  });

  it('does not start when the app opens in the background', async () => {
    const env = setup('background');
    await renderHook(() => usePresenceViewer(env.viewer, env.engine));
    expect(env.viewer.start).not.toHaveBeenCalled();
  });

  it('a sync status change (e.g. just joined) starts it if the app is in front, and never in the background', async () => {
    const env = setup('active');
    await renderHook(() => usePresenceViewer(env.viewer, env.engine));
    env.viewer.start.mockClear();
    env.notify();
    expect(env.viewer.start).toHaveBeenCalledTimes(1);
    env.setState('background');
    env.notify();
    expect(env.viewer.start).toHaveBeenCalledTimes(1);
  });
});

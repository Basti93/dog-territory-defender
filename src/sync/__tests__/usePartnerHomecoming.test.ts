import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { PartnerWalkAdded } from '../apply';
import { createPartnerHomecomingQueue } from '../partnerHomecoming';
import { usePartnerHomecoming } from '../usePartnerHomecoming';

const walk = (id: string): PartnerWalkAdded => ({ walkId: id, playerId: 'p', name: 'Alex', startTime: 1, treatsEarned: 5, newGroundCellCount: 0, distanceMeters: 900 });

function queueWith(...ids: string[]) {
  const queue = createPartnerHomecomingQueue({ syncNow: async () => undefined, setTimer: () => 0, clearTimer: () => undefined });
  ids.forEach((id) => queue.noteEnded({ walkId: id, name: 'Alex' }));
  queue.noteWalksAdded(ids.map(walk));
  return queue;
}

describe('usePartnerHomecoming', () => {
  it('holds a ready request back while something else is going on (own walk, own homecoming) and releases it afterwards', async () => {
    const queue = queueWith('w1');
    const { result, rerender } = await renderHook(({ canPlay }: { canPlay: boolean }) => usePartnerHomecoming(queue, canPlay), { initialProps: { canPlay: false } });
    expect(result.current.request).toBeNull();
    await rerender({ canPlay: true });
    expect(result.current.request?.walkId).toBe('w1');
  });

  it('done() plays the next one in line, one at a time', async () => {
    const queue = queueWith('w1', 'w2');
    const { result } = await renderHook(() => usePartnerHomecoming(queue, true));
    expect(result.current.request?.walkId).toBe('w1');
    await act(async () => result.current.done());
    expect(result.current.request?.walkId).toBe('w2');
    await act(async () => result.current.done());
    expect(result.current.request).toBeNull();
  });

  it('picks up a request that becomes ready while the scene is already waiting', async () => {
    const queue = createPartnerHomecomingQueue({ syncNow: async () => undefined, setTimer: () => 0, clearTimer: () => undefined });
    const { result } = await renderHook(() => usePartnerHomecoming(queue, true));
    expect(result.current.request).toBeNull();
    await act(async () => {
      queue.noteEnded({ walkId: 'w9', name: 'Alex' });
      queue.noteWalksAdded([walk('w9')]);
    });
    expect(result.current.request?.walkId).toBe('w9');
  });

  it('coming back to the front is a new open: the queue is told once per return', async () => {
    const queue = createPartnerHomecomingQueue({ syncNow: async () => undefined, setTimer: () => 0, clearTimer: () => undefined });
    const noteForeground = jest.spyOn(queue, 'noteForeground');
    let listener: (state: string) => void = () => undefined;
    const add = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (state: string) => void) => {
      listener = fn;
      return { remove: jest.fn() };
    }) as never);
    try {
      await renderHook(() => usePartnerHomecoming(queue, true));
      listener('background');
      listener('active');
      listener('active');
      expect(noteForeground).toHaveBeenCalledTimes(1);
    } finally {
      add.mockRestore();
    }
  });
});

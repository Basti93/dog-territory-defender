// Buddy tap bonus sync: every rewarded tap is persisted at once (`persist` coalesces it into the single unsent
// `den.buddyTaps` outbox row, so a kill or a pull never loses it). Sending is throttled: a sync is kicked at most
// every KICK_MS after the first unsent tap, and when the app goes to the background / comes back (200 commands/day cap).

export const BUDDY_TAP_KICK_MS = 30_000;

export interface BuddyTapBatcher {
  /** Records one rewarded tap that paid `treats`. */
  add(treats: number): void;
  /** Starts the sync now (no-op when no tap is waiting). */
  flush(): void;
}

export function createBuddyTapBatcher(
  persist: (treats: number) => Promise<void>,
  kick: () => void,
  kickMs: number = BUDDY_TAP_KICK_MS,
  onError: (error: unknown) => void = () => {}
): BuddyTapBatcher {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiting = false;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!waiting) return;
    waiting = false;
    kick();
  };

  return {
    add(treats) {
      waiting = true;
      persist(treats).catch(onError);
      if (!timer) timer = setTimeout(flush, kickMs);
    },
    flush,
  };
}

/** Tiny in-memory fixed-window counter. Single API instance in v1, so no shared store is needed. */
export class FixedWindowLimiter {
  private windows = new Map<string, { resetAt: number; count: number }>();
  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Counts one hit; returns false when the limit for this window is exceeded. */
  hit(key: string, now = Date.now()): boolean {
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { resetAt: now + this.windowMs, count: 1 });
      if (this.windows.size > 20000) this.sweep(now);
      return true;
    }
    w.count += 1;
    return w.count <= this.max;
  }

  retryAfterSeconds(key: string, now = Date.now()): number {
    const w = this.windows.get(key);
    return w ? Math.max(1, Math.ceil((w.resetAt - now) / 1000)) : 1;
  }

  private sweep(now: number) {
    for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
  }
}

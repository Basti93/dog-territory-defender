// Repeated-failure IP bans (design Decision 16): 10 failed auths in 10 min = 1 h ban, doubling per
// repeat up to 24 h. Persisted in banned_ips (survives restarts) with an in-memory cache in front.
import { BlockList, isIP } from 'node:net';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { bannedIps } from '../db/schema';

const WINDOW_MS = 10 * 60 * 1000;
const STRIKE_LIMIT = 10;
const BASE_BAN_MS = 60 * 60 * 1000;
const MAX_BAN_MS = 24 * 60 * 60 * 1000;

export class IpBanList {
  private banned = new Map<string, number>(); // ip -> until (ms)
  private failures = new Map<string, number[]>(); // ip -> failure timestamps
  private neverBan = new BlockList();

  constructor(private readonly db: Db, neverBanCidr: string) {
    const [net, bits] = neverBanCidr.split('/');
    if (net && bits && isIP(net)) this.neverBan.addSubnet(net, Number(bits), isIP(net) === 4 ? 'ipv4' : 'ipv6');
  }

  async load(now = Date.now()): Promise<void> {
    let rows: Array<typeof bannedIps.$inferSelect>;
    try {
      rows = await this.db.select().from(bannedIps);
    } catch (err) {
      // Empty database before the first migration: start with no bans instead of crash-looping.
      console.error(JSON.stringify({ level: 'warn', msg: 'banned_ips unreadable, starting with no bans', err: err instanceof Error ? err.message : String(err) }));
      return;
    }
    for (const r of rows) if (r.until.getTime() > now) this.banned.set(r.ip, r.until.getTime());
  }

  private exempt(ip: string): boolean {
    const v = isIP(ip);
    return v === 0 ? true : this.neverBan.check(ip, v === 4 ? 'ipv4' : 'ipv6');
  }

  /** Seconds until the ban lifts, or 0 when not banned. */
  bannedFor(ip: string, now = Date.now()): number {
    const until = this.banned.get(ip);
    if (!until) return 0;
    if (until <= now) {
      this.banned.delete(ip);
      return 0;
    }
    return Math.ceil((until - now) / 1000);
  }

  /** Records a failed auth/join; bans on the 10th within 10 minutes. */
  async strike(ip: string, reason: string, now = Date.now()): Promise<void> {
    if (this.exempt(ip) || this.bannedFor(ip, now) > 0) return;
    const recent = (this.failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    this.failures.set(ip, recent);
    if (this.failures.size > 20000) this.failures.clear();
    if (recent.length < STRIKE_LIMIT) return;

    this.failures.delete(ip);
    const [row] = await this.db.select().from(bannedIps).where(eq(bannedIps.ip, ip));
    const strikes = (row?.strikes ?? 0) + 1;
    const duration = Math.min(MAX_BAN_MS, BASE_BAN_MS * 2 ** (strikes - 1));
    const until = new Date(now + duration);
    await this.db
      .insert(bannedIps)
      .values({ ip, until, strikes, reason })
      .onConflictDoUpdate({ target: bannedIps.ip, set: { until, strikes, reason, updatedAt: new Date(now) } });
    this.banned.set(ip, until.getTime());
  }
}

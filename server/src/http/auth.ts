// Auth seam (design Decision 7): routes only ever see an AuthCtx. Replacing device tokens with an
// identity provider later means writing another Authenticator; routes, commands and tables stay.
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { devices, players } from '../db/schema';
import { sha256Hex } from '../lib/crypto';
import type { AuthCtx } from '../services/walks';

/** `strike: false` = the token was real but is no longer live (revoked device, left player). The
 * response is still the identical 401, but the IP is not counted towards a ban: a phone with a
 * revoked token retries by design and must not get its whole network banned. */
export type AuthResult = { ok: true; auth: AuthCtx } | { ok: false; strike: boolean };

export interface Authenticator {
  /** `authorization` is the raw header value. */
  authenticate(authorization: string | undefined): Promise<AuthResult>;
}

export class DeviceTokenAuthenticator implements Authenticator {
  private lastSeenWritten = new Map<string, number>();

  constructor(private readonly db: Db) {}

  async authenticate(authorization: string | undefined): Promise<AuthResult> {
    if (!authorization || !authorization.startsWith('Bearer ')) return { ok: false, strike: true };
    const token = authorization.slice(7).trim();
    if (token.length < 20 || token.length > 200) return { ok: false, strike: true };
    const rows = await this.db
      .select({
        deviceId: devices.id,
        playerId: devices.playerId,
        householdId: devices.householdId,
        revokedAt: devices.revokedAt,
        leftAt: players.leftAt,
      })
      .from(devices)
      .innerJoin(players, eq(players.id, devices.playerId))
      .where(eq(devices.tokenHash, sha256Hex(token)));
    const row = rows[0];
    if (!row) return { ok: false, strike: true };
    if (row.revokedAt || row.leftAt) return { ok: false, strike: false };
    this.touch(row.deviceId);
    return { ok: true, auth: { deviceId: row.deviceId, playerId: row.playerId, householdId: row.householdId } };
  }

  /** last_seen_at at most once a minute per device, fire and forget. */
  private touch(deviceId: string) {
    const now = Date.now();
    if (now - (this.lastSeenWritten.get(deviceId) ?? 0) < 60_000) return;
    this.lastSeenWritten.set(deviceId, now);
    void this.db.update(devices).set({ lastSeenAt: new Date(now) }).where(eq(devices.id, deviceId)).catch(() => {});
  }
}

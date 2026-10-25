import { and, count, eq, gt, isNull } from 'drizzle-orm';
import type { JoinRequest, JoinResponse, SnapshotResponse } from '@game/sync/apiContract';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { cells, corners, denState, devices, dogs, households, inviteCodes, players, territories, walks } from '../db/schema';
import { initialDenState, applyPassiveAccrual } from '../economy/denTransitions';
import { getMyStats } from './stats';
import { hashInviteCode, newDeviceToken, newInviteCode, sha256Hex } from '../lib/crypto';
import { isValidTimeZone } from '../lib/time';
import { appendEvent, currentSeq, type EventBus } from './events';
import { cellFromRow, cornerFromRow, denFromRow, dogFromRow, lockDen, stripRev, territoryFromRow, walkMetaFromRow, worldMass } from './state';
import type { AuthCtx } from './walks';

// ----------------------------------------------------------- operator side (CLI)

/** Households are born with the founding import already "done" (closed) unless the operator opts in
 * with `allowImport` (CLI `--allow-import`), so only the owner's household can ever be seeded. */
export async function createHousehold(db: Db, name: string, timezone = 'Europe/Berlin', now = Date.now(), allowImport = false) {
  if (!isValidTimeZone(timezone)) throw new Error(`unknown timezone: ${timezone}`);
  return db.transaction(async (tx) => {
    const [h] = await tx.insert(households).values({ name, timezone, foundedImportDone: !allowImport }).returning();
    await tx.insert(denState).values({ householdId: h.id, ...initialDenState(now), rev: 0, updatedAt: now });
    await tx.insert(dogs).values({ householdId: h.id, name: null, appearance: {}, updatedAt: now });
    return h;
  });
}

/** Resolves a household by id or exact name. */
export async function findHousehold(db: Db, idOrName: string) {
  const uuid = /^[0-9a-f-]{36}$/i.test(idOrName);
  const rows = await db
    .select()
    .from(households)
    .where(uuid ? eq(households.id, idOrName) : eq(households.name, idOrName));
  if (rows.length === 0) throw new Error(`no household "${idOrName}"`);
  if (rows.length > 1) throw new Error(`name "${idOrName}" is ambiguous, use the id`);
  return rows[0];
}

/**
 * Returns the plaintext code ONCE; only its hash is stored. With `forPlayerId` it is a restore invite: joining attaches a
 * device to that existing player (new phone or reinstall) instead of creating one. Operator-only, single-use, same TTL.
 */
export async function createInvite(db: Db, householdId: string, ttlMs: number, now = Date.now(), forPlayerId: string | null = null) {
  const code = newInviteCode();
  const expiresAt = new Date(now + ttlMs);
  await db.insert(inviteCodes).values({ codeHash: hashInviteCode(code), householdId, expiresAt, playerId: forPlayerId });
  return { code, expiresAt };
}

/** Resolves an active (not left) player by id, or by exact display name inside `householdId` when given. */
export async function findPlayer(db: Db, idOrName: string, householdId?: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrName);
  // An id plus --household must agree: a restore invite must never be minted for a player of another household.
  const where = isUuid
    ? householdId
      ? and(eq(players.id, idOrName), eq(players.householdId, householdId))
      : eq(players.id, idOrName)
    : householdId
      ? and(eq(players.displayName, idOrName), eq(players.householdId, householdId))
      : undefined;
  if (!where) throw new Error(`player "${idOrName}" needs --household (or pass the player id)`);
  const rows = (await db.select().from(players).where(where)).filter((p) => p.leftAt === null);
  if (rows.length === 0) throw new Error(`no active player "${idOrName}"`);
  if (rows.length > 1) throw new Error(`name "${idOrName}" is ambiguous, use the player id`);
  return rows[0];
}

/**
 * A new device (token) for an EXISTING player: restore after a reinstall, a new phone, and later sign-in on a fresh
 * install. No `member.joined`, no capacity check, consent was stored when the player first joined.
 */
export async function attachDevice(db: Db, playerId: string, label: string) {
  const [player] = await db.select().from(players).where(eq(players.id, playerId));
  if (!player || player.leftAt) throw new RefusedJoin();
  const token = newDeviceToken();
  const [device] = await db
    .insert(devices)
    .values({ householdId: player.householdId, playerId: player.id, label, tokenHash: sha256Hex(token) })
    .returning();
  return { token, device, player };
}

export async function revokeDevice(db: Db, deviceId: string): Promise<boolean> {
  const rows = await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  return rows.length > 0;
}

export async function listHouseholds(db: Db, now = Date.now()) {
  const hs = await db.select().from(households);
  const out = [];
  for (const h of hs) {
    const ps = await db.select().from(players).where(eq(players.householdId, h.id));
    const ds = await db.select().from(devices).where(eq(devices.householdId, h.id));
    const [{ n: openInvites }] = await db
      .select({ n: count() })
      .from(inviteCodes)
      .where(and(eq(inviteCodes.householdId, h.id), isNull(inviteCodes.usedAt), gt(inviteCodes.expiresAt, new Date(now))));
    out.push({ household: h, players: ps, devices: ds, openInvites });
  }
  return out;
}

// ------------------------------------------------------------------- join

class RefusedJoin extends Error {}

export type JoinResult = { kind: 'ok'; response: JoinResponse } | { kind: 'refused' };

/** Every refusal is the same `refused`: callers must not reveal whether the code existed. */
export async function joinHousehold(
  db: Db,
  bus: EventBus,
  config: Config,
  req: JoinRequest,
  now: number
): Promise<JoinResult> {
  const codeHash = hashInviteCode(req.code);
  const token = newDeviceToken();
  let result: JoinResult & { householdId?: string };
  try {
    result = await db.transaction(async (tx): Promise<JoinResult & { householdId?: string }> => {
    const dbx = tx as unknown as Db;
    // Atomic single-use: only one concurrent join can flip used_at.
    const claimed = await dbx
      .update(inviteCodes)
      .set({ usedAt: new Date(now) })
      .where(and(eq(inviteCodes.codeHash, codeHash), isNull(inviteCodes.usedAt), gt(inviteCodes.expiresAt, new Date(now))))
      .returning();
    if (claimed.length === 0) return { kind: 'refused' };
    const invite = claimed[0];

    if (invite.playerId) {
      // Restore invite: a device for the existing player; nothing joins, nothing is counted, the player keeps their name.
      const { token: restoredToken, device, player } = await attachDevice(dbx, invite.playerId, req.deviceLabel);
      // Bound to the invite's household: a row that ever disagrees (manual SQL) is refused and rolled back, code not burned.
      if (player.householdId !== invite.householdId) throw new RefusedJoin();
      await dbx.update(inviteCodes).set({ usedByPlayerId: player.id }).where(eq(inviteCodes.codeHash, codeHash));
      const [h] = await dbx.select().from(households).where(eq(households.id, player.householdId));
      return {
        kind: 'ok',
        householdId: h.id,
        response: {
          token: restoredToken,
          householdId: h.id,
          householdName: h.name,
          playerId: player.id,
          deviceId: device.id,
          serverTime: now,
          seq: await currentSeq(dbx, h.id),
          restored: true,
          playerName: player.displayName,
        },
      };
    }

    // Same den lock as walks/commands/import: keeps events.seq monotonic per household
    // (bigserial values are handed out at insert, commit order could otherwise differ).
    await lockDen(dbx, invite.householdId);
    const [household] = await dbx.select().from(households).where(eq(households.id, invite.householdId));
    const [{ n }] = await dbx
      .select({ n: count() })
      .from(players)
      .where(and(eq(players.householdId, household.id), isNull(players.leftAt)));
    if (n >= config.householdMaxPlayers) {
      throw new RefusedJoin(); // rolls back, so the invite is not burned by a full household
    }
    if (n === 0 && req.timezone && isValidTimeZone(req.timezone)) {
      await dbx.update(households).set({ timezone: req.timezone }).where(eq(households.id, household.id));
    }

    const [player] = await dbx
      .insert(players)
      .values({ householdId: household.id, displayName: req.playerName, consentedAt: new Date(now) })
      .returning();
    const [device] = await dbx
      .insert(devices)
      .values({ householdId: household.id, playerId: player.id, label: req.deviceLabel, tokenHash: sha256Hex(token) })
      .returning();
    await dbx.update(inviteCodes).set({ usedByPlayerId: player.id }).where(eq(inviteCodes.codeHash, codeHash));
    await appendEvent(dbx, household.id, 'member.joined', player.id, {
      player: { id: player.id, displayName: player.displayName, joinedAt: now },
    });
    return {
      kind: 'ok',
      householdId: household.id,
      response: {
        token,
        householdId: household.id,
        householdName: household.name,
        playerId: player.id,
        deviceId: device.id,
        serverTime: now,
        seq: await currentSeq(dbx, household.id),
      },
    };
    });
  } catch (err) {
    if (err instanceof RefusedJoin) return { kind: 'refused' };
    throw err;
  }
  if (result.kind === 'ok' && !result.response.restored) bus.notify(result.householdId!);
  return result.kind === 'ok' ? { kind: 'ok', response: result.response } : { kind: 'refused' };
}

// --------------------------------------------------------------- snapshot

export async function buildSnapshot(db: Db, auth: AuthCtx, now: number): Promise<SnapshotResponse> {
  const hid = auth.householdId;
  // repeatable-read-ish consistency is unnecessary: seq is read FIRST, so at worst the client re-applies an event.
  const seq = await currentSeq(db, hid);
  const [household] = await db.select().from(households).where(eq(households.id, hid));
  const ps = await db.select().from(players).where(and(eq(players.householdId, hid), isNull(players.leftAt)));
  const me = ps.find((p) => p.id === auth.playerId);
  const [dog] = await db.select().from(dogs).where(eq(dogs.householdId, hid));
  const [denRow] = await db.select().from(denState).where(eq(denState.householdId, hid));
  const cellRows = await db.select().from(cells).where(and(eq(cells.householdId, hid), eq(cells.generated, false)));
  const territoryRows = await db.select().from(territories).where(eq(territories.householdId, hid));
  const cornerRows = await db.select().from(corners).where(eq(corners.householdId, hid));
  const walkRows = await db
    .select({
      householdId: walks.householdId,
      id: walks.id,
      playerId: walks.playerId,
      startTime: walks.startTime,
      startSource: walks.startSource,
      closed: walks.closed,
      newGroundCellIds: walks.newGroundCellIds,
      metNeighbourIds: walks.metNeighbourIds,
      treatsEarned: walks.treatsEarned,
      reward: walks.reward,
      deletedAt: walks.deletedAt,
      createdAt: walks.createdAt,
      statsVersion: walks.statsVersion,
      statsEndTime: walks.statsEndTime,
      statsDistanceM: walks.statsDistanceM,
      statsExcluded: walks.statsExcluded,
    })
    .from(walks)
    .where(and(eq(walks.householdId, hid), eq(walks.generated, false)))
    .orderBy(walks.startTime);

  const myStats = await getMyStats(db, auth.playerId);
  const den = denFromRow(denRow);
  const { rev } = den;
  const projected = applyPassiveAccrual(stripRev(den), now, await worldMass(db, hid));

  return {
    serverTime: now,
    seq,
    household: { id: household.id, name: household.name, timezone: household.timezone },
    me: { playerId: auth.playerId, deviceId: auth.deviceId, displayName: me?.displayName ?? '' },
    players: ps.map((p) => ({ id: p.id, displayName: p.displayName, joinedAt: p.createdAt.getTime() })),
    dog: dogFromRow(dog),
    den: { ...projected, rev },
    cells: cellRows.map(cellFromRow),
    territories: territoryRows.map(territoryFromRow),
    walks: walkRows.map(walkMetaFromRow),
    corners: cornerRows.map(cornerFromRow),
    ...(myStats ? { myStats } : {}),
  };
}


// Idempotent economy commands (design Decision 1). Stored in economy_commands; a replay returns the
// stored outcome and never re-executes. All of them run under the household's den_state row lock.
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { CommandRequest, CommandResponse, CommandErrorCode } from '@game/sync/apiContract';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { corners, dogs, economyCommands, gifts, households, players, territories, walks } from '../db/schema';
import { canonicalJson } from '../lib/canonicalJson';
import { dayKeyInZone, sameLocalDay } from '../lib/time';
import { applyBuddyTaps, giftRoom, applyPassiveAccrual, harvestAt, upgradeBuilding } from '../economy/denTransitions';
import { appendEvent, currentSeq, type EventBus } from './events';
import { denFromRow, dogFromRow, lockDen, saveDen, stripRev, territoryFromRow, worldMass } from './state';
import type { AuthCtx } from './walks';

export type CommandResult = { kind: 'ok'; response: CommandResponse } | { kind: 'conflict' } | { kind: 'capped' };

interface Outcome {
  ok: boolean;
  error?: CommandErrorCode;
  dogChanged?: boolean;
}

export async function runCommand(
  db: Db,
  bus: EventBus,
  config: Config,
  auth: AuthCtx,
  req: CommandRequest,
  now: number
): Promise<CommandResult> {
  const result = await db.transaction(async (tx): Promise<CommandResult & { mutated?: boolean }> => {
    const dbx = tx as unknown as Db;
    const hid = auth.householdId;
    const denRow = await lockDen(dbx, hid);

    const [existing] = await dbx
      .select()
      .from(economyCommands)
      .where(and(eq(economyCommands.householdId, hid), eq(economyCommands.clientId, req.clientId)));
    if (existing) {
      if (canonicalJson(existing.request) !== canonicalJson(req.command)) return { kind: 'conflict' };
      const stored = existing.result as Outcome;
      const [dogRow] = await dbx.select().from(dogs).where(eq(dogs.householdId, hid));
      return {
        kind: 'ok',
        response: {
          clientId: req.clientId,
          ok: stored.ok,
          ...(stored.error ? { error: stored.error } : {}),
          replayed: true,
          den: denFromRow(denRow), // always current, never the old snapshot
          ...(stored.dogChanged && dogRow ? { dog: dogFromRow(dogRow) } : {}),
          serverTime: now,
          seq: await currentSeq(dbx, hid),
        },
      };
    }

    // Daily cap counts the household-local calendar day (same day key as the reward multiplier).
    const [{ timezone }] = await dbx.select({ timezone: households.timezone }).from(households).where(eq(households.id, hid));
    const [{ recent }] = await dbx
      .select({ recent: sql<number>`count(*)::int` })
      .from(economyCommands)
      .where(and(eq(economyCommands.householdId, hid), sameLocalDay(economyCommands.createdAt, timezone, now)));
    if (recent >= config.limits.commandsPerDayPerHousehold) return { kind: 'capped' };

    const cmd = req.command;
    let den = denFromRow(denRow);
    let outcome: Outcome = { ok: true };
    let dogApi;

    switch (cmd.kind) {
      case 'den.upgrade': {
        const accrued = applyPassiveAccrual(stripRev(den), now, await worldMass(dbx, hid));
        const upgraded = upgradeBuilding(accrued, cmd.building);
        if ('error' in upgraded) {
          outcome = { ok: false, error: upgraded.error };
          den = { ...accrued, rev: den.rev }; // projection only, not persisted
        } else {
          den = await saveDen(dbx, hid, denRow.rev, upgraded, now);
          await appendEvent(dbx, hid, 'den.updated', auth.playerId, { den });
        }
        break;
      }
      case 'den.claim': {
        const accrued = applyPassiveAccrual(stripRev(den), now, await worldMass(dbx, hid));
        den = await saveDen(dbx, hid, denRow.rev, accrued, now);
        await appendEvent(dbx, hid, 'den.updated', auth.playerId, { den });
        break;
      }
      case 'den.harvest': {
        // `at` is when the player tapped (maybe offline): never before the watermark, never in the future.
        const at = Math.min(now, Math.max(den.lastTickAt, Math.round(cmd.at)));
        const harvested = harvestAt(stripRev(den), at, await worldMass(dbx, hid));
        den = await saveDen(dbx, hid, denRow.rev, harvested, now);
        await appendEvent(dbx, hid, 'den.updated', auth.playerId, { den });
        break;
      }
      case 'den.buddyTaps': {
        // Phones credited their taps locally; this trims to the household day's 30 and to the cap. Never an error.
        const accrued = applyPassiveAccrual(stripRev(den), now, await worldMass(dbx, hid));
        const next = applyBuddyTaps(accrued, dayKeyInZone(now, timezone), cmd.taps, cmd.treats);
        den = await saveDen(dbx, hid, denRow.rev, next, now);
        await appendEvent(dbx, hid, 'den.updated', auth.playerId, { den });
        break;
      }
      case 'dog.update': {
        const patch: Partial<typeof dogs.$inferInsert> = { updatedAt: now };
        if (cmd.name !== undefined) patch.name = cmd.name;
        if (cmd.appearance !== undefined) patch.appearance = cmd.appearance;
        const [row] = await dbx.update(dogs).set(patch).where(eq(dogs.householdId, hid)).returning();
        dogApi = dogFromRow(row);
        outcome = { ok: true, dogChanged: true };
        await appendEvent(dbx, hid, 'dog.updated', auth.playerId, { dog: dogApi });
        break;
      }
      case 'walk.delete': {
        // Soft delete only: the cells this walk painted stay (the shared Range never shrinks).
        const [row] = await dbx
          .update(walks)
          .set({ deletedAt: new Date(now) })
          .where(and(eq(walks.householdId, hid), eq(walks.id, cmd.walkId), isNull(walks.deletedAt)))
          .returning();
        if (!row) {
          outcome = { ok: false, error: 'not-found' };
        } else {
          await appendEvent(dbx, hid, 'walk.deleted', auth.playerId, { walkId: cmd.walkId });
        }
        break;
      }
      case 'player.rename': {
        const name = cmd.name.trim();
        const [row] = await dbx
          .update(players)
          .set({ displayName: name })
          .where(and(eq(players.id, auth.playerId), eq(players.householdId, hid)))
          .returning();
        if (!row) {
          outcome = { ok: false, error: 'not-found' };
        } else {
          await appendEvent(dbx, hid, 'member.updated', auth.playerId, {
            player: { id: row.id, displayName: row.displayName, joinedAt: row.createdAt.getTime() },
          });
        }
        break;
      }
      case 'corner.name': {
        // Last writer wins; the first writer is kept as created_by. Detection is on the phones, so the id is trusted
        // (format-checked by the schema) and an unknown corner simply becomes known here.
        const name = cmd.name.trim();
        await dbx
          .insert(corners)
          .values({ householdId: hid, cornerId: cmd.cornerId, name, createdBy: auth.playerId, updatedBy: auth.playerId, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: [corners.householdId, corners.cornerId], set: { name, updatedBy: auth.playerId, updatedAt: now } });
        await appendEvent(dbx, hid, 'corner.updated', auth.playerId, {
          corner: { id: cmd.cornerId, name, updatedBy: auth.playerId, updatedAt: now },
        });
        break;
      }
      case 'territory.name': {
        // By id, or by the walk that promoted it (the phone only knows the walk right after the homecoming).
        let territoryId = cmd.territoryId ?? null;
        if (!territoryId && cmd.fromWalkId) {
          const [walk] = await dbx.select({ reward: walks.reward }).from(walks).where(and(eq(walks.householdId, hid), eq(walks.id, cmd.fromWalkId)));
          territoryId = (walk?.reward as { newTerritoryId?: string } | undefined)?.newTerritoryId ?? null;
        }
        const [row] = territoryId
          ? await dbx
              .update(territories)
              .set({ name: cmd.name.trim() })
              .where(and(eq(territories.householdId, hid), eq(territories.id, territoryId)))
              .returning()
          : [];
        if (!row) {
          outcome = { ok: false, error: 'not-found' };
        } else {
          await appendEvent(dbx, hid, 'territory.changed', auth.playerId, { upserted: [territoryFromRow(row)], removedIds: [] });
        }
        break;
      }
      case 'gift.open': {
        // First opener wins; later opens (other phone, other player) are ok and credit nothing.
        // The sprinkle goes straight into the Den: not through the reward formulas, so no Beginner's Luck,
        // no multipliers and outside the +30% power budget (anti-snowball delta, design Decision 20).
        const [gift] = await dbx.select().from(gifts).where(and(eq(gifts.hostHouseholdId, hid), eq(gifts.id, cmd.giftId)));
        if (!gift) {
          outcome = { ok: false, error: 'not-found' };
          break;
        }
        if (gift.openedAt === null) {
          await dbx.update(gifts).set({ openedAt: now, openedByPlayerId: auth.playerId }).where(eq(gifts.id, gift.id));
          if (gift.sprinkleTreats) {
            const accrued = applyPassiveAccrual(stripRev(den), now, await worldMass(dbx, hid));
            den = await saveDen(dbx, hid, denRow.rev, { ...accrued, treats: Math.max(accrued.treats, Math.min(accrued.treats + gift.sprinkleTreats, giftRoom(accrued))) }, now);
            await appendEvent(dbx, hid, 'den.updated', auth.playerId, { den });
          }
        }
        break;
      }
    }

    await dbx.insert(economyCommands).values({
      householdId: hid,
      clientId: req.clientId,
      kind: cmd.kind,
      playerId: auth.playerId,
      request: cmd,
      result: outcome,
    });

    return {
      kind: 'ok',
      mutated: true,
      response: {
        clientId: req.clientId,
        ok: outcome.ok,
        ...(outcome.error ? { error: outcome.error } : {}),
        replayed: false,
        den,
        ...(dogApi ? { dog: dogApi } : {}),
        serverTime: now,
        seq: await currentSeq(dbx, hid),
      },
    };
  });

  if (result.kind === 'ok' && !result.response.replayed) bus.notify(auth.householdId);
  return result;
}
